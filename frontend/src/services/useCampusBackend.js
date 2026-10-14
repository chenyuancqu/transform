import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';

const EMPTY = { epoch: 'unconnected', seq: 0, rover: { x: .5, y: .5, z: 0 }, uavs: [], orders: [],
  stats: {}, health: {}, events: [], running: false, speed: .7, elapsedSeconds: 0 };
const POSE = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const PHASES = ['idle','takingOff', 'cruising', 'approaching', 'aligning', 'picking', 'returning', 'waitingDock', 'unloading', 'clearingBay','parking'];

export function decodeSnapshot(data) {
  if (data?.schema_version !== 1 || data.coordinate_system !== 'campus_meters_xy_height'
      || typeof data.epoch !== 'string' || !Number.isInteger(data.seq) || !Number.isFinite(data.timestamp)
      || !POSE(data.rover?.position) || (data.rover.heading!=null&&!Number.isFinite(data.rover.heading))
      || (data.docking!=null&&(!Array.isArray(data.docking.queue)||new Set(data.docking.queue).size!==data.docking.queue.length||data.docking.queue.some(i=>![1,2,3].includes(i))
        ||(data.docking.owner!=null&&!data.docking.queue.includes(data.docking.owner))||!Number.isFinite(data.docking.hatchProgress)||data.docking.hatchProgress<0||data.docking.hatchProgress>1))
      || !Array.isArray(data.uavs) || data.uavs.length !== 3
      || new Set(data.uavs.map(u => u.id)).size !== 3 || !Array.isArray(data.orders) || data.orders.length !== 8
      || new Set(data.orders.map(o => o.id)).size !== 8 || typeof data.running !== 'boolean'
      || !Number.isFinite(data.speed) || data.speed < .3 || data.speed > 2
      || !data.stats || !data.health || !Array.isArray(data.events)
      || !data.uavs.every(u => [1, 2, 3].includes(u.id) && POSE(u.position) && Number.isFinite(u.battery)
        && u.battery >= 0 && u.battery <= 1 && PHASES.includes(u.phase)
        && Number.isFinite(u.pickupProgress) && u.pickupProgress >= 0 && u.pickupProgress <= 1
        && Number.isFinite(u.unloadProgress) && u.unloadProgress >= 0 && u.unloadProgress <= 1
        && (u.retractProgress==null||(Number.isFinite(u.retractProgress)&&u.retractProgress>=0&&u.retractProgress<=1)))
      || !data.orders.every(o => Number.isInteger(o.id) && o.id >= 1 && o.id <= 8 && POSE(o.position) && typeof o.completed === 'boolean')) {
    throw new Error('后端快照格式或坐标单位不匹配');
  }
  // Rendering adapter only: no mission assignment, inference or arrival calculation.
  const adapt = p => ({ ...p, x: (p.position[0] + 100) / 200, y: (p.position[1] + 100) / 200, z: p.position[2] / 50 });
  return { ...data, rover: adapt(data.rover), uavs: data.uavs.map(adapt).sort((a, b) => a.id - b.id), orders: data.orders.map(adapt).sort((a, b) => a.id - b.id) };
}

