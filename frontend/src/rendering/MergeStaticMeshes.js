import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Merge only direct static children. Named steering/rotor/hatch groups survive.
export function mergeStaticChildren(parent) {
  const sets=new Map();parent.updateMatrixWorld(true);
  for(const child of [...parent.children]) {
    if(!child.isMesh||Array.isArray(child.material))continue;
    let geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    if(!sets.has(child.material))sets.set(child.material,[]);sets.get(child.material).push(geometry);
    parent.remove(child);child.geometry.dispose();
  }
  for(const [material,list] of sets) {
    const geometry=mergeGeometries(list,false);if(!geometry)throw new Error('Static asset geometry attributes differ');
    const mesh=new THREE.Mesh(geometry,material);mesh.name='static-'+(material.name||material.color.getHexString());mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);list.forEach(g=>g.dispose());
  }
  return parent;
}
