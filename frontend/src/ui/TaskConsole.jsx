import React, { useEffect, useState } from 'react';
import { businessToWorld } from '../rendering/CoordinateSystem.js';
import { V2WaveSummary, V2Diagnostics } from './V2DispatchPanel.jsx';

const PHASE = { idle: '待命', docked: '母车待命', charging: '母车补能', takingOff:'从母车起飞',cruising: '前往目标', approaching: '减速对准', aligning: '稳定悬停', picking: '订单取货', returning: '携货返航', waitingDock:'排队返航', unloading: '母车回收',clearingBay:'吊具回收',parking:'返回母车', holding:'坐标悬停' };
const QUERY = { order_count: '订单数量', order_detail: '订单详情', fleet_status: '设备状态', metrics: '运行指标', position: '设备位置' };
const ORDER = { waiting: '待分配', enroute: '前往取件', approaching: '减速对准', aligning: '稳定悬停', picking: '装载中', collected: '返航中', delivered: '已回收' };
const format = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const devicePhase = unit => PHASE[unit.phase] || '待命';
const PRESETS = [
  { label: '常规取件', description: '全园区 · 3 架无人机', command: { action_type: 'dispatch', target_area: null, priority: 'normal', energy_limit: null, assign_agents: ['all'] } },
  { label: 'B 区加急', description: 'B 区 · UAV 1 / 3', command: { action_type: 'dispatch', target_area: 'B', priority: 'urgent', energy_limit: null, assign_agents: ['uav_1', 'uav_3'] } },
  { label: '节能调度', description: '降低返航与引导速度', command: { action_type: 'optimize_energy', target_area: null, priority: 'normal', energy_limit: 75, assign_agents: ['all'] } }
];

function DeviceIcon({drone=false}){
  return <svg viewBox="0 0 42 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{drone?<><path d="M15 14l-7-7m19 7l7-7M15 19l-7 6m19-6l7 6M17 12h8l3 7-4 4h-6l-4-4z"/><ellipse cx="7" cy="6" rx="6" ry="2.4"/><ellipse cx="35" cy="6" rx="6" ry="2.4"/><ellipse cx="7" cy="26" rx="6" ry="2.4"/><ellipse cx="35" cy="26" rx="6" ry="2.4"/><path d="M18 16h6"/></>:<><path d="M5 23V11l4-5h23l5 5v12H5zM6 11h30M14 12v10m14-10v10M8 16h3m20 0h3"/><path d="M11 6h20l3 5H8z" fill="#7b5a6b33"/><circle cx="12" cy="24" r="3.5" fill="#5a414b"/><circle cx="31" cy="24" r="3.5" fill="#5a414b"/><path d="M17 18h7"/></>}</svg>;
}

function ActionVector({values, mother=false}){
  const axes = mother ? ['ΔX', 'ΔY'] : ['ΔX', 'ΔY', 'ΔH'];
  if (!Array.isArray(values) || !values.length) return <div className="action-empty">等待模型动作输出</div>;
  return <div className="action-vector">{axes.map((axis, index) => {
    const value = Number.isFinite(values[index]) ? Math.max(-1, Math.min(1, values[index])) : 0;
    const width = `${Math.abs(value) * 50}%`;
    return <div className="action-vector-item" key={axis}><b>{axis}</b><span className="action-bar"><i className={value < 0 ? 'negative' : ''} style={{ width, left: value < 0 ? `${50 - Math.abs(value) * 50}%` : '50%' }} /></span><em>{value >= 0 ? '+' : ''}{value.toFixed(2)}</em></div>;
  })}</div>;
}

function CommandDetails({ command }) {
  if (command.action_type === 'query_status') return <dl><dt>查询类型</dt><dd>{QUERY[command.query_type] || '运行状态'}</dd>{command.query_order_id && <><dt>订单号</dt><dd>{command.query_order_id}</dd></>}{command.query_agent_id && <><dt>设备</dt><dd>{command.query_agent_id}</dd></>}</dl>;
  return <dl><dt>目标区域</dt><dd>{command.target_area ? `${command.target_area} 区` : '全园区'}</dd><dt>指派设备</dt><dd>{command.assign_agents?.join(' / ')}</dd><dt>优先级</dt><dd>{command.priority === 'urgent' ? '加急' : '常规'}</dd>{command.order_ids?.length > 0 && <><dt>指定订单</dt><dd>{command.order_ids.join(' / ')}</dd></>}{command.target_position?.length === 3 && <><dt>目标坐标</dt><dd>({command.target_position.join(', ')})m</dd></>}</dl>;
}

