export const DISTRICT_STREETS=[-390,-300,-210,-120,120,210,300,390];
const DISTRICT_HALF_EXTENT=420;
const ROAD_WIDTH=8.4;
const SIDEWALK_WIDTH=1.55;

function subtractIntervals(start,end,intervals){
  const cuts=intervals.map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const segments=[];let cursor=start;
  for(const [cutStart,cutEnd] of cuts){
    if(cutStart>cursor)segments.push([cursor,cutStart]);
    cursor=Math.max(cursor,cutEnd);
    if(cursor>=end)break;
  }
  if(cursor<end)segments.push([cursor,end]);
  return segments.filter(([a,b])=>b-a>1e-5);
}

export const DISTRICT_LAYOUT=(()=>{
  const roads=[],sidewalks=[],paint=[],buildings=[];
  const roadHalf=ROAD_WIDTH/2,sidewalkHalf=SIDEWALK_WIDTH/2;

  // Let each north/south street own its junction. East/west streets are cut
  // at the curb edges so the crossing never contains two coplanar road faces.
  for(const line of DISTRICT_STREETS){
    roads.push({x:line,y:-.02,z:0,w:ROAD_WIDTH,d:DISTRICT_HALF_EXTENT*2});
    for(const edge of [-1,1])sidewalks.push({x:line+edge*5.3,y:-.04,z:0,w:SIDEWALK_WIDTH,d:DISTRICT_HALF_EXTENT*2});
  }
  const roadJunctionCuts=DISTRICT_STREETS.map(line=>[line-roadHalf,line+roadHalf]);
  const sidewalkJunctionCenters=DISTRICT_STREETS.flatMap(line=>[-1,1].map(edge=>line+edge*5.3));
  for(const line of DISTRICT_STREETS){
    for(const [start,end] of subtractIntervals(-DISTRICT_HALF_EXTENT,DISTRICT_HALF_EXTENT,roadJunctionCuts))
      roads.push({x:(start+end)/2,y:-.02,z:line,w:end-start,d:ROAD_WIDTH});
    // The north/south sidewalk owns each corner square; clip the perpendicular
    // sidewalk strips around those footprints rather than stacking equal faces.
    const sidewalkCuts=sidewalkJunctionCenters.map(center=>[center-sidewalkHalf,center+sidewalkHalf]);
    for(const edge of [-1,1])for(const [start,end] of subtractIntervals(-DISTRICT_HALF_EXTENT,DISTRICT_HALF_EXTENT,sidewalkCuts))
      sidewalks.push({x:(start+end)/2,y:-.04,z:line+edge*5.3,w:end-start,d:SIDEWALK_WIDTH});
  }
  for(const line of DISTRICT_STREETS){
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
