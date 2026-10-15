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
          const palette={ceramic_paint:'#e5eef4',graphite_composite:'#243849',status_strip:'#38d5e5',brushed_aluminium:'#a7bfce',lambert5:'#7894a6',lambert11:'#e4edf2',lambert4:'#344759','far-dark-plastic':'#233442','far-light-plastic':'#839bac'};
          if(palette[material.name])material.color.set(palette[material.name]);
          if(material.name==='status_strip'){material.emissive.set('#38d5e5');material.emissiveIntensity=.3;}
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