export function interpolateSnapshots(a, b, t) {
  if (!a || a.epoch !== b.epoch || t >= 1) return b;
  const pose = (p, q) => ({ ...p, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
  const yaw = (p,q) => p + Math.atan2(Math.sin(q-p),Math.cos(q-p))*t;
  return { ...a, docking:a.docking&&b.docking?{...a.docking,hatchProgress:a.docking.hatchProgress+(b.docking.hatchProgress-a.docking.hatchProgress)*t}:a.docking,
    rover: {...pose(a.rover, b.rover),heading:yaw(a.rover.heading||0,b.rover.heading||0)}, uavs: a.uavs.map((u, i) => ({ ...pose(u, b.uavs[i]),
    pickupProgress: u.phase === b.uavs[i].phase ? u.pickupProgress + (b.uavs[i].pickupProgress - u.pickupProgress) * t : u.pickupProgress,
    retractProgress:u.phase===b.uavs[i].phase?(u.retractProgress||0)+((b.uavs[i].retractProgress||0)-(u.retractProgress||0))*t:u.retractProgress,
    unloadProgress: u.phase === b.uavs[i].phase ? u.unloadProgress + (b.uavs[i].unloadProgress - u.unloadProgress) * t : u.unloadProgress })) };
}

export function isNewSnapshot(next, previous) {
  return !(next.timestamp < previous.timestamp || (next.epoch === previous.epoch && next.seq <= previous.seq));
}

export function useCampusBackend() {
  const clientRef = useRef();
  const buffer = useRef([]);
  const latest = useRef(EMPTY);
  const receivedAt = useRef(0);
  const visualUAVs = useRef({});
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [connection, setConnection] = useState('connecting');
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('等待本机后端连接');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState({});
  const pendingRef = useRef({});
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const url = import.meta.env.VITE_MQTT_URL || 'ws://127.0.0.1:8083/mqtt';
    const client = mqtt.connect(url, { clientId: `digital_twin_frontend_${crypto.randomUUID()}`, reconnectPeriod: 2000,
      connectTimeout: 5000, clean: true, queueQoSZero: false, protocolVersion: 4 });
    clientRef.current = client;
    client.on('connect', () => {
      setConnection('connected');
      client.subscribe(['simulation/state/#', 'simulation/action/#', 'simulation/command/agent',
        'simulation/snapshot', 'simulation/backend/status', 'simulation/command/result', 'simulation/agent/status'], { qos: 1 });
    });
    client.on('offline', () => setConnection('offline'));
    client.on('error', () => setConnection('offline'));
    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        if (topic === 'simulation/snapshot') {
          const next = decodeSnapshot(data);
          if (!isNewSnapshot(next, latest.current)) return;
          if (next.epoch !== latest.current.epoch) { buffer.current = []; visualUAVs.current = {}; }
          receivedAt.current = Date.now();
          latest.current = next;
          setNotice(previous => previous === '等待本机后端连接' ? '后端已就绪 · 可开始任务或选择预设调度' : previous);
          buffer.current.push(next);
          buffer.current = buffer.current.slice(-20);
          setError('');
        } else if (topic === 'simulation/backend/status') {
          setBackendOnline(data.online === true);
          if (!data.online) receivedAt.current = 0;
        } else if (topic === 'simulation/command/result' || topic === 'simulation/agent/status') {
          if (data.request_id && pendingRef.current[data.request_id]) {
            const waiting = pendingRef.current[data.request_id];
            if (data.status === 'parsing') {
              setMessages(previous => previous.map(m => m.id === data.request_id ? { ...m, result: data.message } : m));
              return;
            }
            clearTimeout(waiting.timer);
            delete pendingRef.current[data.request_id];
            setPending({ ...pendingRef.current });
            setNotice(data.message);
            if (waiting.chat) setMessages(previous => previous.map(m => m.id === data.request_id ?
              { ...m, result: data.message, ok: data.ok ?? false, command: data.command } : m));
          }
        }
        // Individual telemetry/actions are subscribed for protocol compatibility.
        // The coherent snapshot is the only rendering source; don't apply raw actions to positions.
      } catch {
        if (topic === 'simulation/snapshot') setError('收到不兼容的后端数据，请检查联调协议');
      }
    });
    const timer = setInterval(() => {
      const frames = buffer.current;
      if (!frames.length) return;
      const time = Date.now() - 160;
      let a = frames[0], b = frames[0];
      for (const frame of frames) { if (frame.timestamp <= time) a = frame; if (frame.timestamp >= time) { b = frame; break; } b = frame; }
      const t = b.timestamp > a.timestamp ? Math.max(0, Math.min(1, (time - a.timestamp) / (b.timestamp - a.timestamp))) : 1;
      const render = interpolateSnapshots(a, b, t);
      const stale = Date.now() - receivedAt.current > 1800 || Date.now() - latest.current.timestamp > 1800;
      setSnapshot(stale ? { ...render, running: false } : render);
    }, 50);
    return () => {
      alive.current = false;
      clearInterval(timer);
      Object.values(pendingRef.current).forEach(p => clearTimeout(p.timer));
      client.end(true);
    };
  }, []);

  const online = connection === 'connected' && backendOnline && Date.now() - receivedAt.current < 1800
    && Date.now() - latest.current.timestamp < 1800 && !error && snapshot.health.online;
  const send = (topic, data, chatText) => {
    if (!online || !clientRef.current?.connected) { setNotice('后端离线，指令未发送'); return; }
    const request_id = crypto.randomUUID();
    if (chatText) setMessages(previous => [...previous.slice(-9), { id: request_id, text: chatText, result: '等待后端确认…' }]);
    const timer = setTimeout(() => {
      delete pendingRef.current[request_id];
      if (!alive.current) return;
      setPending({ ...pendingRef.current });
      setNotice('指令确认超时，请检查后端状态');
      if (chatText) setMessages(previous => previous.map(m => m.id === request_id ? { ...m, unknown: true, result: '后端确认超时，执行状态尚未确认，请查看设备状态' } : m));
    }, topic.endsWith('/input') ? 35000 : 8000);
    pendingRef.current[request_id] = { timer, chat: !!chatText };
    setPending({ ...pendingRef.current });
    clientRef.current.publish(topic, JSON.stringify({ ...data, request_id }), { qos: 1, retain: false });
  };
  if (import.meta.env.DEV) window.__campusMission = { state: snapshot, visualUAVs: visualUAVs.current, online: !!online };
  return { snapshot, online: !!online, connection, error, loading: !online, running: snapshot.running && !!online,
    speed: snapshot.speed, visualUAVs, message: notice, pending, messages,
    start: () => send('simulation/control', { action: 'start' }), pause: () => send('simulation/control', { action: 'pause' }),
    reset: () => send('simulation/control', { action: 'reset' }),
    setSpeed: value => send('simulation/control', { action: 'speed', value }),
    dispatch: (command, label) => send('simulation/command/agent', { ...command, source: 'preset' }, label),
    chat: text => send('simulation/command/input', { text, epoch: latest.current.epoch }, text) };
}
