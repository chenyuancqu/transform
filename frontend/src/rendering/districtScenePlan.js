export const DISTRICT_STREETS=[-390,-300,-210,-120,120,210,300,390];
export const DISTRICT_LAYOUT=(()=>{
  const roads=[],sidewalks=[],paint=[],buildings=[];
  for(const line of DISTRICT_STREETS){
    // Keep orthogonal streets level with each other. Set sidewalks 2 cm lower
    // so their different paving material cannot z-fight with a crossing road.
    roads.push({x:0,y:-.02,z:line,w:840,d:8.4},{x:line,y:-.02,z:0,w:8.4,d:840});
    for(const edge of [-1,1])sidewalks.push({x:0,y:-.04,z:line+edge*5.3,w:840,d:1.55},{x:line+edge*5.3,y:-.04,z:0,w:1.55,d:840});
    for(let offset=-414;offset<=414;offset+=14){
      if(DISTRICT_STREETS.some(other=>Math.abs(offset-other)<7))continue;
      paint.push({x:offset,y:.008,z:line,w:2.5,d:.12},{x:line,y:.008,z:offset,w:.12,d:2.5});
    }
  }
  roads.push({x:-101,y:.014,z:0,w:42,d:6.5},{x:101,y:.014,z:0,w:42,d:6.5},{x:0,y:.014,z:-96,w:6.5,d:48},{x:0,y:.014,z:96,w:6.5,d:48});
  const centers=[-345,-255,-165,165,255,345];let index=0;
  for(const z of centers)for(const x of centers){
    if(Math.abs(x)===345&&Math.abs(z)===345)continue;
    buildings.push({x,z,width:37+(index*7%13),depth:26+(index*5%11),height:15+(index*11%16),yaw:z>0?Math.PI:0});index++;
  }
  return {roads,sidewalks,paint,buildings};
})();
