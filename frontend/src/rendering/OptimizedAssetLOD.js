import * as THREE from 'three';

export const OPTIMIZED_ROOT='/assets/campus/optimized';
export const deviceURLs=id=>(id==='mother'?['near','medium']:['near','medium','far']).map(lod=>`${OPTIMIZED_ROOT}/devices/${id}-${lod}.gltf`);

// Geometry LODs share the original material appearance. Only the first material
// set reaches the GPU; the variant image URLs also share the browser cache.
export function createDeviceLOD(scenes,distances){
  const lod=new THREE.LOD(),pool=new Map();lod.autoUpdate=false;
  scenes.forEach((scene,index)=>{
    const clone=scene.clone(true);
    clone.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
      const key=o.material.name+'|'+o.material.color.getHexString()+'|'+o.material.roughness+'|'+o.material.metalness;
      if(!pool.has(key))pool.set(key,o.material);o.material=pool.get(key);o.material.forceSinglePass=true;
    });
    lod.addLevel(clone,distances[index],.12);
  });
  return lod;
}

