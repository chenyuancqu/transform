import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import './approved-asset-preview.css';
import {createOfficeArchitecture} from './OfficeArchitecture.js';

const assets={
  glass:{label:'玻璃幕墙办公楼',url:'/assets/campus/optimized/buildings/office.gltf',author:'Nikitos & 3130 / 原创建筑细节',license:'CC BY 4.0 · 日光材质、入口开洞；原创雨棚与屋顶设施 ISC',source:'https://sketchfab.com/3d-models/office-building-af9782245c134c21ae0c8df7f57077e6'},
  dispatch:{label:'低层调度共享中心',url:'/assets/campus/optimized/buildings/dispatch.gltf',roofHeight:9.8,author:'Nikitos & 3130 / 原创建筑细节',license:'CC BY 4.0 · 截取原始楼层、迁移原始屋顶；原创入口与屋顶设备 ISC',source:'https://sketchfab.com/3d-models/office-building-af9782245c134c21ae0c8df7f57077e6'},
  treeNear:{label:'圆润团簇树冠',url:'/assets/campus/stylized/nature/cluster-tree.glb',height:9,author:'Kenney',license:'CC0 · 树冠细分圆滑与配色改造',source:'https://kenney.nl/assets/nature-kit'},
  treeFar:{label:'茂密阔冠树',url:'/assets/campus/stylized/nature/broad-tree.glb',height:9,author:'Kenney',license:'CC0 · 树冠细分圆滑与配色改造',source:'https://kenney.nl/assets/nature-kit'},
  london:{label:'伦敦办公楼',url:'/assets/campus/buildings/london-office/model.glb',height:26.198188,author:'Pukka Films',license:'CC BY 4.0',source:'https://sketchfab.com/3d-models/london-office-building-8d3ea98595b4403cbf21065e8f9b7bb7'},
  drone:{label:'工业四旋翼',url:'/assets/campus/optimized/devices/matrice-300-near.gltf',span:1.45,author:'19vitali99',license:'CC BY 4.0 · 已拆分旋翼、移除展示箱',source:'https://sketchfab.com/3d-models/quadcopter-dji-matrice-300-rtk-6677d02d66df4b73aad0d8e7bb9e3d9c'},
  mother:{label:'原创物流母车',url:'/assets/campus/optimized/devices/mother-near.gltf',author:'本项目原创',license:'ISC',source:'/mother-preview.html'}
};
document.querySelector('#app').innerHTML=`<header><div><span>LOCAL ASSET / DAYLIGHT REVIEW</span><h1>已选模型 · 本地资产验收</h1></div><a href="/r3f.html">返回任务演示 ↗</a></header><main><aside><nav aria-label="选择资产">${Object.entries(assets).map(([key,a])=>`<button data-asset="${key}">${a.label}</button>`).join('')}</nav><h2 id="asset-title"></h2><p id="status" role="status">加载中…</p><dl id="stats"></dl><p class="note">建筑高度、无人机旋翼跨度为演示尺度标定，保留原始长宽高比例；不是制造商或测绘数据。</p><button id="spin" hidden aria-pressed="false">旋翼转动</button><label id="scale-context"><input id="context" type="checkbox">显示母车与无人机尺度参照</label><div class="credit"><b id="author"></b><p id="license"></p><a id="source" target="_blank" rel="noopener">原始来源 ↗</a><p>三个下载模型实际加载，未使用官方缩略图代替。此页只检查资产；新模型已接入园区任务场景。</p></div></aside><section id="stage"><div id="load-overlay">正在加载真实 GLB 与日光环境…</div></section></main><footer><nav aria-label="查看角度">${[['angle','斜角'],['front','正面'],['back','背面'],['side','侧面'],['roof','屋顶']].map(([k,v])=>`<button data-view="${k}" aria-pressed="${k==='angle'}">${v}</button>`).join('')}</nav><span>左键旋转 · 右键平移 · 滚轮缩放 · 统一日光 / DPR 1</span><output id="performance"></output></footer>`;
const stage=document.querySelector('#stage');
const scene=new THREE.Scene();scene.background=new THREE.Color('#e5ebe8');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(36,1,.01,1000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.screenSpacePanning=true;
scene.add(new THREE.HemisphereLight('#f5f9fa','#d9e2c5',1.9));
const sun=new THREE.DirectionalLight('#fff8eb',1.5);sun.position.set(-35,65,40);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;
sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=180;sun.shadow.normalBias=.025;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#f1e9d9',roughness:.95}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.025;ground.receiveShadow=true;scene.add(ground);
const loader=new GLTFLoader();const cache=new Map();
let root=null,box=null,selected='glass',generation=0,rotors=[],spinning=false,context=null,contextGeneration=0;
let samples=[],lastFrame=performance.now(),measureStart=lastFrame,perf=null,loadMs=null,viewGeneration=0;
async function load(url){if(!cache.has(url))cache.set(url,loader.loadAsync(url));return (await cache.get(url)).scene.clone(true);}
function normalized(model,a){
  if(a.yaw)model.rotation.y+=a.yaw;
  model.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(model,true);const size=b.getSize(new THREE.Vector3());const center=b.getCenter(new THREE.Vector3());
  const scale=a.height?a.height/size.y:a.span?a.span/Math.max(size.x,size.z):1;
  const position=new THREE.Group();position.add(model);position.position.set(-center.x,-b.min.y,-center.z);
  const group=new THREE.Group();group.add(position);group.scale.setScalar(scale);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return group;
}
function view(name){
  if(!box)return;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===name));
  const directions={angle:[1,.65,1],front:[0,.25,1],back:[0,.25,-1],side:[1,.25,0],roof:[.35,1,.35]};
  const direction=new THREE.Vector3(...directions[name]).normalize();const size=box.getSize(new THREE.Vector3());const target=box.getCenter(new THREE.Vector3());
  const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize();const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const v=new THREE.Vector3(x,y,z).sub(target);distance=Math.max(distance,v.dot(direction)+Math.max(Math.abs(v.dot(right))/(tan*camera.aspect*.78),Math.abs(v.dot(up))/(tan*.75)));
  }
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance);camera.near=Math.max(.01,size.length()/1000);camera.updateProjectionMatrix();controls.minDistance=size.length()*.07;controls.maxDistance=size.length()*8;controls.update();
  renderer.render(scene,camera);
  const viewToken=++viewGeneration;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(viewToken===viewGeneration)document.querySelector('#status').textContent='已显示 · '+({angle:'斜角',front:'正面',back:'背面',side:'侧面',roof:'屋顶'}[name]);}));
  samples=[];measureStart=performance.now();
}
async function scaleContext(){
  const token=++contextGeneration;if(context){scene.remove(context);context=null;}
  if(!document.querySelector('#context').checked||!['glass','dispatch','london'].includes(selected)||!box)return;
  const [mother,drone]=await Promise.all([load(assets.mother.url),load(assets.drone.url)]);
  if(token!==contextGeneration)return;
  context=new THREE.Group();const car=normalized(mother,assets.mother),uav=normalized(drone,assets.drone);car.position.set(0,0,box.max.z+4);uav.position.set(3.3,2.5,box.max.z+4);context.add(car,uav);scene.add(context);
}
async function select(key){
  const token=++generation;selected=key;const a=assets[key];const start=performance.now();contextGeneration++;if(context){scene.remove(context);context=null;}
  document.querySelector('#load-overlay').hidden=false;document.querySelector('#status').textContent='正在加载真实 GLB…';
  document.querySelectorAll('[data-asset]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.asset===key));
  document.querySelector('#asset-title').textContent=a.label;document.querySelector('#author').textContent=a.author;document.querySelector('#license').textContent=a.license;document.querySelector('#source').href=a.source;
  document.querySelector('#spin').hidden=key!=='drone';document.querySelector('#scale-context').hidden=!['glass','dispatch','london'].includes(key);spinning=false;document.querySelector('#spin').setAttribute('aria-pressed','false');
  try{
    const model=await load(a.url);if(token!==generation)return;
    if(a.alphaUrl){const mask=await new THREE.TextureLoader().loadAsync(a.alphaUrl);mask.flipY=false;mask.colorSpace=THREE.NoColorSpace;model.traverse(o=>{if(o.isMesh&&o.material.name.includes('leaves')){o.material=o.material.clone();o.material.alphaMap=mask;o.material.alphaTest=a.alphaTest;o.material.alphaToCoverage=true;o.material.transparent=false;o.material.depthWrite=true;}});}
    if(['glass','dispatch'].includes(key))model.add(createOfficeArchitecture(key==='dispatch'?'OPS / DISPATCH':'NEXUS / INNOVATION',a.roofHeight??32));
    if(root)scene.remove(root);root=normalized(model,a);scene.add(root);box=new THREE.Box3().setFromObject(root,true);
    rotors=[1,2,3,4].map(i=>root.getObjectByName('rotor_'+i)).filter(Boolean);
    let triangles=0,meshes=0;const materials=new Set(),textures=new Set();root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{materials.add(m);Object.values(m).forEach(t=>{if(t?.isTexture)textures.add(t);});});}});
    const size=box.getSize(new THREE.Vector3());loadMs=performance.now()-start;
    document.querySelector('#stats').innerHTML=`<dt>展示尺寸 · 宽 / 高 / 深</dt><dd>${size.toArray().map(v=>v.toFixed(2)).join(' × ')} m</dd><dt>原始结构</dt><dd>${meshes} 网格 / ${Math.round(triangles).toLocaleString()} 三角形</dd><dt>材质与贴图</dt><dd>${materials.size} 材质 / ${textures.size} 纹理</dd><dt>加载耗时 · 不含环境</dt><dd>${(loadMs/1000).toFixed(2)} s</dd>${key==='drone'?'<dt>旋翼结构</dt><dd>4 个独立轴心 / 8 片原始桨叶</dd>':''}`;
    document.querySelector('#status').textContent='GLB 已加载 · 请旋转检查';document.querySelector('#load-overlay').hidden=true;await scaleContext();view('angle');
  }catch(e){if(token!==generation)return;document.querySelector('#status').textContent='加载失败：'+e.message;document.querySelector('#load-overlay').textContent='加载失败，请检查模型文件。';console.error(e);}
}
document.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>select(b.dataset.asset));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
document.querySelector('#spin').onclick=()=>{spinning=!spinning;document.querySelector('#spin').setAttribute('aria-pressed',String(spinning));};
document.querySelector('#context').onchange=scaleContext;
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(box)view('angle');}
new ResizeObserver(resize).observe(stage);resize();
new RGBELoader().load('/assets/campus/environment/kloofendal_48d_partly_cloudy_puresky/sky.hdr',texture=>{const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(texture).texture;texture.dispose();pmrem.dispose();},undefined,e=>console.error('Daylight environment failed',e));
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-lastFrame)/1000,.05);if(root)samples.push(now-lastFrame);lastFrame=now;
  if(spinning)rotors.forEach((r,i)=>r.rotation.y+=[1,-1,-1,1][i]*dt*34);
  controls.update();renderer.render(scene,camera);
  if(root&&now-measureStart>=2000&&samples.length){const ordered=[...samples].sort((a,b)=>a-b);const avg=samples.reduce((a,b)=>a+b,0)/samples.length;perf={fps:1000/avg,averageMs:avg,p95Ms:ordered[Math.floor(ordered.length*.95)],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,samples:samples.length};document.querySelector('#performance').textContent=`${perf.fps.toFixed(0)} FPS · ${perf.drawCalls} calls · P95 ${perf.p95Ms.toFixed(1)} ms`;document.querySelector('#performance').title=`平均帧时 ${avg.toFixed(2)} ms / ${perf.samples} 帧 / ${perf.triangles} triangles（含阴影） / ${perf.textures} textures（当前预览页累计资源）`;samples=[];measureStart=now;}
}
const requestedAsset=new URLSearchParams(location.search).get('asset');
requestAnimationFrame(animate);select(Object.hasOwn(assets,requestedAsset)?requestedAsset:'glass');
if(import.meta.env.DEV)window.__approvedAssetPreview={get state(){return {selected,perf,loadMs,rotors:rotors.map(r=>({name:r.name,yaw:r.rotation.y})),spinning};},scene,camera,renderer};
