import React,{useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {useThree,useFrame} from '@react-three/fiber';
import {useGLTF,Environment} from '@react-three/drei';
import * as THREE from 'three';
import {prepareOffice,disposeOffice} from './OfficeArchitecture.js';
import {StylizedLandscape,DistrictStreetTrees} from './StylizedLandscape.jsx';
import {CampusDistrictContext} from './CampusDistrictContext.jsx';
import {CAMPUS_BUILDINGS,GARDENS,LOW_GARDENS} from './campusScenePlan.js';
import {CAMPUS_ART as A} from './CampusArtDirection.js';
import {CampusForecourt,COURTYARD_TEXTURE} from './CampusForecourt.jsx';
import {CampusBuildingDetails} from './CampusBuildingDetails.jsx';

// Static shadows remain valid while all devices are paused. Camera movement
// does not move the fixed daylight shadow camera or change model geometry.
export function CampusShadowCache({running=false}){
  const {gl}=useThree(),last=useRef(-Infinity);
  useLayoutEffect(()=>{gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;return()=>{gl.shadowMap.autoUpdate=true;};},[gl]);
  useFrame(({clock})=>{const now=clock.elapsedTime;if(running&&now-last.current>=1/30){gl.shadowMap.needsUpdate=true;last.current=now;}const audit=document.getElementById('render-audit');if(audit)audit.dataset.running=String(running);});
  return null;
}
export const campusSurfaceHeight=()=>0;
export const OFFICE_URL='/assets/campus/optimized/buildings/office.gltf';
export function CampusBuildings(){
  const {scene}=useGLTF(OFFICE_URL),offices=CAMPUS_BUILDINGS.filter(b=>(b.height??32)>=20),low=CAMPUS_BUILDINGS.filter(b=>(b.height??32)<20);
  const template=useMemo(()=>prepareOffice(scene,'NEXUS / INNOVATION',32),[scene]);
  const parts=useMemo(()=>{template.updateMatrixWorld(true);const parts=[];template.traverse(mesh=>{if(!mesh.isMesh)return;parts.push({geometry:mesh.geometry,material:mesh.material,matrices:offices.map(b=>new THREE.Matrix4().compose(new THREE.Vector3(...b.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw),new THREE.Vector3(...(b.visualScale||[1,1,1]))).multiply(mesh.matrixWorld))});});return parts;},[template]);
  useEffect(()=>()=>disposeOffice(template),[template]);
  return <><group name="campus-buildings-batch">{parts.map((p,i)=><StaticInstances key={i} {...p}/>)}</group>{offices.map(b=><group key={b.id} name={'campus-building-'+b.id} position={b.position} userData={{labelHeight:33.44*(b.visualScale?.[1]||1)+1}}/>)}{low.map(b=><OfficeBuilding key={b.id} {...b}/>) }<CampusBuildingDetails/></>;
}
export function OfficeBuilding({id,name,position,yaw,height=32,visualScale=[1,1,1]}){
  const {scene}=useGLTF(height<20?'/assets/campus/optimized/buildings/dispatch.gltf':OFFICE_URL);
  const object=useMemo(()=>prepareOffice(scene,`${id} / NEXUS INNOVATION`,height),[scene,id,height]);
  useEffect(()=>()=>disposeOffice(object),[object]);
  return <group position={position} rotation-y={yaw} scale={visualScale} name={`campus-building-${id}`} userData={{labelHeight:height*visualScale[1]+1}}><primitive object={object}/></group>;
}
function MetrePlaneGeometry({args}){const geometry=useMemo(()=>{const g=new THREE.PlaneGeometry(...args),position=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i),position.getY(i));return g;},[args[0],args[1]]);useEffect(()=>()=>geometry.dispose(),[geometry]);return <primitive attach="geometry" object={geometry}/>;}
function roundedPath(w,h,r,Path=THREE.Shape){const s=new Path(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;}
function RingSurface({w,h,width,r,y,material}){const g=useMemo(()=>{const s=roundedPath(w,h,r);s.holes.push(roundedPath(w-width*2,h-width*2,Math.max(.3,r-width),THREE.Path));return new THREE.ShapeGeometry(s,20);},[w,h,width,r]);return <mesh geometry={g} rotation-x={-Math.PI/2} position={[0,y,0]} receiveShadow><meshStandardMaterial {...material}/></mesh>;}
function Path({from,to,width,material}){const dx=to[0]-from[0],dz=to[1]-from[1];return <mesh position={[(from[0]+to[0])/2,.012,(from[1]+to[1])/2]} rotation={[-Math.PI/2,0,Math.atan2(dx,dz)]} receiveShadow><MetrePlaneGeometry args={[width,Math.hypot(dx,dz)]}/><meshStandardMaterial {...material}/></mesh>;}
export function CampusDaylight(){
  return <>
    <color attach="background" args={[A.sky]}/>
    <fog attach="fog" args={['#c8e5ef',1050,3100]}/>
    <hemisphereLight intensity={.82} color="#eaf7ff" groundColor="#9bb879"/>
    <ambientLight intensity={.12} color="#fff0d5"/>
    <directionalLight
      position={[-92,145,72]}
      intensity={3.1}
      color="#fff0cf"
      castShadow
      shadow-mapSize={[2048,2048]}
      shadow-camera-left={-140}
      shadow-camera-right={140}
      shadow-camera-top={140}
      shadow-camera-bottom={-140}
      shadow-camera-far={360}
      shadow-bias={-.00008}
      shadow-normalBias={.018}
    />
    <Environment files="/assets/campus/environment/qwantani_noon_puresky/sky.hdr" environmentIntensity={.28}/>
  </>;
}
export function DesignedCampusGround(){
  const grass={color:A.lawn,roughness:1},paving={color:A.paving,roughness:.92},asphalt={color:A.road,roughness:.92};
  // Shape UVs are metre coordinates; repeat .17 means one asphalt tile / 6m.
  const pathMat=paving,roadMat=asphalt;
  return <group>
    <mesh rotation-x={-Math.PI/2} position={[0,-.075,0]} receiveShadow><MetrePlaneGeometry args={[1800,1600]}/><meshStandardMaterial {...grass}/></mesh>
    <GrassColourVariation/>
    <RingSurface w={163} h={143} width={1.3} r={13} y={.035} material={{color:A.curb,roughness:.88}}/>
    <RingSurface w={160.4} h={140.4} width={6.4} r={11.7} y={-.005} material={roadMat}/>
    <RingSurface w={147.6} h={127.6} width={1.4} r={5.3} y={.025} material={{color:A.curb,roughness:.85}}/>
    <RingSurface w={119.2} h={95.2} width={.55} r={22.6} y={.032} material={{color:A.curb,roughness:.86}}/>
    <RingSurface w={118} h={94} width={5.2} r={22} y={.004} material={roadMat}/>
    <RingSurface w={107.6} h={83.6} width={.55} r={16.8} y={.032} material={{color:A.curb,roughness:.86}}/>
    <mesh rotation-x={-Math.PI/2} receiveShadow><MetrePlaneGeometry args={[64,64]}/><meshStandardMaterial color="white" map={COURTYARD_TEXTURE} roughness={.92}/></mesh>
    <RingSurface w={65} h={65} width={.45} r={3} y={.009} material={{color:'#96aebd',roughness:.9}}/>
    <CampusForecourt/>
    <Path from={[0,-72]} to={[0,72]} width={3.2} material={pathMat}/><Path from={[-78,0]} to={[78,0]} width={3.2} material={pathMat}/>
    {[[[-32,-32],[-60,-40]],[[32,-32],[60,-40]],[[-32,32],[-40,40]],[[32,32],[40,40]]].map(([from,to],i)=><Path key={i} from={from} to={to} width={2.6} material={pathMat}/>)}
    {CAMPUS_BUILDINGS.map(b=>{const x=b.position[0],z=b.position[2];return <mesh key={b.id} position={[x,.013,z]} rotation={[-Math.PI/2,0,-b.yaw]} receiveShadow><MetrePlaneGeometry args={[b.height<20?47:53,26]}/><meshStandardMaterial {...pathMat}/></mesh>;})}
    {[[0,-47,0,-70],[0,47,0,70],[-59,0,-80,0],[59,0,80,0]].map(([x1,z1,x2,z2],i)=><Path key={'loop-link-'+i} from={[x1,z1]} to={[x2,z2]} width={4.6} material={roadMat}/>)}
    {[-1,1].flatMap(side=>(side<0?[-50,0,50]:[-33,33]).map(x=><Path key={'building-spur-'+side+'-'+x} from={[x,side*70]} to={[x,side*78]} width={4.6} material={roadMat}/>))}
    {[-1,1].map(side=><Path key={'side-spur-'+side} from={[side*80,0]} to={[side*90,0]} width={4.6} material={roadMat}/>)}
    {[...GARDENS,...LOW_GARDENS].map(([x,z],i)=><group key={i} position={[x,0,z]}><mesh rotation-x={-Math.PI/2} position={[0,.025,0]} receiveShadow><shapeGeometry args={[roundedPath(17,11,2.3)]}/><meshStandardMaterial color={A.curb} roughness={.85}/></mesh><mesh rotation-x={-Math.PI/2} position={[0,.045,0]} receiveShadow><shapeGeometry args={[roundedPath(15.5,9.5,2)]}/><meshStandardMaterial {...grass}/></mesh></group>)}
    <RoadPaint/>
    <Path from={[77,67]} to={[112,67]} width={4.8} material={roadMat}/>
    <mesh position={[111,-.005,62]} rotation-x={-Math.PI/2} receiveShadow><MetrePlaneGeometry args={[22,30]}/><meshStandardMaterial {...asphalt} color="#707b7c"/></mesh>
  </group>;
}
// Lane dividers, access-road crossings and parking marks share one draw call.
function RoadPaint(){
  const ref=useRef();
  const placements=useMemo(()=>{
    const placements=[];
    for(const s of [-1,1]){
      for(let i=0;i<23;i++){const t=-61+i*5.5;placements.push([t,.008,s*67,2.2,.12,'#e6e4d3'],[s*77,.008,t,.12,2.2,'#e6e4d3']);}
      // Short, low-contrast centre dashes make the inner campus loop read as a
      // shared two-way road instead of another wide blank strip of asphalt.
      for(let i=0;i<12;i++)placements.push([-30+i*5.5,.01,s*44.4,2.35,.11,'#d8ddd2']);
      for(let i=0;i<7;i++)placements.push([s*56.4,.01,-16.5+i*5.5,.11,2.35,'#d8ddd2']);
      for(let i=0;i<9;i++)placements.push([-3+i*.75,.012,s*67,.4,6.1,'#e9e9d9']);
    }
    for(const side of [-1,1]){
      for(let i=0;i<10;i++){
        const along=-29+i*6.4;
        placements.push([along,.016,side*43.4,2.8,.12,'#e6e4d3']);
        placements.push([side*55.4,.016,along,.12,2.8,'#e6e4d3']);
      }
      for(let i=-2;i<=2;i++){
        placements.push([0,.022,side*44+i*.78,4.5,.42,'#f4f1e3']);
        placements.push([side*55.4+i*.78,.022,0,.42,4.5,'#f4f1e3']);
      }
    }
    for(let i=0;i<8;i++)placements.push([107,.012,49+i*3.2,6,.07,'#e9e7d8']);
    return placements;
  },[]);
  useLayoutEffect(()=>{
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    placements.forEach(([x,y,z,w,h,colour],i)=>{ref.current.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),rotation,new THREE.Vector3(w,h,1)));ref.current.setColorAt(i,new THREE.Color(colour));});
    ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();
  },[placements]);
  return <instancedMesh ref={ref} args={[undefined,undefined,placements.length]} name="campus-road-paint"><planeGeometry args={[1,1]}/><meshStandardMaterial color="white" roughness={.9}/></instancedMesh>;
}
function GrassColourVariation(){
  const refs=useRef([]);
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();shape.moveTo(-.93,-.14);
    shape.bezierCurveTo(-1.04,-.53,-.64,-.91,-.29,-.79);shape.bezierCurveTo(.02,-.98,.31,-.74,.48,-.83);
    shape.bezierCurveTo(.88,-.78,.96,-.4,.78,-.18);shape.bezierCurveTo(1.06,.16,.73,.53,.47,.56);
    shape.bezierCurveTo(.2,.92,-.12,.76,-.32,.86);shape.bezierCurveTo(-.77,.85,-.98,.51,-.86,.22);
    shape.bezierCurveTo(-.99,.02,-.96,-.02,-.93,-.14);shape.closePath();return new THREE.ShapeGeometry(shape,24);
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const patches=[
    {colour:A.lawnLight,items:[[-126,-100,18,11,.2],[-101,-58,16,10,.7],[-121,4,17,12,1.1],[-117,77,18,11,.4],[-89,108,17,12,1.4],[-63,-113,20,11,.3],[-19,-111,19,12,.9],[31,-115,18,11,.5],[76,-109,19,12,1.2],[117,-84,17,11,.2],[121,-23,18,12,.8],[123,37,19,12,1.3],[119,99,17,11,.4],[75,116,19,12,.9],[30,113,20,11,.2],[-19,115,18,12,1.1],[-74,116,19,12,.6],[-106,87,17,11,1.5],[-109,-27,18,12,.4],[-90,47,18,11,.9],[-64,-13,17,11,.2],[65,-14,19,12,1.3],[91,68,19,12,.7],[25,-79,16,10,.4],[-25,-78,16,10,1.1]]},
    {colour:A.lawnDark,items:[[-113,-80,10,7,.4],[-83,-95,11,7,1],[-123,51,10,7,.7],[-58,101,11,7,.3],[-42,-112,10,7,1.2],[54,-116,11,7,.5],[100,-104,10,7,1.4],[123,8,10,7,.2],[103,51,11,7,.9],[99,113,10,7,.6],[53,112,11,7,1.5],[-47,115,10,7,.4],[-98,110,11,7,1.1],[-117,22,10,7,.8],[-74,67,11,7,.3],[75,40,10,7,1.2],[45,-84,11,7,.6]]}
  ];
  useLayoutEffect(()=>{patches.forEach((set,setIndex)=>{const mesh=refs.current[setIndex];set.items.forEach(([x,z,w,h,yaw],i)=>{const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,yaw));const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,-.05,z),rotation,new THREE.Vector3(w*.72,h*.72,1));mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();});},[]);
  return <group name="grass-colour-variation">{patches.map((set,i)=><instancedMesh key={set.colour} ref={node=>refs.current[i]=node} args={[geometry,undefined,set.items.length]} castShadow={false} receiveShadow={false}><meshStandardMaterial color={set.colour} roughness={1}/></instancedMesh>)}</group>;
}
function StaticInstances({geometry,material,matrices}){const ref=useRef();useLayoutEffect(()=>{matrices.forEach((m,i)=>ref.current.setMatrixAt(i,m));ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[matrices]);return <instancedMesh ref={ref} args={[geometry,material,matrices.length]} castShadow receiveShadow dispose={null}/>;}
export function CampusLandscape(){return <><CampusDistrictContext/><StylizedLandscape/><DistrictStreetTrees/><CampusLamps/></>;}
function CampusLamps(){
  const placements=useMemo(()=>[-1,1].flatMap(s=>[-52,-18,18,52].map(x=>[x,s*61])),[]);
  const parts=useMemo(()=>{
    const metal=new THREE.MeshStandardMaterial({color:'#526267',metalness:.75,roughness:.35});
    const light=new THREE.MeshStandardMaterial({color:'#fff4d9',emissive:'#f6f1db',emissiveIntensity:.05,side:THREE.DoubleSide});
    return [[new THREE.CylinderGeometry(.05,.075,4.6,16),metal,[0,2.3,0]],[new THREE.BoxGeometry(1.05,.12,.28),metal,[.45,4.6,0]],[new THREE.PlaneGeometry(.9,.23),light,[.45,4.525,0]]].map(([geometry,material,offset])=>({geometry,material,matrices:placements.map(([x,z])=>new THREE.Matrix4().makeTranslation(x+offset[0],offset[1],z))}));
  },[placements]);
  useEffect(()=>()=>{parts.forEach(p=>p.geometry.dispose());new Set(parts.map(p=>p.material)).forEach(m=>m.dispose());},[parts]);
  return <group name="campus-lamps">{parts.map((p,i)=><StaticInstances key={i} {...p}/>)}</group>;
}
useGLTF.preload(OFFICE_URL);
