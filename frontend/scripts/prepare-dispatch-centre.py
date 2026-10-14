"""Make a low-rise derivative by clipping floors, never shrinking storeys.
Uses the licensed real GLB and its original roof surface, materials and UVs.
"""
import json
import pathlib
import struct
import numpy as np

folder=pathlib.Path(__file__).resolve().parents[1]/'public/assets/campus/buildings/glass-office'
raw=(folder/'daylight-ready.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=bytearray(raw[28+n:]);HEIGHT=9.8
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],w),dtype=d,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*w),d.itemsize)).copy()
def matrix(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
world={}
def visit(i,parent):
 world[i]=parent@matrix(doc['nodes'][i])
 for child in doc['nodes'][i].get('children',[]):visit(child,world[i])
for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
new_meshes=[];new_nodes=[]
def append(values,template):
 binary.extend(b'\x00'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
 a={k:v for k,v in template.items() if k not in ['bufferView','byteOffset','min','max','sparse']};a.update(bufferView=view,count=len(values),componentType=5126)
 if a['type']=='VEC3':a.update(min=values.min(0).tolist(),max=values.max(0).tolist())
 i=len(doc['accessors']);doc['accessors'].append(a);return i
def store(values,keys,widths,p,name):
 if not len(values):return
 offset=0;attrs={}
 for key,width in zip(keys,widths):
  data=values[:,offset:offset+width].astype('<f4');offset+=width
  if key=='NORMAL':data/=np.maximum(np.linalg.norm(data,axis=1,keepdims=True),1e-10)
  attrs[key]=append(data,doc['accessors'][p['attributes'][key]])
 new_nodes.append({'name':name,'mesh':len(new_meshes)});new_meshes.append({'name':name,'primitives':[{'attributes':attrs,'material':p['material'],'mode':4}]})
roof_triangles=0
for index,m in world.items():
 node=doc['nodes'][index]
 if 'mesh' not in node:continue
 for p in doc['meshes'][node['mesh']]['primitives']:
  attrs={k:read(v) for k,v in p['attributes'].items()};attrs['POSITION']=attrs['POSITION']@m[:3,:3].T+m[:3,3]
  if 'NORMAL' in attrs:attrs['NORMAL']=attrs['NORMAL']@np.linalg.inv(m[:3,:3]);attrs['NORMAL']/=np.maximum(np.linalg.norm(attrs['NORMAL'],axis=1,keepdims=True),1e-10)
  keys=["POSITION"]+[k for k in attrs if k!="POSITION"];widths=[attrs[k].shape[1] for k in keys];values=np.concatenate([attrs[k] for k in keys],axis=1);faces=read(p['indices']).reshape(-1,3) if 'indices' in p else np.arange(len(values)).reshape(-1,3)
  y=attrs['POSITION'][faces][:,:,1];normal=attrs.get('NORMAL')
  if normal is not None:
   roof_mask=np.all(y>31.8,axis=1)&(normal[faces][:,:,1].mean(1)>.9)
   cap=values[faces[roof_mask]].reshape(-1,values.shape[1]).copy()
   if len(cap):cap[:,1]-=32-HEIGHT;store(cap,keys,widths,p,'original-roof-cap');roof_triangles+=len(cap)//3
  if attrs['POSITION'][:,1].min()>HEIGHT:continue
  inside=np.all(y<=HEIGHT,axis=1);output=[values[faces[inside]].reshape(-1,values.shape[1])]
  for face in faces[(y.min(1)<=HEIGHT)&(~inside)]:
   poly=values[face];clipped=[]
   for i,a in enumerate(poly):
    b=poly[(i+1)%3];da=HEIGHT-a[1];db=HEIGHT-b[1]
    if da>=0:clipped.append(a)
    if (da>=0)!=(db>=0):clipped.append(a+(b-a)*da/(da-db))
   for i in range(1,len(clipped)-1):output.append(np.array([clipped[0],clipped[i],clipped[i+1]]))
  kept=np.concatenate(output) if output else np.empty((0,values.shape[1]));store(kept,keys,widths,p,'low-'+node.get('name',''))
assert roof_triangles>0,'Original roof surface could not be identified'
assert max(float(read(p['attributes']['POSITION'])[:,1].max()) for mesh in new_meshes for p in mesh['primitives'])<=HEIGHT+.02,'Unclipped upper floors or floating roof survived'
doc['meshes']=new_meshes;doc['nodes']=new_nodes;doc['scenes']=[{'name':'DISPATCH_CENTRE_METRES','nodes':list(range(len(new_nodes)))}];doc['scene']=0;doc['buffers'][0]['byteLength']=len(binary)
blob=json.dumps(doc,separators=(',',':')).encode();blob+=b' '*(-len(blob)%4);binary+=b'\x00'*(-len(binary)%4)
(folder/'dispatch-centre.glb').write_bytes(struct.pack('<4sII',b'glTF',2,28+len(blob)+len(binary))+struct.pack('<II',len(blob),0x4E4F534A)+blob+struct.pack('<II',len(binary),0x004E4942)+binary)
report={'license':'CC BY 4.0','source':'Office building by Nikitos & 3130','height':HEIGHT,'roofSourceTriangles':roof_triangles,'meshes':len(new_meshes),'modifications':['Upper floors clipped, original floor spacing preserved','Original roof surface relocated','Uses daylight derivative entrance, rear glazing and materials']}
(folder/'dispatch-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
