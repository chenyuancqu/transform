import React, { useState } from 'react';
import { businessToWorld } from '../rendering/CoordinateSystem.js';

const PHASE = { idle: '待命', takingOff:'起飞爬升',cruising: '前往取件', approaching: '减速对准', aligning: '稳定悬停', picking: '装载包裹', returning: '携货返航', waitingDock:'排队返航', unloading: '母车回收',clearingBay:'吊具回收',parking:'离舱归位' };
const ORDER = { waiting: '待分配', enroute: '前往取件', approaching: '减速对准', aligning: '稳定悬停', picking: '装载中', collected: '返航中', delivered: '已回收' };
const format = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const PRESETS = [
  { label: '常规取件', description: '全园区 · 3 架无人机', command: { action_type: 'dispatch', target_area: null, priority: 'normal', energy_limit: null, assign_agents: ['all'] } },
  { label: 'B 区加急', description: 'B 区 · UAV 1 / 3', command: { action_type: 'dispatch', target_area: 'B', priority: 'urgent', energy_limit: null, assign_agents: ['uav_1', 'uav_3'] } },
  { label: '节能调度', description: '降低返航与引导速度', command: { action_type: 'optimize_energy', target_area: null, priority: 'normal', energy_limit: 75, assign_agents: ['all'] } }
];

function DeviceIcon({drone=false}){
  return <svg viewBox="0 0 42 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{drone?<><path d="M15 14l-7-7m19 7l7-7M15 19l-7 6m19-6l7 6M17 12h8l3 7-4 4h-6l-4-4z"/><ellipse cx="7" cy="6" rx="6" ry="2.4"/><ellipse cx="35" cy="6" rx="6" ry="2.4"/><ellipse cx="7" cy="26" rx="6" ry="2.4"/><ellipse cx="35" cy="26" rx="6" ry="2.4"/><path d="M18 16h6" stroke="#38d5e5"/></>:<><path d="M5 23V11l4-5h23l5 5v12H5zM6 11h30M14 12v10m14-10v10M8 16h3m20 0h3"/><path d="M11 6h20l3 5H8z" fill="#9bbdcc33"/><circle cx="12" cy="24" r="3.5" fill="#16384b"/><circle cx="31" cy="24" r="3.5" fill="#16384b"/><path d="M17 18h7" stroke="#38d5e5"/></>}</svg>;
}

