import React,{useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {useThree,useFrame} from '@react-three/fiber';
import {useGLTF,Environment} from '@react-three/drei';
import * as THREE from 'three';
import {createOfficeArchitecture,OFFICE_GLASS_TEXTURE} from './OfficeArchitecture.js';
import {StylizedLandscape,DistrictStreetTrees} from './StylizedLandscape.jsx';
import {CampusDistrictContext} from './CampusDistrictContext.jsx';
import {CAMPUS_BUILDINGS,GARDENS} from './campusScenePlan.js';

// Static shadows remain valid while all devices are paused. Camera movement
// does not move the fixed daylight shadow camera or change model geometry.
export function CampusShadowCache({running=false}){
  const {gl}=useThree(),last=useRef(-Infinity);
  useLayoutEffect(()=>{gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;return()=>{gl.shadowMap.autoUpdate=true;};},[gl,running]);
  useFrame(({clock})=>{const now=clock.elapsedTime;if(running&&now-last.current>=1/30){gl.shadowMap.needsUpdate=true;last.current=now;}const audit=document.getElementById('render-audit');if(audit)audit.dataset.running=String(running);});
  return null;
}
export const campusSurfaceHeight=()=>0;
export const OFFICE_URL='/assets/campus/optimized/buildings/office.gltf';
function prepareOffice(scene,label,height){
  const object=scene.clone(true),materials=new Map();
  object.traverse(o=>{if(!o.isMesh)return;const source=o.material;if(!materials.has(source)){let m=source.clone();m.forceSinglePass=true;
    // Remove the scanned photo surfaces from the display copy. The source GLB
    // remains untouched; flat colour keeps the approved building geometry but
    // brings its visual language in line with the rounded campus assets.
    for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','bumpMap','alphaMap','lightMap'])m[slot]=null;
    const palette={
      walls_exterior:'#f2eadb',rams:'#eee1ca',
      Material_17:'#eee6d8',walls_BLD_OFFICE_05:'#f2eadb',material:'#efe7d9',
      Color_007:'#405f74',Blinds_Roman_Hobbled_Blue:'#b7d9df'
    };
    if(m.name==='glass'){
      const name=m.name;m.dispose();
      m=new THREE.MeshPhysicalMaterial({name,map:OFFICE_GLASS_TEXTURE,color:'#f5fff9',roughness:.27,metalness:.05,clearcoat:.34,clearcoatRoughness:.24,envMapIntensity:.2,side:THREE.DoubleSide});
    }else if(palette[m.name])m.color.set(palette[m.name]);
    m.roughness=m.name==='glass'?.27:.84;m.metalness=m.name==='glass'?.05:.02;m.envMapIntensity=m.name==='glass'?.2:.08;
    m.needsUpdate=true;materials.set(source,m);
  }o.material=materials.get(source);});
  object.add(createOfficeArchitecture(label,height));object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.forceSinglePass=true;}});
  return object;
}
function disposeOffice(object){
  const accents=object.getObjectByName('original-office-accents');
  accents?.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  accents?.getObjectByName('entrance-sign')?.material.map?.dispose();
  const materials=new Set();object.traverse(o=>{if(o.isMesh)materials.add(o.material);});materials.forEach(m=>m.dispose());
}
export function CampusBuildings(){
  const {scene}=useGLTF(OFFICE_URL),offices=CAMPUS_BUILDINGS.filter(b=>(b.height??32)>=20),low=CAMPUS_BUILDINGS.filter(b=>(b.height??32)<20);
  const template=useMemo(()=>prepareOffice(scene,'NEXUS / INNOVATION',32),[scene]);
  const parts=useMemo(()=>{template.updateMatrixWorld(true);const parts=[];template.traverse(mesh=>{if(!mesh.isMesh)return;parts.push({geometry:mesh.geometry,material:mesh.material,matrices:offices.map(b=>new THREE.Matrix4().compose(new THREE.Vector3(...b.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw),new THREE.Vector3(1,1,1)).multiply(mesh.matrixWorld))});});return parts;},[template]);
  useEffect(()=>()=>disposeOffice(template),[template]);
  return <><group name="campus-buildings-batch">{parts.map((p,i)=><StaticInstances key={i} {...p}/>)}</group>{offices.map(b=><group key={b.id} name={'campus-building-'+b.id} position={b.position} userData={{labelHeight:35}}/>)}{low.map(b=><OfficeBuilding key={b.id} {...b}/>)}</>;
}
export function OfficeBuilding({id,name,position,yaw,height=32}){
  const {scene}=useGLTF(height<20?'/assets/campus/optimized/buildings/dispatch.gltf':OFFICE_URL);
  const object=useMemo(()=>prepareOffice(scene,`${id} / NEXUS INNOVATION`,height),[scene,id,height]);
  useEffect(()=>()=>disposeOffice(object),[object]);
  return <group position={position} rotation-y={yaw} name={`campus-building-${id}`} userData={{labelHeight:height+3}}><primitive object={object}/></group>;
}
function MetrePlaneGeometry({args}){const geometry=useMemo(()=>{const g=new THREE.PlaneGeometry(...args),position=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i),position.getY(i));return g;},[args[0],args[1]]);useEffect(()=>()=>geometry.dispose(),[geometry]);return <primitive attach="geometry" object={geometry}/>;}
function roundedPath(w,h,r,Path=THREE.Shape){const s=new Path(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;}
function RingSurface({w,h,width,r,y,material}){const g=useMemo(()=>{const s=roundedPath(w,h,r);s.holes.push(roundedPath(w-width*2,h-width*2,Math.max(.3,r-width),THREE.Path));return new THREE.ShapeGeometry(s,20);},[w,h,width,r]);return <mesh geometry={g} rotation-x={-Math.PI/2} position={[0,y,0]} receiveShadow><meshStandardMaterial {...material}/></mesh>;}
function Path({from,to,width,material}){const dx=to[0]-from[0],dz=to[1]-from[1];return <mesh position={[(from[0]+to[0])/2,.012,(from[1]+to[1])/2]} rotation={[-Math.PI/2,0,Math.atan2(dx,dz)]} receiveShadow><MetrePlaneGeometry args={[width,Math.hypot(dx,dz)]}/><meshStandardMaterial {...material}/></mesh>;}
export function CampusDaylight(){return <><color attach="background" args={['#d5ebf5']}/><fog attach="fog" args={['#d5ebf5',420,900]}/><hemisphereLight intensity={1.9} color="#f6fbff" groundColor="#d8dfca"/><ambientLight intensity={.35} color="#fff8e9"/><directionalLight position={[-85,130,65]} intensity={1.5} color="#fff8eb" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-140} shadow-camera-right={140} shadow-camera-top={140} shadow-camera-bottom={-140} shadow-camera-far={360} shadow-bias={-.0001} shadow-normalBias={.025}/><Environment files="/assets/campus/environment/kloofendal_48d_partly_cloudy_puresky/sky.hdr" environmentIntensity={.35}/></>;}
export function DesignedCampusGround(){
  const grass={color:'#94ad83',roughness:1},paving={color:'#f2eadb',roughness:.9},asphalt={color:'#8197a4',roughness:.92};
  // Shape UVs are metre coordinates; repeat .17 means one asphalt tile / 6m.
  const pathMat=paving,roadMat=asphalt;
  return <group>
    <mesh rotation-x={-Math.PI/2} position={[0,-.075,0]} receiveShadow><MetrePlaneGeometry args={[1200,1100]}/><meshStandardMaterial {...grass}/></mesh>
    <GrassColourVariation/>
    <RingSurface w={163} h={143} width={1.3} r={13} y={.035} material={{color:'#c7c9bf',roughness:.88}}/>
    <RingSurface w={160.4} h={140.4} width={6.4} r={11.7} y={-.005} material={roadMat}/>
    <RingSurface w={147.6} h={127.6} width={1.4} r={5.3} y={.025} material={{color:'#d7d9cc',roughness:.85}}/>
    <mesh rotation-x={-Math.PI/2} receiveShadow><MetrePlaneGeometry args={[64,64]}/><meshStandardMaterial {...pathMat}/></mesh>
    <RingSurface w={65} h={65} width={.45} r={3} y={.009} material={{color:'#abb8b2',roughness:.9}}/>
    <Path from={[0,-72]} to={[0,72]} width={5.5} material={pathMat}/><Path from={[-78,0]} to={[78,0]} width={5.5} material={pathMat}/>
    {[[[-32,-32],[-60,-40]],[[32,-32],[60,-40]],[[-32,32],[-40,40]],[[32,32],[40,40]]].map(([from,to],i)=><Path key={i} from={from} to={to} width={3} material={pathMat}/>)}
    {CAMPUS_BUILDINGS.map(b=>{const x=b.position[0],z=b.position[2];return <mesh key={b.id} position={[x,.013,z]} rotation={[-Math.PI/2,0,-b.yaw]} receiveShadow><MetrePlaneGeometry args={[b.height<20?47:53,26]}/><meshStandardMaterial {...pathMat}/></mesh>;})}
    {[-1,1].flatMap(s=>(s<0?[-50,0,50]:[-33,33]).map(x=><Path key={s+'-'+x} from={[x,s*62]} to={[x,s*79]} width={9} material={pathMat}/>))}
    {[-1,1].map(s=><Path key={s} from={[s*69,0]} to={[s*88,0]} width={9} material={pathMat}/>)}
    {GARDENS.map(([x,z],i)=><group key={i} position={[x,0,z]}><mesh rotation-x={-Math.PI/2} position={[0,.025,0]} receiveShadow><shapeGeometry args={[roundedPath(16,10,2.3)]}/><meshStandardMaterial color="#e7dfcb" roughness={.85}/></mesh><mesh rotation-x={-Math.PI/2} position={[0,.045,0]} receiveShadow><shapeGeometry args={[roundedPath(15,9,2)]}/><meshStandardMaterial {...grass}/></mesh></group>)}
    <RoadPaint/>
    <Path from={[77,67]} to={[112,67]} width={6.4} material={roadMat}/>
    <mesh position={[111,-.005,62]} rotation-x={-Math.PI/2} receiveShadow><MetrePlaneGeometry args={[22,30]}/><meshStandardMaterial {...asphalt} color="#707b7c"/></mesh>
  </group>;
}
// The same 118 markings use one draw call, with per-instance colour and size.
function RoadPaint(){
  const ref=useRef();
  useLayoutEffect(()=>{
    const placements=[];
    for(const s of [-1,1]){
      for(let i=0;i<23;i++){const t=-61+i*5.5;placements.push([t,.008,s*67,2.2,.12,'#e6e4d3'],[s*77,.008,t,.12,2.2,'#e6e4d3']);}
      for(let i=0;i<9;i++)placements.push([-3+i*.75,.012,s*67,.4,6.1,'#e9e9d9']);
    }
    for(let i=0;i<8;i++)placements.push([107,.012,49+i*3.2,6,.07,'#e9e7d8']);
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    placements.forEach(([x,y,z,w,h,colour],i)=>{ref.current.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),rotation,new THREE.Vector3(w,h,1)));ref.current.setColorAt(i,new THREE.Color(colour));});
    ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();
  },[]);
  return <instancedMesh ref={ref} args={[undefined,undefined,118]} name="campus-road-paint"><planeGeometry args={[1,1]}/><meshStandardMaterial color="white" roughness={.9}/></instancedMesh>;
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
    {colour:'#a3b98f',items:[[-126,-100,18,11,.2],[-101,-58,16,10,.7],[-121,4,17,12,1.1],[-117,77,18,11,.4],[-89,108,17,12,1.4],[-63,-113,20,11,.3],[-19,-111,19,12,.9],[31,-115,18,11,.5],[76,-109,19,12,1.2],[117,-84,17,11,.2],[121,-23,18,12,.8],[123,37,19,12,1.3],[119,99,17,11,.4],[75,116,19,12,.9],[30,113,20,11,.2],[-19,115,18,12,1.1],[-74,116,19,12,.6],[-106,87,17,11,1.5],[-109,-27,18,12,.4],[-90,47,18,11,.9],[-64,-13,17,11,.2],[65,-14,19,12,1.3],[91,68,19,12,.7],[25,-79,16,10,.4],[-25,-78,16,10,1.1]]},
    {colour:'#879f78',items:[[-113,-80,10,7,.4],[-83,-95,11,7,1],[-123,51,10,7,.7],[-58,101,11,7,.3],[-42,-112,10,7,1.2],[54,-116,11,7,.5],[100,-104,10,7,1.4],[123,8,10,7,.2],[103,51,11,7,.9],[99,113,10,7,.6],[53,112,11,7,1.5],[-47,115,10,7,.4],[-98,110,11,7,1.1],[-117,22,10,7,.8],[-74,67,11,7,.3],[75,40,10,7,1.2],[45,-84,11,7,.6]]}
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
