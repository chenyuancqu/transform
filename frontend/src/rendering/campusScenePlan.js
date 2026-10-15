export const CAMPUS_BUILDINGS=[
  {id:'A1',name:'创新研发中心',position:[-50,0,-87],yaw:0,visualScale:[1,.88,1.25]},
  {id:'A2',name:'智能技术中心',position:[50,0,-87],yaw:0,visualScale:[1,.92,1.25]},
  {id:'OPS',name:'调度共享中心',position:[0,0,-87],yaw:0,height:9.8},
  {id:'B1',name:'企业研发中心',position:[-33,0,87],yaw:Math.PI,visualScale:[1,.86,1.25]},
  {id:'B2',name:'协同创新中心',position:[33,0,87],yaw:Math.PI,visualScale:[1,.9,1.25]},
  {id:'C1',name:'西区实验中心',position:[-101,0,0],yaw:Math.PI/2,visualScale:[1,.88,1.25]},
  {id:'C2',name:'东区服务中心',position:[101,0,0],yaw:-Math.PI/2,visualScale:[1,.9,1.25]}
];
export const BALCONY_FLOORS=[3,5,7,9];
// Outside the mother vehicle's [-30,30] square and the direct pickup corridors.
export const GARDENS=[[-50,-54],[50,-54],[-50,54],[50,54]];
export const LOW_GARDENS=[[-40,-20],[-40,20],[40,-20],[40,20]];
export const CAMPUS_TREES=[
  ...GARDENS.flatMap(([x,z])=>[[x,z,8.8],[x-4.5,z-1.5,6.2],[x+4,z+2,7.0]]),
  ...[-84,84].flatMap(x=>[-46,-29,29,46].map(z=>[x,z,8.2])),
  ...[-74,74].flatMap(z=>[-68,-30,30,68].map(x=>[x,z,8.0])),
  ...[-108,108].flatMap(x=>[-76,76].map(z=>[x,z,9.0])),
  ...[-108,108].flatMap(z=>[-90,-70,-30,30,70,90].map(x=>[x,z,9.5])),
  ...[-126,126].flatMap(x=>[-90,-60,-28,28,60,90].map(z=>[x,z,9.5]))
];
export const DISTRICT_TREES=(()=>{
  const roads=[-210,-120,120,210],result=[];
  for(const road of roads)for(let along=-350,index=0;along<=350;along+=46,index++){
    if(roads.some(other=>Math.abs(along-other)<14))continue;
    result.push([along,road+Math.sign(road)*7.5,9+(index%3)*.6,index*.73],
      [road+Math.sign(road)*7.5,along,9.2+(index%3)*.55,index*.91]);
  }
  return result;
})();
export const OFFICE_DIMENSIONS={width:46.712,depth:18.75,height:33.44,front:8.073};
