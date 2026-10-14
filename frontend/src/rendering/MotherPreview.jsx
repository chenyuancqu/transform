import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF,useTexture} from '@react-three/drei';
import * as THREE from 'three';
import './mother-preview.css';

function Ground(){
  const loaded=useTexture(['/assets/campus/materials/pavement_03/Diffuse.jpg','/assets/campus/materials/pavement_03/nor_gl.jpg','/assets/campus/materials/pavement_03/Rough.jpg']);
  const maps=useMemo(()=>loaded.map((t,i)=>{const x=t.clone();x.wrapS=x.wrapT=THREE.RepeatWrapping;x.repeat.set(8,8);x.colorSpace=i===0?THREE.SRGBColorSpace:THREE.NoColorSpace;x.anisotropy=8;return x;}),[loaded]);
  useEffect(()=>()=>maps.forEach(t=>t.dispose()),[maps]);
  return <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[40,40]}/><meshStandardMaterial color="#e1e1d8" map={maps[0]} normalMap={maps[1]} roughnessMap={maps[2]} normalScale={new THREE.Vector2(.28,.28)} roughness={.92}/></mesh>;
}

function Vehicle({mode}){
  const gltf=useGLTF('/assets/campus/vehicles/mother-carrier-original.glb');
  const asset=useMemo(()=>gltf.scene.clone(true),[gltf.scene]);
  const motion=useRef({distance:0,time:0,previous:0});
  const wheels=useMemo(()=>['fl','fr','rl','rr'].map(k=>asset.getObjectByName('wheel_'+k)),[asset]);
  const steer=useMemo(()=>['fl','fr'].map(k=>asset.getObjectByName('steering_'+k)),[asset]);
  const hatch=useMemo(()=>asset.getObjectByName('roof_hatch_pivot'),[asset]);
  useEffect(()=>{asset.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});},[asset]);
  const holder=useRef();
  useFrame((_,delta)=>{
    const dt=Math.min(delta,.05);const m=motion.current;m.time+=dt;
    // Mechanical look-dev motion only; no MQTT or task-completion events.
    const z=mode==='drive'?Math.sin(m.time*.55)*.75:0;
    const actual=holder.current?THREE.MathUtils.damp(holder.current.position.z,z,7,dt):0;
    const travelled=actual-m.previous;m.previous=actual;m.distance+=travelled;
    if(holder.current)holder.current.position.z=actual;
    wheels.forEach(w=>{if(w)w.rotation.x=m.distance/.382;});
    steer.forEach(w=>{if(w)w.rotation.y=THREE.MathUtils.damp(w.rotation.y,mode==='drive'?Math.sin(m.time*.7)*.13:0,5,dt);});
    if(hatch)hatch.rotation.z=THREE.MathUtils.damp(hatch.rotation.z,mode==='hatch'?Math.PI*.60:0,4,dt);
  });
  return <group ref={holder}><primitive object={asset}/></group>;
}

function Probe(){
  const {gl,scene,camera}=useThree();
  useEffect(()=>{if(import.meta.env.DEV)window.__motherPreview={gl,scene,camera};},[gl,scene,camera]);
  return null;
}

class AssetBoundary extends React.Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="load-error">模型加载失败，请检查本地资源和服务。<a href="/asset-review.html">返回候选页</a></div>:this.props.children;}
}

function Preview(){
  const [mode,setMode]=useState('static');const [view,setView]=useState('angle');const controls=useRef();
  const changeView=name=>{setView(name);const c=controls.current;if(!c)return;const poses={angle:[7.2,4.8,8],side:[7.8,2.7,0],front:[0,2.7,8.3],rear:[0,2.8,-8.3],roof:[4.8,9,4.8]};c.object.position.set(...poses[name]);c.target.set(0,.85,0);c.update();};
  return <main className="mother-app"><AssetBoundary><Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1,1.75]} camera={{position:[7.2,4.8,8],fov:35,near:.1,far:120}} gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.95}}>
    <Probe/><color attach="background" args={['#dce3df']}/><fog attach="fog" args={['#dce3df',28,65]}/>
    <hemisphereLight intensity={.35} color="#f3f5f5" groundColor="#b1b2a5"/>
    <directionalLight position={[-6,9,5]} intensity={2} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-.00015}/>
    <Suspense fallback={null}>
      <Environment files="/assets/campus/environment/kloofendal_48d_partly_cloudy_puresky/sky.hdr" environmentIntensity={.8}/><Ground/><Vehicle mode={mode}/>
    </Suspense>
    <OrbitControls ref={controls} makeDefault target={[0,.85,0]} enableDamping minDistance={2.7} maxDistance={18} maxPolarAngle={Math.PI/2-.025}/>
  </Canvas></AssetBoundary>
    <header><div><span>ORIGINAL VEHICLE / DESIGN REVIEW</span><h1>中型无驾驶室物流母车</h1><p>原创外形候选 · 独立 GLB · 白天实景材质预览</p></div><a href="/asset-review.html">办公楼与无人机候选 ↗</a></header>
    <aside className="mother-spec"><span className="spec-kicker">MOTHER CARRIER / CONCEPT</span><h2>封闭货舱，独立接货位</h2><p>没有驾驶室。前后传感器带、车顶雷达、四轮底盘与可开启接货舱分别建模。</p><dl><dt>实际外形尺寸</dt><dd>4.17 × 2.35 × 1.83 m</dd><dt>结构细节</dt><dd>门缝 / 铰链 / 胎面 / 轮毂</dd><dt>接货布局</dt><dd>单接货位，其他无人机候等</dd><dt>当前状态</dt><dd>外形已确认，已接入园区任务</dd></dl><small>本页为独立部件预览。园区场景已接入后端接货排队、开舱与装卸；传感器仅用于外观展示。</small></aside>
    <nav className="mother-views" aria-label="车辆视角">{[['angle','整体'],['side','侧面'],['front','前部'],['rear','后部'],['roof','车顶']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>changeView(key)}>{label}</button>)}</nav>
    <footer><div className="mother-motion" aria-label="机械动作">{[['static','静态外形'],['drive','轮胎与转向'],['hatch','开启接货舱']].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div><span>拖动旋转 · 滚轮缩放 · 原创模型 ISC / 地面与环境 Poly Haven CC0</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<Preview/>);
