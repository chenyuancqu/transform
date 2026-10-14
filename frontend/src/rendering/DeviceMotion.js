// A paused/finished telemetry pose is authoritative. Freezing a damped pose
// short of that location makes a correctly docked parcel appear outside its bay.
export function synchronizeVisualPosition(position,target,delta,running){
  if(running)position.lerp(target,1-Math.exp(-delta*14));
  else position.copy(target);
  return position;
}
