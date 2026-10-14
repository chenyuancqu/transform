export const CAMPUS_BUILDINGS=[
  {id:'A1',name:'创新研发中心',position:[-50,0,-87],yaw:0},
  {id:'A2',name:'智能技术中心',position:[50,0,-87],yaw:0},
  {id:'OPS',name:'调度共享中心',position:[0,0,-87],yaw:0,height:9.8},
  {id:'B1',name:'企业研发中心',position:[-33,0,87],yaw:Math.PI},
  {id:'B2',name:'协同创新中心',position:[33,0,87],yaw:Math.PI},
  {id:'C1',name:'西区实验中心',position:[-94,0,0],yaw:Math.PI/2},
  {id:'C2',name:'东区服务中心',position:[94,0,0],yaw:-Math.PI/2}
];
export const GARDENS=[[-24,-54],[24,-54],[-24,54],[24,54]];
export const CAMPUS_TREES=[
  ...GARDENS.map(([x,z])=>[x,z,9.0]),
  ...[-84,84].flatMap(x=>[-54,-28,28,54].map(z=>[x,z,8.2])),
  ...[-74,74].flatMap(z=>[-54,-18,18,54].map(x=>[x,z,8.0])),
  ...[-111,111].flatMap(x=>[-38,38].map(z=>[x,z,9.0])),
  ...[-108,108].flatMap(z=>[-90,-70,-30,30,70,90].map(x=>[x,z,9.5])),
  ...[-126,126].flatMap(x=>[-80,-60,-20,20,60,80].map(z=>[x,z,9.5]))
];
export const OFFICE_DIMENSIONS={width:46.712,depth:18.75,height:33.44,front:8.073};
