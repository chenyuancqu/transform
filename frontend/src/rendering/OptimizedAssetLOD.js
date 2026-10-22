import * as THREE from 'three';

export const OPTIMIZED_ROOT='/assets/campus/optimized';
export const deviceURLs=id=>(id==='mother'?['near','medium']:['near','medium','far']).map(lod=>`${OPTIMIZED_ROOT}/devices/${id}-${lod}.gltf`);

// Geometry LODs share the original material appearance. Only the first material
// set reaches the GPU; the variant image URLs also share the browser cache.
export function createDeviceLOD(scenes,distances,{technology=false}={}){
  const lod=new THREE.LOD(),pool=new Map();lod.autoUpdate=false;
  scenes.forEach((scene,index)=>{
    const clone=scene.clone(true);
    clone.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
      const key=o.material.name+'|'+o.material.color.getHexString()+'|'+o.material.roughness+'|'+o.material.metalness;
      if(!pool.has(key)){
        const material=technology?o.material.clone():o.material;
        if(technology){
          const palette={ceramic_paint:'#e7ddd4',graphite_composite:'#4b3e47',status_strip:'#9b72b8',brushed_aluminium:'#b6a7a7',lambert5:'#85757e',lambert11:'#eee4dc',lambert4:'#5a4b55','far-dark-plastic':'#382d35','far-light-plastic':'#a894a4'};
          if(palette[material.name])material.color.set(palette[material.name]);
          if(material.name==='status_strip'){material.emissive.set('#9b72b8');material.emissiveIntensity=.24;}
          material.envMapIntensity=.35;material.userData.runtimeDeviceMaterial=true;
        }
        pool.set(key,material);
      }o.material=pool.get(key);o.material.forceSinglePass=true;
    });
    lod.addLevel(clone,distances[index],.12);
  });
  return lod;
}

export function disposeDeviceMaterials(asset){
  const materials=new Set();asset.traverse(o=>{if(o.isMesh&&o.material.userData.runtimeDeviceMaterial)materials.add(o.material);});
  materials.forEach(m=>m.dispose()); // Maps and geometry belong to the cached GLTF assets.
}

