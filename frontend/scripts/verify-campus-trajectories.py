"""Check one real ONNX episode against planned building and tree envelopes.
This is a sampled layout check, not a full collision/obstacle-avoidance solver.
"""
import json
import math
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from mission import Mission,world
from service import Policy

plan=json.loads((ROOT/'output/visual-sample-20261014/scene-plan.json').read_text(encoding='utf-8'))
mission=Mission();policy=Policy();mission.running=True
hits=[];tree_hits=[];canopy_hits=[];positions=[]
for step in range(10000):
    if step%10==0:
        mission.assign();actions=policy.infer(mission.observations())
    mission.advance(.05,actions)
    for uav in mission.uavs:
        x,z,height=world(uav)
        for building in plan['buildings']:
            dx,dz=x-building['position'][0],z-building['position'][2];yaw=building['yaw']
            lx=dx*math.cos(yaw)-dz*math.sin(yaw);lz=dx*math.sin(yaw)+dz*math.cos(yaw)
            if abs(lx)<24.09 and -8.83<lz<11.43 and height<building.get('height',32)+2:
                hits.append((step,uav['id'],building['id']))
        for i,(tx,tz,tree_height) in enumerate(plan['trees']):
            if math.hypot(x-tx,z-tz)<1.28 and height<tree_height:
                tree_hits.append((step,uav['id'],tx,tz))
            crown_radius=5.5 if i<4 else 5.2
            if math.hypot(x-tx,z-tz)<crown_radius+.73 and height>(4.0 if i<4 else 2.3):
                canopy_hits.append((step,uav['id'],tx,tz))
    if step%10==0:
        positions.append({'time':mission.elapsed,'uavs':[world(u) for u in mission.uavs],
                          'rover':world(mission.rover),'phases':[u['phase'] for u in mission.uavs],
                          'dock':mission.docking.copy()})
    if not mission.running:break
report={'delivered':mission.stats['deliveredOrders'],'simulationSeconds':mission.elapsed,
        'buildingIntersections':len(hits),'trunkIntersections':len(tree_hits),
        'approximateCanopyIntersections':len(canopy_hits),'firstBuildingIntersections':hits[:10],
        'firstTrunkIntersections':tree_hits[:10],'firstCanopyIntersections':canopy_hits[:10],
        'positions':positions}
(ROOT/'output/visual-sample-20261014/trajectory-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print({k:v for k,v in report.items() if k!='positions'})
if hits or tree_hits or canopy_hits or mission.stats['deliveredOrders']!=8:sys.exit(1)
