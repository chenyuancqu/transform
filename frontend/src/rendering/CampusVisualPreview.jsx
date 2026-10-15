import React,{Suspense,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls,useProgress} from '@react-three/drei';
import * as THREE from 'three';
import {CampusDaylight,DesignedCampusGround,CampusBuildings,CampusLandscape,CampusShadowCache} from './CampusVisualEnvironment.jsx';
import {CAMPUS_BUILDINGS} from './campusScenePlan.js';
import {DroneAsset,MotherAsset} from './LogisticsDevices.jsx';
import {CampusCamera,FreeCameraControls} from './CampusCameraControls.jsx';
import './campus-visual-preview.css';

// Independent static preview: no transport client, mission engine or statistics.
const poses=[{id:1,x:.485,y:.5,z:.06},{id:2,x:.515,y:.5,z:.06},{id:3,x:.5,y:.47,z:.06}].map(p=>({...p,phase:'idle',pickupProgress:0,unloadProgress:0,cargoOrderId:null}));
function Preview(){
  const orbitRef=useRef(),visualUAVs=useRef({}),assets=useProgress();
  const [request,setRequest]=useState({mode:'presentation'}),[free,setFree]=useState(false);
  return <main><Canvas frameloop={free?'always':'demand'} shadows={{type:THREE.PCFShadowMap,autoUpdate:false}} dpr={1} camera={{position:[142,112,150],fov:38,near:.5,far:2200}} gl={{antialias:true,powerPreference:'high-performance',toneMapping:THREE.NeutralToneMapping,toneMappingExposure:1}}>
    <Suspense fallback={null}><CampusShadowCache/><CampusDaylight/><DesignedCampusGround/><CampusBuildings/><CampusLandscape/>
      <MotherAsset rover={{x:.5,y:.5,heading:0}} docking={{hatchProgress:0}} running={false} orders={[]} elapsed={0}/>{poses.map((uav,index)=><DroneAsset key={uav.id} {...{uav,index,visualUAVs}} running={false}/>)}</Suspense>
    <OrbitControls ref={orbitRef} makeDefault enabled={!free} enableDamping minDistance={4} maxDistance={1800} maxPolarAngle={Math.PI/2.02}/><CampusCamera request={request} orbitRef={orbitRef} free={free}/><FreeCameraControls enabled={free} onExit={()=>setFree(false)}/>
  </Canvas><header><small>NEXUS / CAMPUS VISUAL PREVIEW</small><h1>现代智慧园区</h1><p>独立美术预览 · 设备静态展示</p><nav>{[['presentation','演示视角'],['overview','园区总览'],['devices','设备近景']].map(([mode,name])=><button key={mode} onClick={()=>{setFree(false);setRequest({mode});}}>{name}</button>)}<button onClick={()=>setFree(!free)}>{free?'退出漫游':'自由漫游'}</button><a href="/r3f.html">进入任务演示 ↗</a></nav></header>
  {assets.active&&<div className="preview-loading" role="status">正在加载真实园区资源 · {Math.round(assets.progress)}%</div>}
  <footer>办公楼 Nikitos &amp; 3130 / 无人机 19vitali99 · CC BY 4.0（已改造） · 原创母车与建筑细节 ISC · 圆润绿化 Kenney CC0（已改造） · 座椅/环境 Poly Haven CC0 · {free?'WASD 移动 / 空格 Ctrl 或 Q E 升降 / 右键锁定鼠标 / Shift 冲刺 / Esc 退出':'左键旋转 · 右键平移 · 滚轮缩放'}</footer></main>;
}
createRoot(document.getElementById('app')).render(<Preview/>);