export function TaskConsole({ simulation: sim, focus, selectedAgentId, onSelectAgent }) {
  const { snapshot: state, online } = sim;
  const v2 = state.dispatch?.version === 2;
  const [text, setText] = useState('');
  const [diagnostics, setDiagnostics] = useState(false);
  const [dispatchOpen,setDispatchOpen]=useState(false);
  const [parcelsOpen,setParcelsOpen]=useState(false);
  const [speedDraft, setSpeedDraft] = useState(null);
  const [orderToast, setOrderToast] = useState(null);
  const busy = Object.keys(sim.pending).length > 0;
  const stats = state.stats;
  const orderCount = state.orders.length;
  const deliveredOrders = stats.deliveredOrders ?? 0;
  const canSetBatteryMode = online && !busy && !sim.running && stats.stepCount === 0;
  const waitingForNewOrder = state.dispatch?.stage === 'waitingOrders' || (state.stats.orderStreamActive && state.events.at(-1)?.text?.includes('等待新订单到达'));
  const latestEvent = state.events.at(-1);
  const latestEventKey = latestEvent ? `${state.epoch}:${latestEvent.time}:${latestEvent.text}` : '';
  useEffect(() => {
    if (!latestEvent?.text?.startsWith('新订单')) return undefined;
    setOrderToast(latestEvent.text);
    const timer = window.setTimeout(() => setOrderToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [latestEventKey]);
  const finished = !sim.running && !state.stats.orderStreamActive && orderCount > 0 && deliveredOrders >= orderCount && state.uavs.every(u=>u.phase==='docked')&&!(state.docking?.hatchProgress>0);
  const initialNotice = sim.message.startsWith('后端已就绪') || sim.message === '等待本机后端连接';
  const statusText = state.emergencyReturn ? '紧急返航中 · 无人机正在返回母车，订单进度已保留'
    : finished ? `任务完成 · ${orderCount}/${orderCount} 单已回收至母车`
    : waitingForNewOrder ? (sim.running ? '订单流运行中 · 等待新订单到达' : '订单流已暂停 · 等待继续')
    : orderCount > 0 && deliveredOrders >= orderCount ? (sim.running?'订单已回收 · 正在离舱归位与关舱':'已暂停 · 待完成离舱归位与关舱')
    : initialNotice && stats.stepCount > 0 && sim.running ? `任务执行中 · 后端推理 ${state.health.inferenceCount ?? '—'} 批 · ${format(state.health.inferenceMs, 2)} ms / 批`
    : !sim.running && stats.stepCount > 0 ? (state.events.at(-1)?.text?.startsWith('本次调度范围') ? state.events.at(-1).text : '任务已暂停 · 位置与装卸动作保持')
    : sim.message;
  const locate = p => {
    const world = businessToWorld(p.x, p.y, p.z);
    const objectId = p.phase ? `device-uav-${p.id}` : p === state.rover ? 'device-rover' : undefined;
    focus([world.x, world.y, world.z], objectId);
    onSelectAgent?.(p.phase ? `uav-${p.id}` : p === state.rover ? 'mother' : p.reservedBy ? `uav-${p.reservedBy}` : null);
  };
  const stages = [
    { title: '订单准备', value: `${orderCount || '—'} 个订单`, done: orderCount > 0 },
    { title: '设备执行', value: sim.running ? '运行中' : finished ? '已结束' : '待命 / 暂停', done: sim.running || stats.stepCount > 0 },
    { title: '无人机取货', value: `${stats.completedOrders ?? '—'} / ${orderCount || '—'}`, done: stats.completedOrders > 0 },
    { title: '订单完成', value: `${deliveredOrders} / ${orderCount || '—'}`, done: deliveredOrders > 0 }
  ];
  const algorithmUnits = [{ key: 'mother', label: 'MOTHER', unit: state.rover }, ...state.uavs.map(unit => ({ key: `uav_${unit.id}`, label: `UAV ${String(unit.id).padStart(2, '0')}`, unit }))];
  const coordinate = unit => Array.isArray(unit?.position) ? `X ${format(unit.position[0], 1)} · Y ${format(unit.position[1], 1)} · H ${format(unit.position[2], 1)}m` : '等待坐标';
  const observationText = values => Array.isArray(values) ? values.map(value => format(value, 2)).join('  ') : '等待观测';
  const targetError = (unit, target) => {
    if (!Array.isArray(unit?.position) || !Array.isArray(target?.position)) return '等待目标误差';
    const dx = target.position[0] - unit.position[0], dy = target.position[1] - unit.position[1], dh = target.position[2] - unit.position[2];
    return `水平 ${Math.hypot(dx, dy).toFixed(1)}m · 高差 ${dh >= 0 ? '+' : ''}${dh.toFixed(1)}m`;
  };
  return <div className={`task-console ${dispatchOpen?'dispatch-open':''}`}>
    <header className="console-header">
      <div className="console-brand"><i>◈</i><div><strong>NEXUS {v2?'V2 · PPO 协同调度':'· 空地协同调度平台'}</strong><small>{v2?'LEARNED DISPATCH / CAMPUS DEMO':'SMART CAMPUS / DIGITAL TWIN'}</small></div></div>
      <button className="dispatch-toggle" aria-expanded={dispatchOpen} onClick={()=>{ if (!dispatchOpen && diagnostics) setDiagnostics(false); setDispatchOpen(!dispatchOpen); }}>{dispatchOpen?'收起 AI 调度':'✧ AI 调度'} ↗</button>
      <div className={`connection-chip ${online ? 'connected' : ''}`}><i />{online ? '后端已连接' : sim.connection === 'connecting' ? '正在连接' : '后端离线'}</div>
    </header>
    <aside className="fleet-panel console-card">
      <div className={`simulation-clock ${sim.running ? 'running' : ''}`}><small>仿真运行时间</small><strong>{orderCount ? format(state.elapsedSeconds, 1) : '—'}<em>s</em></strong><span>{sim.running ? '运行中' : '待命'}</span></div>
      {v2 && <V2WaveSummary state={state}/>}
      <div className="section-title"><h2>任务与设备</h2><span>{online ? 'LIVE' : 'OFFLINE'}</span></div>
      <div className="mission-summary"><strong>{format(deliveredOrders)}<small> / {orderCount || '—'}</small></strong><span>已完成并回收</span><progress max={Math.max(1, orderCount)} value={deliveredOrders} /></div>
      <div className="task-buttons"><button className="primary" disabled={!online || busy || sim.running || finished} onClick={sim.start}>{stats.stepCount > 0 ? '继续任务' : '开始任务'}</button><button disabled={!online || busy || !sim.running || state.emergencyReturn} onClick={sim.pause}>暂停</button><button disabled={!online || busy} onClick={sim.reset}>重置</button></div>
      <label className="speed-control">演示速度 <b>{format(speedDraft ?? sim.speed, 1)}×</b><input aria-label="演示速度" type="range" min="0.3" max="2" step="0.1" value={speedDraft ?? sim.speed} disabled={!online || busy} onChange={e => setSpeedDraft(Number(e.target.value))} onPointerUp={e => { sim.setSpeed(Number(e.target.value)); setSpeedDraft(null); }} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { sim.setSpeed(Number(e.target.value)); setSpeedDraft(null); } }} /></label>
      <div className="battery-mode-control" aria-label="无人机初始电量模式"><span>无人机初始电量</span><div>
        <button type="button" aria-pressed={state.batteryMode === 'balanced'} className={state.batteryMode === 'balanced' ? 'selected' : ''} disabled={!canSetBatteryMode} onClick={() => sim.setBatteryMode('balanced')}>均衡 100%</button>
        <button type="button" aria-pressed={state.batteryMode === 'imbalanced'} className={state.batteryMode === 'imbalanced' ? 'selected' : ''} disabled={!canSetBatteryMode} onClick={() => sim.setBatteryMode('imbalanced')}>不均衡 42/68/91%</button>
      </div></div>
      <div className="fleet-list"><button className={`fleet-device ${selectedAgentId==='mother'?'selected':''}`} disabled={!state.orders.length} onClick={() => locate(state.rover)}><i><DeviceIcon/></i><span><strong>MOTHER</strong><small>地面母车 · {state.docking?.owner!=null?'单舱接货 / 排队中':sim.running ? '协同巡航' : '待命'} · MEC</small></span><b>↗</b></button>
        {state.uavs.map(u => <button className={`fleet-device ${selectedAgentId===`uav-${u.id}`?'selected':''}`} key={u.id} onClick={() => locate(u)}><i><DeviceIcon drone/></i><span><strong>UAV {String(u.id).padStart(2,'0')}<em>{format(u.battery * 100)}%</em></strong><small>{devicePhase(u)}{u.targetOrderId ? ` · 订单 ${u.targetOrderId}` : u.cargoOrderId ? ` · 携货订单 ${u.cargoOrderId}` : ''}</small><progress max="100" value={u.battery * 100} /></span><b>↗</b></button>)}
      </div>
      <div className="section-title order-heading"><h2>订单清单</h2><button className="parcel-toggle" aria-expanded={parcelsOpen} onClick={()=>setParcelsOpen(!parcelsOpen)}>{parcelsOpen?'收起':'展开'} · {orderCount}</button></div>
      <div className="parcel-list" style={{display:parcelsOpen?'block':'none'}}>{state.orders.map(o => <button key={o.id} onClick={() => locate(o)} className={o.status === 'delivered' ? 'delivered' : o.status === 'picking' ? 'picking' : ''}><b>{String(o.id).padStart(2, '0')}</b><span>{o.pickupType === 'balcony' ? `${o.buildingId} · ${o.floor}F` : `${o.area} 区`}<small>{o.priority === 'urgent' ? '加急 · ' : ''}{o.reservedBy ? `UAV ${o.reservedBy}` : o.pickupType === 'balcony' ? '阳台取件点 · 待分配' : '中庭取件点 · 待分配'}</small></span><em>{o.priority === 'urgent' ? '加急 · ' : ''}{ORDER[o.status]}</em></button>)}</div>
      {!orderCount && <p className="empty-state">等待后端生成本轮订单</p>}
    </aside>
    <aside className="dispatch-panel console-card">
      <div className="section-title"><h2>调度指挥官</h2><span>{state.health.agentReady ? state.health.agentVerified ? 'AI 已连接' : '已配置 · 待联调' : state.health.agentConfigured ? 'AI 接口未连接' : 'AI 未配置'}</span></div>
      <p className="panel-description">{v2?'PPO 自主选单与接应。可通过自然语言查询状态或指派区域与设备。':'先用预设演示任务，也可通过自然语言查询状态或指派区域与设备。'}</p>
      <div className="preset-list">{PRESETS.map(p => <button key={p.label} disabled={!online || busy} onClick={() => sim.dispatch(p.command, `预设调度：${p.label}`)}><strong>{p.label}<b>↗</b></strong><small>{v2&&p.command.action_type==='optimize_energy'?'单机预算 75% · 下波次生效':p.description}</small></button>)}</div>
      <div className="chat-history" aria-live="polite">
        {sim.messages.length === 0 && <div className="chat-intro"><i>◈</i><strong>让调度过程看得见</strong><p>指令发送后，后端确认任务，设备开始执行；下方卡片展示实际结果。</p></div>}
        {sim.messages.map(m => <div className="chat-exchange" key={m.id}><div className="user-message">{m.text}</div><div className={`command-result ${m.ok === false ? 'failed' : ''}`}><small>{m.unknown ? '执行状态待确认' : m.ok && m.command?.action_type === 'query_status' ? '后端已回答' : m.ok ? '后端已执行' : m.ok === false ? '未执行' : '处理中'}</small><p>{m.result}</p>{m.command && <CommandDetails command={m.command}/>}</div></div>)}
      </div>
      {(!state.health.agentReady || !state.health.agentVerified) && <p className="agent-note">{state.health.agentLastError || (state.health.agentReady ? 'AI 接口已配置，真实调度暂未验证；可先使用预设调度。' : state.health.agentConfigured ? state.health.agentMessage : '自然语言解析需要后端配置 AI 接口。预设调度可直接执行。')}</p>}
      <form className="chat-compose" onSubmit={e => { e.preventDefault(); if (text.trim()) { sim.chat(text.trim()); setText(''); } }}><textarea aria-label="调度需求" placeholder={state.health.agentReady ? '例如：派1号和3号机去B区取件' : state.health.agentConfigured ? '等待 AI 接口启动，预设可正常使用' : 'AI 未配置，请先使用上方预设'} value={text} onChange={e => setText(e.target.value)} disabled={!online || !state.health.agentReady || busy} maxLength={1000} /><button className="primary" disabled={!online || !state.health.agentReady || busy || !text.trim()}>发送调度指令 ↑</button></form>
      <button className="emergency" disabled={!online || state.emergencyReturn} onClick={() => sim.dispatch({ action_type: 'emergency_stop', target_area: null, priority: 'urgent', energy_limit: null, assign_agents: ['all'] }, '紧急返航')}>{state.emergencyReturn ? '↩ 紧急返航中' : '↩ 紧急返航'}</button>
    </aside>
    <div className="mission-bottom console-card">
      <div className="mission-stages">{stages.map((stage, i) => <div className={stage.done ? 'done' : ''} key={stage.title}><i>{String(i + 1).padStart(2, '0')}</i><span><small>{stage.title}</small><strong>{stage.value}</strong></span></div>)}</div>
      <div className="real-metrics"><div><small>无人机航程</small><strong>{format(stats.uavDistanceMeters, 1)} <em>m</em></strong></div><div><small>平均订单完成时间</small><strong>{format(stats.averageOrderCompletionSeconds, 1)} <em>s</em></strong></div><div><small>无人机平均单能耗</small><strong>{format(v2?stats.averageUavEnergyPerOrderWh:stats.averageUavEnergyPerOrderPercent, 2)} <em>{v2?'Wh/单':'%/单'}</em></strong></div><div><small>订单完成率</small><strong>{format(stats.completionRate ?? 0, 1)} <em>%</em></strong></div></div>
    </div>
    <div role="status" className={`backend-notice ${!online ? 'offline' : ''}`}>{sim.error || (!online ? '后端连接不可用 · 场景已冻结，控制暂不可用' : statusText)}<button onClick={() => { if (!diagnostics && dispatchOpen) setDispatchOpen(false); setDiagnostics(!diagnostics); }}>{diagnostics ? '收起联调信息' : '联调信息'}</button></div>
    {orderToast && <div className="order-arrival-toast" role="status" aria-live="polite"><b>新订单到达</b><span>{orderToast.replace(/^新订单\s*/, '')}</span></div>}
    {diagnostics && v2 && <V2Diagnostics state={state}/>}
    {diagnostics && !v2 && <div className="diagnostics console-card"><div className="diagnostics-title"><strong><span className="trace-kicker">POLICY TRACE</span> 算法实时遥测</strong><span className="trace-status">MEC / LIVE</span></div><div className="trace-pipeline"><span>OBS 输入</span><i>→</i><span>POLICY</span><i>→</i><span>ACTION 输出</span><i>→</i><span>SUPERVISOR</span></div><div className="algorithm-summary"><b>{state.health.inferenceCount ?? '—'}</b><span>推理批次</span><b>{format(state.health.inferenceMs, 2)}<em>ms</em></b><span>最近批次</span><b>{state.seq}</b><span>快照序号</span></div><div className="algorithm-grid">{algorithmUnits.map(({key,label,unit}) => { const telemetry = sim.algorithmTelemetry?.[key] || {}; const target = unit.targetOrderId ? state.orders.find(order => order.id === unit.targetOrderId) : null; const action = telemetry.action || sim.inference?.[key]?.values; const observation = telemetry.observation; const observationDimension = observation?.length || (key === 'mother' ? 6 : 10); const actionDimension = action?.length || (key === 'mother' ? 2 : 3); return <div className="algorithm-row" key={key}><div className="algorithm-row-head"><strong>{label}</strong><span>{devicePhase(unit)}</span></div><div className="trace-stage"><b>01</b><span>观测</span><i>→</i><b>02</b><span>策略</span><i>→</i><b>03</b><span>执行</span></div><div className="trace-block"><div className="telemetry-kicker">INPUT VECTOR <em>{observationDimension}D · normalized</em></div><code className="observation-vector">{observationText(observation)}</code></div><div className="trace-block"><div className="telemetry-kicker">ACTION VECTOR <em>{actionDimension}D · range [-1, 1]</em></div><ActionVector values={action} mother={key === 'mother'}/></div><div className="telemetry-line"><b>执行坐标</b><span>{coordinate(unit)}</span></div>{target && <><div className="telemetry-line"><b>目标坐标</b><span>{coordinate(target)}</span></div><div className="telemetry-line target-error"><b>目标误差</b><span>{targetError(unit, target)}</span></div></>}<div className="trace-execution"><span>SUPERVISOR</span><b>{devicePhase(unit)}</b><small>快照 #{state.seq}</small></div></div>; })}</div><div className="diagnostic-events">{state.events.slice(-4).map((event, index) => <small key={`${event.time}-${index}`}>{format(event.time, 1)}s · {event.text}</small>)}</div></div>}
  </div>;
}
