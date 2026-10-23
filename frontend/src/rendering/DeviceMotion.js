// A paused/finished telemetry pose is authoritative. Freezing a damped pose
// short of that location makes a correctly docked parcel appear outside its bay.
export function synchronizeVisualPosition(position,target,delta,running){
  if(running)position.lerp(target,1-Math.exp(-delta*14));
  else position.copy(target);
  return position;
}

// A remounted device's old child can retain a parent inside a detached group.
export function findAttachedObject(scene,cache,id){
  let object=cache.get(id),root=object;
  while(root?.parent)root=root.parent;
  if(!object||root!==scene){
    object=scene.getObjectByName(id);
    if(object)cache.set(id,object);else cache.delete(id);
  }
  return object;
}