export function TaskConsole({ simulation: sim, focus }) {
  const { snapshot: state, online } = sim;
  const [text, setText] = useState('');
  const [diagnostics, setDiagnostics] = useState(false);
  const [dispatchOpen,setDispatchOpen]=useState(false);
  const [parcelsOpen,setParcelsOpen]=useState(false);
  const [speedDraft, setSpeedDraft] = useState(null);
  const busy = Object.keys(sim.pending).length > 0;
  const stats = state.stats;
  const finished=stats.deliveredOrders===8&&state.uavs.every(u=>u.phase==='idle')&&!(state.docking?.hatchProgress>0);
  const initialNotice = sim.message.startsWith('后端已就绪') || sim.message === '等待本机后端连接';
  const statusText = finished ? '任务完成 · 8/8 包裹已回收至母车'
    : stats.deliveredOrders===8 ? (sim.running?'全部包裹已回收 · 正在离舱归位与关舱':'已暂停 · 待完成离舱归位与关舱')
    : initialNotice && stats.stepCount > 0 && sim.running ? '任务执行中 · 后端推理与遥测正常'
    : !sim.running && stats.stepCount > 0 ? (state.events.at(-1)?.text?.startsWith('本次调度范围') ? state.events.at(-1).text : '任务已暂停 · 位置与装卸动作保持')
    : sim.message;
  const locate = p => { const world = businessToWorld(p.x, p.y, p.z); focus([world.x, world.y, world.z],p.phase?'device-uav-'+p.id:p===state.rover?'device-rover':undefined); };
  const stages = [
    { title: '任务准备', value: `${state.orders.length || '—'} 个包裹`, done: state.orders.length > 0 },
    { title: '设备执行', value: sim.running ? '运行中' : finished ? '已结束' : '待命 / 暂停', done: sim.running || stats.stepCount > 0 },
    { title: '包裹装载', value: `${stats.completedOrders ?? '—'} / 8`, done: stats.completedOrders > 0 },
    { title: '母车回收', value: `${stats.deliveredOrders ?? '—'} / 8`, done: stats.deliveredOrders > 0 }
  ];
  return <div className={`task-console ${dispatchOpen?'dispatch-open':''}`}>
    <header className="console-header">
      <div className="console-brand"><i>◈</i><div><strong>NEXUS · 空地协同调度平台</strong><small>SMART CAMPUS / DIGITAL TWIN</small></div></div>
      <button className="dispatch-toggle" aria-expanded={dispatchOpen} onClick={()=>setDispatchOpen(!dispatchOpen)}>{dispatchOpen?'收起 AI 调度':'✧ AI 调度'} ↗</button>
      <div className={`connection-chip ${online ? 'connected' : ''}`}><i />{online ? '后端已连接' : sim.connection === 'connecting' ? '正在连接' : '后端离线'}</div>
    </header>
    <aside className="fleet-panel console-card">
      <div className="section-title"><h2>任务与设备</h2><span>{online ? 'LIVE' : 'OFFLINE'}</span></div>
      <div className="mission-summary"><strong>{format(stats.deliveredOrders)}<small> / 8</small></strong><span>已回收至母车</span><progress max="8" value={stats.deliveredOrders || 0} /></div>
      <div className="task-buttons"><button className="primary" disabled={!online || busy || sim.running || finished} onClick={sim.start}>{stats.stepCount > 0 ? '继续任务' : '开始任务'}</button><button disabled={!online || busy || !sim.running} onClick={sim.pause}>暂停</button><button disabled={!online || busy} onClick={sim.reset}>重置</button></div>
      <label className="speed-control">演示速度 <b>{format(speedDraft ?? sim.speed, 1)}×</b><input aria-label="演示速度" type="range" min="0.3" max="2" step="0.1" value={speedDraft ?? sim.speed} disabled={!online || busy} onChange={e => setSpeedDraft(Number(e.target.value))} onPointerUp={e => { sim.setSpeed(Number(e.target.value)); setSpeedDraft(null); }} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { sim.setSpeed(Number(e.target.value)); setSpeedDraft(null); } }} /></label>
      <div className="fleet-list"><button className="fleet-device" disabled={!state.orders.length} onClick={() => locate(state.rover)}><i><DeviceIcon/></i><span><strong>MOTHER</strong><small>地面母车 · {state.docking?.owner!=null?'单舱接货 / 排队中':sim.running ? '协同巡航' : '待命'} · MEC</small></span><b>↗</b></button>
        {state.uavs.map(u => <button className="fleet-device" key={u.id} onClick={() => locate(u)}><i><DeviceIcon drone/></i><span><strong>UAV {String(u.id).padStart(2,'0')}<em>{format(u.battery * 100)}%</em></strong><small>{PHASE[u.phase]}{u.targetOrderId ? ` · 包裹 ${u.targetOrderId}` : u.cargoOrderId ? ` · 携货 ${u.cargoOrderId}` : ''}</small><progress max="100" value={u.battery * 100} /></span><b>↗</b></button>)}
      </div>
      <div className="section-title order-heading"><h2>包裹清单</h2><button className="parcel-toggle" aria-expanded={parcelsOpen} onClick={()=>setParcelsOpen(!parcelsOpen)}>{parcelsOpen?'收起':'展开'} · {state.orders.length}</button></div>
      <div className="parcel-list" style={{display:parcelsOpen?'block':'none'}}>{state.orders.map(o => <button key={o.id} onClick={() => locate(o)} className={o.status === 'delivered' ? 'delivered' : o.status === 'picking' ? 'picking' : ''}><b>{String(o.id).padStart(2, '0')}</b><span>{o.pickupType === 'balcony' ? `${o.buildingId} · ${o.floor}F` : `${o.area} 区`}<small>{o.reservedBy ? `UAV ${o.reservedBy}` : o.pickupType === 'balcony' ? '阳台包裹 · 等待分配' : '中庭包裹 · 等待分配'}</small></span><em>{ORDER[o.status]}</em></button>)}</div>
      {!state.orders.length && <p className="empty-state">等待后端下发设备与包裹数据</p>}
    </aside>
    <aside className="dispatch-panel console-card">
      <div className="section-title"><h2>调度指挥官</h2><span>{state.health.agentReady ? state.health.agentVerified ? 'AI 已连接' : '已配置 · 待联调' : state.health.agentConfigured ? 'AI 接口未连接' : 'AI 未配置'}</span></div>
      <p className="panel-description">先用预设演示任务，也可通过自然语言指派区域与设备。</p>
      <div className="preset-list">{PRESETS.map(p => <button key={p.label} disabled={!online || busy} onClick={() => sim.dispatch(p.command, `预设调度：${p.label}`)}><strong>{p.label}<b>↗</b></strong><small>{p.description}</small></button>)}</div>
      <div className="chat-history" aria-live="polite">
        {sim.messages.length === 0 && <div className="chat-intro"><i>◈</i><strong>让调度过程看得见</strong><p>指令发送后，后端确认任务，设备开始执行；下方卡片展示实际结果。</p></div>}
        {sim.messages.map(m => <div className="chat-exchange" key={m.id}><div className="user-message">{m.text}</div><div className={`command-result ${m.ok === false ? 'failed' : ''}`}><small>{m.unknown ? '执行状态待确认' : m.ok ? '后端已执行' : m.ok === false ? '未执行' : '处理中'}</small><p>{m.result}</p>{m.command && <dl><dt>目标区域</dt><dd>{m.command.target_area ? `${m.command.target_area} 区` : '全园区'}</dd><dt>指派设备</dt><dd>{m.command.assign_agents?.join(' / ')}</dd><dt>优先级</dt><dd>{m.command.priority === 'urgent' ? '加急' : '常规'}</dd>{m.command.energy_limit && <><dt>能耗预算</dt><dd>{m.command.energy_limit}% / 单机</dd></>}</dl>}</div></div>)}
      </div>
      {(!state.health.agentReady || !state.health.agentVerified) && <p className="agent-note">{state.health.agentLastError || (state.health.agentReady ? 'AI 接口已配置，真实调度暂未验证；可先使用预设调度。' : state.health.agentConfigured ? state.health.agentMessage : '自然语言解析需要后端配置 AI 接口。预设调度可直接执行。')}</p>}
      <form className="chat-compose" onSubmit={e => { e.preventDefault(); if (text.trim()) { sim.chat(text.trim()); setText(''); } }}><textarea aria-label="调度需求" placeholder={state.health.agentReady ? '例如：派1号和3号机去B区取件' : state.health.agentConfigured ? '等待 AI 接口启动，预设可正常使用' : 'AI 未配置，请先使用上方预设'} value={text} onChange={e => setText(e.target.value)} disabled={!online || !state.health.agentReady || busy} maxLength={1000} /><button className="primary" disabled={!online || !state.health.agentReady || busy || !text.trim()}>发送调度指令 ↑</button></form>
      <button className="emergency" disabled={!online} onClick={() => sim.dispatch({ action_type: 'emergency_stop', target_area: null, priority: 'urgent', energy_limit: null, assign_agents: ['all'] }, '紧急停止')}>Ⅱ 紧急停止集群</button>
    </aside>
    <div className="mission-bottom console-card">
      <div className="mission-stages">{stages.map((stage, i) => <div className={stage.done ? 'done' : ''} key={stage.title}><i>{String(i + 1).padStart(2, '0')}</i><span><small>{stage.title}</small><strong>{stage.value}</strong></span></div>)}</div>
      <div className="real-metrics"><div><small>无人机航程</small><strong>{format(stats.uavDistanceMeters, 1)} <em>m</em></strong></div><div><small>平均回收时延</small><strong>{format(stats.averageDelaySeconds, 1)} <em>s</em></strong></div><div><small>仿真运行时间</small><strong>{state.orders.length ? format(state.elapsedSeconds, 1) : '—'} <em>s</em></strong></div></div>
    </div>
    <div role="status" className={`backend-notice ${!online ? 'offline' : ''}`}>{sim.error || (!online ? '后端连接不可用 · 场景已冻结，控制暂不可用' : statusText)}<button onClick={() => setDiagnostics(!diagnostics)}>{diagnostics ? '收起联调信息' : '联调信息'}</button></div>
    {diagnostics && <div className="diagnostics console-card"><strong>本机 MEC 推理</strong><p>模型 {state.health.modelsLoaded ?? '—'} / 4 · 推理 {state.health.inferenceCount ?? '—'} 次 · {format(state.health.inferenceMs, 2)} ms / 批</p><p>MQTT · 帧 {state.seq} · {online ? '遥测正常' : '等待连接'}</p><p>AI 模型：{state.health.agentModel || '等待接口模型列表'}</p><p>能耗：{format(stats.energyConsumed, 1)} 百分点（3机累计仿真消耗）</p><p>固定本机推理；当前不含动态云边卸载。</p><p>到达：水平 ≤ 0.35m / 高差 ≤ 0.2m / 稳定悬停 0.8s</p>{state.events.slice(-3).map((e, i) => <small key={i}>{format(e.time, 1)}s · {e.text}</small>)}</div>}
  </div>;
}
