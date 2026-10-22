import * as THREE from 'three';
import {mergeStaticChildren} from './MergeStaticMeshes.js';

// Original hard-surface concept, metres / +Y up / nose +Z. ISC.
// Authored as a separable model; mission authority stays in the Python backend.
export function createMotherVehicle() {
  const root = new THREE.Group(); root.name = 'MOTHER_CARRIER';
  const paint = new THREE.MeshPhysicalMaterial({name:'ceramic_paint',color:'#e6e9e5',metalness:.18,roughness:.28,clearcoat:.7,clearcoatRoughness:.26});
  const graphite = new THREE.MeshStandardMaterial({name:'graphite_composite',color:'#263238',metalness:.38,roughness:.42});
  const rubber = new THREE.MeshStandardMaterial({name:'tyre_rubber',color:'#15191b',metalness:0,roughness:.86});
  const steel = new THREE.MeshStandardMaterial({name:'brushed_aluminium',color:'#8a979c',metalness:.88,roughness:.3});
  const darkSteel = new THREE.MeshStandardMaterial({name:'anodized_metal',color:'#313e44',metalness:.8,roughness:.3});
  const glass = new THREE.MeshPhysicalMaterial({name:'sensor_glass',color:'#071c27',metalness:.15,roughness:.13,clearcoat:1});
  const cyan = new THREE.MeshStandardMaterial({name:'status_strip',color:'#2baca4',emissive:'#16716c',emissiveIntensity:.22,roughness:.28});
  const whiteLight = new THREE.MeshStandardMaterial({name:'headlight',color:'#f2f1da',emissive:'#e8f3ed',emissiveIntensity:.4,roughness:.22});
  const amber = new THREE.MeshStandardMaterial({name:'reflector',color:'#dfa54f',roughness:.32});
  const mesh = (name,geometry,material,position=[0,0,0],parent=root) => {
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  function plate(name,w,h,d,r,material,position,parent=root) {
    const s=new THREE.Shape();const x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
    s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
    s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
    const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:Math.min(.008,r/3),bevelThickness:.008,bevelSegments:3,curveSegments:10,steps:1});g.translate(0,0,-d/2);
    return mesh(name,g,material,position,parent);
  }
  // Rounded cross-sections lofted into a tapered, continuous shell.
  function shell(name,sections,material,receivingOpening=false){
    const vertices=[],indices=[];const n=80;
    for(const [z,w,h,y] of sections){
      for(let i=0;i<n;i++){
        const a=i/n*Math.PI*2;const cos=Math.cos(a),sin=Math.sin(a);
        vertices.push(Math.sign(cos)*Math.pow(Math.abs(cos),.31)*w/2,y+Math.sign(sin)*Math.pow(Math.abs(sin),.31)*h/2,z);
      }
    }
    for(let j=0;j<sections.length-1;j++) for(let i=0;i<n;i++){
      const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+i,d=(j+1)*n+(i+1)%n;
      const middleX=(vertices[a*3]+vertices[b*3])/2;
      if(receivingOpening&&sections[j][0]>=-.88&&sections[j+1][0]<=.58&&Math.abs(middleX)<.66&&vertices[a*3+1]>1.52&&vertices[b*3+1]>1.52)continue;
      indices.push(a,b,c,b,d,c);
    }
    for(const [section,reverse] of [[0,true],[sections.length-1,false]]){
      const start=vertices.length/3; const [z,, ,y]=sections[section];vertices.push(0,y,z);
      for(let i=0;i<n;i++){const a=section*n+i,b=section*n+(i+1)%n;indices.push(start,reverse?b:a,reverse?a:b);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
    return mesh(name,g,material);
  }
  shell('structural_chassis',[[-1.91,1.69,.25,.43],[-1.65,1.92,.31,.45],[1.65,1.92,.31,.45],[1.96,1.69,.25,.43]],graphite);
  shell('cargo_shell',[[-1.94,1.72,.91,1.03],[-1.8,1.91,1.05,1.065],[-1.5,1.99,1.1,1.09],[-.88,1.99,1.1,1.09],[.58,1.99,1.1,1.09],[1.24,1.99,1.1,1.09],[1.66,1.91,1.04,1.055],[1.96,1.69,.83,.98]],paint,true);
  for(const end of [-1,1]){
    plate('bumper_'+end,1.91,.2,.13,.065,rubber,[0,.49,end*1.99]);
    plate('sensor_band_'+end,1.52,.26,.035,.07,glass,[0,1.13,end*1.964]);
    for(const x of [-.49,0,.49]){
      const sensor=mesh('optical_sensor_'+end+'_'+x,new THREE.CylinderGeometry(.047,.047,.04,40),darkSteel,[x,1.14,end*1.996]);sensor.rotation.x=Math.PI/2;
      const lens=mesh('optical_lens_'+end+'_'+x,new THREE.CircleGeometry(.032,32),glass,[x,1.14,end*2.019]);if(end<0)lens.rotation.y=Math.PI;
    }
    for(const side of [-1,1]){
      plate('lamp_'+end+'_'+side,.26,.064,.03,.016,end>0?whiteLight:amber,[side*.70,.73,end*1.977]);
      plate('tow_cover_'+end+'_'+side,.13,.06,.025,.018,darkSteel,[side*.55,.49,end*2.065]);
    }
  }
  // Side doors are independent meshes with fine seals, handles and hinges.
  for(const side of [-1,1]){
    for(const [i,z] of [[0,-.78],[1,.61]]){
      const seal=plate('cargo_seal_'+side+'_'+i,1.31,.80,.022,.045,graphite,[side*.997,1.075,z]);seal.rotation.y=side*Math.PI/2;
      const door=plate('cargo_door_'+side+'_'+i,1.275,.765,.03,.04,paint,[side*1.011,1.075,z]);door.rotation.y=side*Math.PI/2;
      const handle=plate('recessed_handle_'+side+'_'+i,.20,.046,.025,.015,graphite,[side*1.034,1.10,z+.38]);handle.rotation.y=side*Math.PI/2;
      const strip=plate('side_status_'+side+'_'+i,.45,.025,.018,.009,cyan,[side*1.034,.735,z-.13]);strip.rotation.y=side*Math.PI/2;
      for(const yy of [.83,1.32]){
        const hinge=plate('hinge_'+side+'_'+i+'_'+yy,.07,.055,.04,.014,steel,[side*1.04,yy,z-.48]);hinge.rotation.y=side*Math.PI/2;
      }
    }
    const skirt=plate('lower_sill_'+side,3.32,.082,.035,.025,darkSteel,[side*.967,.57,0]);skirt.rotation.y=side*Math.PI/2;
    // Fine cooling slots and fasteners near the rear electronics compartment.
    for(let i=0;i<8;i++){
      const vent=plate('vent_'+side+'_'+i,.025,.17,.012,.006,graphite,[side*.925,1.21,-1.62+i*.034]);vent.rotation.y=side*Math.PI/2;
    }
  }
  // One receiving bay; the runtime scene adds three compact external charging cradles
  // so aircraft can remain attached to the carrier while it moves.
  const frameShape=new THREE.Shape();frameShape.moveTo(-.68,-.79);frameShape.lineTo(.68,-.79);frameShape.lineTo(.68,.79);frameShape.lineTo(-.68,.79);frameShape.closePath();
  const opening=new THREE.Path();opening.moveTo(-.565,-.625);opening.lineTo(-.565,.625);opening.lineTo(.565,.625);opening.lineTo(.565,-.625);opening.closePath();frameShape.holes.push(opening);
  const roofSeal=mesh('roof_bay_frame',new THREE.ExtrudeGeometry(frameShape,{depth:.04,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2}),graphite,[0,1.64,-.15]);roofSeal.rotation.x=-Math.PI/2;
  mesh('bay_floor',new THREE.BoxGeometry(1.18,.045,2.1),darkSteel,[0,1.025,-.55]);
  for(const x of [-.585,.585])mesh('bay_inner_wall',new THREE.BoxGeometry(.04,.59,1.30),graphite,[x,1.335,-.15]);
  mesh('bay_inner_wall',new THREE.BoxGeometry(1.18,.59,.04),graphite,[0,1.335,.495]);
  for(let z=-1.4;z<.45;z+=.14){const roller=mesh('cargo_conveyor_roller',new THREE.CylinderGeometry(.029,.029,1.02,24),steel,[0,1.06,z]);roller.rotation.z=Math.PI/2;}
  const roof=new THREE.Group();roof.name='roof_hatch_pivot';roof.position.set(-.60,1.66,-.15);root.add(roof);
  const hatch=plate('roof_hatch',1.24,1.35,.035,.105,darkSteel,[.60,0,0],roof);hatch.rotation.x=-Math.PI/2;
  for(const x of [-.44,.44]){
    const rail=plate('receiving_rail_'+x,.026,.90,.018,.008,steel,[.60+x,.028,0],roof);rail.rotation.x=-Math.PI/2;
  }
  const stripe=plate('roof_alignment_mark',.14,.41,.005,.01,cyan,[.60,.029,0],roof);stripe.rotation.x=-Math.PI/2;
  for(const z of [-.72,.41]) for(const x of [-.50,.50]){
    mesh('bay_fastener',new THREE.CylinderGeometry(.018,.018,.012,16),steel,[.60+x,.027,z+.15],roof);
  }
  // Roof sensor mast, separate from the receiving hatch.
  mesh('lidar_base',new THREE.CylinderGeometry(.11,.14,.09,48),graphite,[0,1.65,1.43]);
  mesh('lidar_glass',new THREE.CylinderGeometry(.105,.105,.12,64),glass,[0,1.74,1.43]);
  mesh('lidar_cap',new THREE.CylinderGeometry(.108,.105,.028,64),paint,[0,1.815,1.43]);
  for(const x of [-.58,.58])mesh('radio_aerial',new THREE.CylinderGeometry(.008,.014,.15,12),graphite,[x,1.69,1.38]);

  const tyreProfile=[new THREE.Vector2(.235,-.15),new THREE.Vector2(.32,-.15),new THREE.Vector2(.365,-.115),new THREE.Vector2(.38,-.065),new THREE.Vector2(.382,.065),new THREE.Vector2(.365,.115),new THREE.Vector2(.32,.15),new THREE.Vector2(.235,.15),new THREE.Vector2(.235,-.15)];
  for(const [key,side,z] of [['fl',-1,1.38],['fr',1,1.38],['rl',-1,-1.38],['rr',1,-1.38]]){
    const steering=new THREE.Group();steering.name='steering_'+key;steering.position.set(side*1.01,.382,z);root.add(steering);
    const wheel=new THREE.Group();wheel.name='wheel_'+key;steering.add(wheel);
    const tyre=mesh('tyre_'+key,new THREE.LatheGeometry(tyreProfile,80),rubber,[0,0,0],wheel);tyre.rotation.z=-Math.PI/2;
    const rim=mesh('rim_'+key,new THREE.CylinderGeometry(.245,.245,.24,64),steel,[0,0,0],wheel);rim.rotation.z=-Math.PI/2;
    const inset=mesh('rim_inset_'+key,new THREE.CylinderGeometry(.20,.20,.255,64),darkSteel,[0,0,0],wheel);inset.rotation.z=-Math.PI/2;
    const hub=mesh('motor_hub_'+key,new THREE.CylinderGeometry(.095,.095,.285,48),steel,[0,0,0],wheel);hub.rotation.z=-Math.PI/2;
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const spoke=plate('spoke_'+key+'_'+i,.035,.147,.032,.009,steel,[side*.134,Math.cos(a)*.151,Math.sin(a)*.151],wheel);spoke.rotation.y=Math.PI/2;spoke.rotateZ(a);
      const bolt=mesh('wheel_bolt_'+key+'_'+i,new THREE.CylinderGeometry(.011,.011,.018,6),darkSteel,[side*.156,Math.cos(a)*.074,Math.sin(a)*.074],wheel);bolt.rotation.z=-Math.PI/2;
    }
    for(let i=0;i<64;i++) for(const row of [-1,1]){
      const a=(i+.24*row)/64*Math.PI*2;
      const tread=mesh('tread_'+key+'_'+row+'_'+i,new THREE.BoxGeometry(.113,.007,.020),rubber,[row*.063,Math.cos(a)*.382,Math.sin(a)*.382],wheel);tread.rotation.x=a;tread.rotation.y=row*.2;
    }
    // Suspension and protective arches are attached to the chassis, not tyre pivots.
    const axle=mesh('axle_'+key,new THREE.CylinderGeometry(.049,.049,.3,24),darkSteel,[side*.84,.382,z]);axle.rotation.z=Math.PI/2;
    const arch=mesh('wheel_arch_'+key,new THREE.TorusGeometry(.429,.036,10,52,Math.PI),graphite,[side*1.05,.382,z]);arch.rotation.y=Math.PI/2;
  }
  root.userData={license:'ISC',author:'Digital Twin Logistics project',units:'metres',axis:'Y-up, nose +Z',purpose:'original medium driverless logistics mother concept; not yet production accepted'};
  root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isGroup&&o!==root)mergeStaticChildren(o);});
  mergeStaticChildren(root);
  return root;
}
