import React,{useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const STREETS=[-390,-300,-210,-120,120,210,300,390];
const EXTENT=840;
const COLORS=['#efe6d6','#e7ebdc','#e4e9e2','#f0e9dc','#dfe9e4','#e9e2d6'];
const makeRecord=(x,y,z,w,h,d,colour)=>({x,y,z,w,h,d,colour});
const boxMatrix=({x,y,z,w,h,d})=>new THREE.Matrix4().compose(
  new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(w,h,d)
);
const groundMatrix=({x,y=-.025,z,w,d})=>new THREE.Matrix4().compose(
  new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)),new THREE.Vector3(w,d,1)
);

function buildDistrict(){
  const roads=[],sidewalks=[],paint=[],bodies=[],roofs=[],windows=[],mullions=[],ledges=[],rooftop=[];
  for(const line of STREETS){
    roads.push({x:0,y:-.025,z:line,w:EXTENT,d:8.4},{x:line,y:-.018,z:0,w:8.4,d:EXTENT});
    for(const edge of [-1,1]){
      sidewalks.push({x:0,y:-.025,z:line+edge*5.3,w:EXTENT,d:1.55},{x:line+edge*5.3,y:-.018,z:0,w:1.55,d:EXTENT});
    }
    for(let offset=-414;offset<=414;offset+=14){
      if(STREETS.some(other=>Math.abs(offset-other)<7))continue;
      paint.push({x:offset,y:-.012,z:line,w:2.5,d:.12},{x:line,y:-.005,z:offset,w:.12,d:2.5});
    }
  }
  // Four short, narrow connectors tie the campus entry roads into the local grid.
  roads.push({x:-101,y:.014,z:0,w:42,d:6.5},{x:101,y:.014,z:0,w:42,d:6.5},{x:0,y:.014,z:-96,w:6.5,d:48},{x:0,y:.014,z:96,w:6.5,d:48});

  const centers=[-345,-255,-165,165,255,345];
  let index=0;
  for(const z of centers)for(const x of centers){
    const width=37+(index*7%13),depth=26+(index*5%11),height=15+(index*11%16);
    const colour=COLORS[index%COLORS.length],floorCount=Math.max(4,Math.round(height/3.15));
    bodies.push(makeRecord(x,height/2,z,width,height,depth,colour));
    roofs.push(makeRecord(x,height+.18,z,width+.8,.36,depth+.8,'#f6f1e5'));
    rooftop.push(makeRecord(x+((index%3)-1)*4,height+.48,z+(index%2?3:-3),5,.52,3.4,index%2?'#b8c8bd':'#d5d8ce'));
    for(let floor=0;floor<floorCount;floor++){
      const y=1.85+floor*3.05;if(y>height-1.7)continue;
      const bandHeight=1.55;
      windows.push(
        makeRecord(x,y,z-depth/2-.07,width-2,bandHeight,.15,'#8bbab8'),
        makeRecord(x,y,z+depth/2+.07,width-2,bandHeight,.15,'#8bbab8'),
        makeRecord(x-width/2-.07,y,z,.15,bandHeight,depth-2,'#8bbab8'),
        makeRecord(x+width/2+.07,y,z,.15,bandHeight,depth-2,'#8bbab8')
      );
      const trimY=y-bandHeight/2-.16;
      ledges.push(
        makeRecord(x,trimY,z-depth/2-.13,width,.14,.14,'#faf4e8'),
        makeRecord(x,trimY,z+depth/2+.13,width,.14,.14,'#faf4e8'),
        makeRecord(x-width/2-.13,trimY,z,.14,.14,depth,'#faf4e8'),
        makeRecord(x+width/2+.13,trimY,z,.14,.14,depth,'#faf4e8')
      );
      for(let bay=-Math.floor((width-4)/6);bay<=Math.floor((width-4)/6);bay++){
        const mullionX=x+bay*6;
        mullions.push(makeRecord(mullionX,y,z-depth/2-.16,.12,bandHeight+.22,.12,'#e8e9dc'),makeRecord(mullionX,y,z+depth/2+.16,.12,bandHeight+.22,.12,'#e8e9dc'));
      }
      for(let bay=-Math.floor((depth-4)/6);bay<=Math.floor((depth-4)/6);bay++){
        const mullionZ=z+bay*6;
        mullions.push(makeRecord(x-width/2-.16,y,mullionZ,.12,bandHeight+.22,.12,'#e8e9dc'),makeRecord(x+width/2+.16,y,mullionZ,.12,bandHeight+.22,.12,'#e8e9dc'));
      }
    }
    index++;
  }
  return {roads,sidewalks,paint,bodies,roofs,windows,mullions,ledges,rooftop};
}

function InstanceBatch({records,geometry,materialProps,colourInstances=false,castShadow=false}){
  const ref=useRef();
  useLayoutEffect(()=>{
    if(!ref.current)return;
    records.forEach((record,index)=>{
      ref.current.setMatrixAt(index,geometry.type==='PlaneGeometry'?groundMatrix(record):boxMatrix(record));
      if(colourInstances&&record.colour)ref.current.setColorAt(index,new THREE.Color(record.colour));
    });
    ref.current.instanceMatrix.needsUpdate=true;
    if(colourInstances)ref.current.instanceColor.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[records,geometry,colourInstances]);
  return <instancedMesh ref={ref} args={[geometry,undefined,records.length]} castShadow={castShadow} receiveShadow><meshStandardMaterial {...materialProps}/></instancedMesh>;
}

export function CampusDistrictContext(){
  const data=useMemo(buildDistrict,[]);
  const geometries=useMemo(()=>({
    road:new THREE.PlaneGeometry(1,1),
    body:new RoundedBoxGeometry(1,1,1,3,.025),
    roof:new RoundedBoxGeometry(1,1,1,3,.035),
    window:new THREE.BoxGeometry(1,1,1),
    detail:new THREE.BoxGeometry(1,1,1)
  }),[]);
  useEffect(()=>()=>Object.values(geometries).forEach(geometry=>geometry.dispose()),[geometries]);
  const roadMaterial={color:'#8d9b98',roughness:.96};
  return <group name="surrounding-district">
    <group name="district-road-network">
      <InstanceBatch records={data.roads} geometry={geometries.road} materialProps={roadMaterial}/>
      <InstanceBatch records={data.sidewalks} geometry={geometries.road} materialProps={{color:'#d8d8c9',roughness:.93}}/>
      <InstanceBatch records={data.paint} geometry={geometries.road} materialProps={{color:'#f1ebd9',roughness:.9}}/>
    </group>
    <group name="district-buildings">
      <InstanceBatch records={data.bodies} geometry={geometries.body} materialProps={{color:'#ffffff',roughness:.86}} colourInstances castShadow/>
      <InstanceBatch records={data.roofs} geometry={geometries.roof} materialProps={{color:'#ffffff',roughness:.8}} colourInstances castShadow/>
      <InstanceBatch records={data.windows} geometry={geometries.window} materialProps={{color:'#ffffff',metalness:.04,roughness:.32}} colourInstances/>
      <InstanceBatch records={data.ledges} geometry={geometries.detail} materialProps={{color:'#ffffff',roughness:.78}} colourInstances/>
      <InstanceBatch records={data.mullions} geometry={geometries.detail} materialProps={{color:'#ffffff',roughness:.8}} colourInstances/>
      <InstanceBatch records={data.rooftop} geometry={geometries.body} materialProps={{color:'#ffffff',roughness:.83}} colourInstances/>
    </group>
  </group>;
}
