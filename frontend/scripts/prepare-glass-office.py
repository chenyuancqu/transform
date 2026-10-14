"""Adapt the licensed office GLB for daylight, with an actual entrance opening.
Clip only intersecting facade triangles; keep original UVs and material detail.
"""
import json
import pathlib
import struct
import numpy as np

folder=pathlib.Path(__file__).resolve().parents[1]/'public/assets/campus/buildings/glass-office'
raw=(folder/'model.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+n]);binary=bytearray(raw[28+n:]);dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d=np.dtype(dtype[a['componentType']])
 return np.ndarray((a['count'],w),dtype=d,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*w),d.itemsize)).copy()
def matrix(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
world={}
def visit(i,parent):
 world[i]=parent@matrix(doc['nodes'][i])
 for c in doc['nodes'][i].get('children',[]):visit(c,world[i])
roots=doc['scenes'][doc.get('scene',0)]['nodes']
for i in roots:visit(i,np.eye(4))
all_points=[]
for i,m in world.items():
 if 'mesh' in doc['nodes'][i]:
  for p in doc['meshes'][doc['nodes'][i]['mesh']]['primitives']:
   v=read(p['attributes']['POSITION']);all_points.append(v@m[:3,:3].T+m[:3,3])
xyz=np.concatenate(all_points);low,high=xyz.min(0),xyz.max(0);center=(low+high)/2;scale=32/(high[1]-low[1])
normalize=np.diag([-scale,scale,-scale,1]);normalize[:3,3]=[center[0]*scale,-low[1]*scale,center[2]*scale]
front=(center[2]-low[2])*scale
door_low=np.array([-3.2,-.05,front-1.5]);door_high=np.array([3.2,3.2,front+.25])
def append(values,template):
 binary.extend(b'\x00'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
 a={k:v for k,v in template.items() if k not in ['bufferView','byteOffset','min','max','sparse']};a.update(bufferView=view,count=len(values))
 if a['type']=='VEC3':a.update(min=values.min(0).tolist(),max=values.max(0).tolist())
 idx=len(doc['accessors']);doc['accessors'].append(a);return idx
def clip(poly,axis,value,sign):
 inside=[];outside=[]
 for index,a in enumerate(poly):
  b=poly[(index+1)%len(poly)];da=sign*(a[0][axis]-value);db=sign*(b[0][axis]-value)
  (inside if da>=-1e-8 else outside).append(a)
  if (da>=0)!=(db>=0):
   t=da/(da-db);q=(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);inside.append(q);outside.append(q)
 return inside,outside
# Reuse the author's real glazing/frame geometry for the formerly blind rear.
# Front components are mirrored in metre space with winding corrected.
rear_nodes=[]
for source_index in [6,9,12]:
 source=doc['nodes'][source_index];p=doc['meshes'][source['mesh']]['primitives'][0];m=normalize@world[source_index]
 attrs={k:read(v) for k,v in p['attributes'].items()};coords=attrs['POSITION']@m[:3,:3].T+m[:3,3];faces=read(p['indices']).reshape(-1,3)
 keep=np.all(coords[faces][:,:,2]>front-2.5,axis=1)
 selected=faces[keep];used,inverse=np.unique(selected,return_inverse=True);out={}
 for key,index in p['attributes'].items():
  values=attrs[key][used].copy()
  if key=='POSITION':values=coords[used].copy();values[:,2]*=-1
  elif key=='NORMAL':values=values@np.linalg.inv(m[:3,:3]);values[:,2]*=-1;values/=np.maximum(np.linalg.norm(values,axis=1,keepdims=True),1e-10)
  out[key]=append(values.astype('<f4'),doc['accessors'][index])
 indices=inverse.reshape(-1,3)[:,[0,2,1]].astype('<u4').reshape(-1,1)
 new_mesh=len(doc['meshes']);doc['meshes'].append({'name':'rear-'+source['name'],'primitives':[{'attributes':out,'indices':append(indices,{'componentType':5125,'type':'SCALAR'}),'material':p['material']}]})
 rear_nodes.append(len(doc['nodes']));doc['nodes'].append({'name':'rear-'+source['name'],'mesh':new_mesh})
cut_count=0
for index,transform in list(world.items()):
 node=doc['nodes'][index]
 if 'mesh' not in node or not node.get('name','').startswith('BLD_OFFICE'):continue
 for p in doc['meshes'][node['mesh']]['primitives']:
  attributes={k:read(v) for k,v in p['attributes'].items()};pos=attributes['POSITION'];m=normalize@transform;coords=pos@m[:3,:3].T+m[:3,3];faces=read(p['indices']).reshape(-1,3)
  keys=list(attributes);sizes=[attributes[k].shape[1] for k in keys];combined=np.concatenate([attributes[k] for k in keys],axis=1);triangles=[];changed=False
  for face in faces:
   q=coords[face]
   if index==24 and q[:,2].max()<-front+.23 and q[:,1].min()>2.8 and q[:,1].max()<29.2:
    cut_count+=1;changed=True;continue
   if np.any(q.max(0)<door_low) or np.any(q.min(0)>door_high):triangles.append(combined[face]);continue
   poly=[(coords[j].copy(),combined[j].copy()) for j in face];kept=[]
   for axis in range(3):
    for value,sign in [(door_low[axis],1),(door_high[axis],-1)]:
     if len(poly)<3:break
     poly,outside=clip(poly,axis,value,sign)
     if len(outside)>=3:kept.append(outside)
   for polygon in kept:
    for j in range(1,len(polygon)-1):triangles.append(np.array([polygon[0][1],polygon[j][1],polygon[j+1][1]]))
   changed=True;cut_count+=1
  if changed:
   values=np.concatenate(triangles).astype('<f4');offset=0;out={}
   for key,width in zip(keys,sizes):
    data=values[:,offset:offset+width].copy();offset+=width
    if key=='NORMAL':data/=np.maximum(np.linalg.norm(data,axis=1,keepdims=True),1e-10)
    out[key]=append(data,doc['accessors'][p['attributes'][key]])
   p['attributes']=out;p.pop('indices',None)
assert cut_count>0,'No facade intersected the designed doorway'
wrapper=len(doc['nodes']);doc['nodes'].append({'name':'OFFICE_METRES_DAYLIGHT','matrix':normalize.T.flatten().tolist(),'children':roots});doc['scenes'][doc.get('scene',0)]['nodes']=[wrapper]+rear_nodes
for material in doc['materials']:
 p=material.setdefault('pbrMetallicRoughness',{});name=material.get('name','')
 if name=='walls_exterior':p.update(baseColorFactor=[.40,.46,.47,1],metallicFactor=.18,roughnessFactor=.44)
 if name=='rams':p.update(baseColorFactor=[.13,.19,.21,1],metallicFactor=.55,roughnessFactor=.3)
 if name=='glass':p.update(baseColorFactor=[.32,.46,.50,.43],metallicFactor=.3,roughnessFactor=.16)
 if name=='material':p.update(baseColorFactor=[.88,.86,.80,1],roughnessFactor=.78)
 if 'emissiveFactor' in material:material['emissiveFactor']=[.035,.032,.025]
doc['buffers'][0]['byteLength']=len(binary);blob=json.dumps(doc,separators=(',',':')).encode();blob+=b' '*(-len(blob)%4);binary+=b'\x00'*(-len(binary)%4)
(folder/'daylight-ready.glb').write_bytes(struct.pack('<4sII',b'glTF',2,28+len(blob)+len(binary))+struct.pack('<II',len(blob),0x4E4F534A)+blob+struct.pack('<II',len(binary),0x004E4942)+binary)
report={'units':'metres','height':32,'width':float((high[0]-low[0])*scale),'depth':float((high[2]-low[2])*scale),'front':float(front),'cutTriangles':cut_count,'modifications':['Uniform metre scale and front orientation','Daylight material adaptation','Real clipped entrance opening; original UVs retained','Rear adapted using original glazed facade geometry; formerly blind rear surface removed'],'license':'CC BY 4.0'}
(folder/'daylight-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
