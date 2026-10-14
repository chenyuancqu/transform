"""Separate the eight original propeller blades; preserve the original body.

Specific to the approved Sketchfab asset, not a generic proximity-based cutter.
The named source mesh also contains fixed motor housings and body details.
"""
import importlib.util
import json
import pathlib
import struct
import numpy as np

directory = pathlib.Path(__file__).resolve().parents[1] / 'public/assets/campus/drones/matrice-300'
raw = (directory / 'model.glb').read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_size])
binary = bytearray(raw[28 + json_size:])
types = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
widths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}


def read(index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    dt, width = np.dtype(types[a['componentType']]), widths[a['type']]
    return np.ndarray((a['count'],width),dtype=dt,buffer=binary,
                      offset=v.get('byteOffset',0)+a.get('byteOffset',0),
                      strides=(v.get('byteStride',dt.itemsize*width),dt.itemsize)).copy()


def append(array, template):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    binary.extend(array.tobytes())
    view = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':array.nbytes})
    a = {k:v for k,v in template.items() if k not in ['bufferView','byteOffset','min','max','sparse']}
    a.update(bufferView=view,count=len(array))
    if a['type'] == 'VEC3':
        a.update(min=array.min(0).tolist(),max=array.max(0).tolist())
    index = len(doc['accessors'])
    doc['accessors'].append(a)
    return index


node = doc['nodes'][13]
assert node['name'] == 'polySurface4387_lambert20_0'
primitive = doc['meshes'][node['mesh']]['primitives'][0]
attributes = {key:read(index) for key,index in primitive['attributes'].items()}
positions = attributes['POSITION']
faces = read(primitive['indices']).reshape(-1,3)
_, weld = np.unique(np.round(positions,5),axis=0,return_inverse=True)
parent = np.arange(weld.max()+1)


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for a,b,c in weld[faces]:
    ra,rb,rc = find(a),find(b),find(c)
    parent[rb] = ra
    parent[rc] = ra
labels = np.array([find(i) for i in weld])
blade_labels = []
for label in np.unique(labels):
    q = positions[labels == label]
    lo,hi = q.min(0),q.max(0)
    if len(q) == 204 and hi[1]-lo[1] < .1 and hi[2]-lo[2] > 2:
        blade_labels.append(label)
assert len(blade_labels) == 8, 'Source topology changed: refuse to guess propellers'


def subset(mask, pivot=None):
    selected_faces = faces[mask]
    used, inverse = np.unique(selected_faces,return_inverse=True)
    new_attributes = {}
    for key,index in primitive['attributes'].items():
        values = attributes[key][used].copy()
        if key == 'POSITION' and pivot is not None:
            values -= np.array(pivot,dtype=values.dtype)
        new_attributes[key] = append(values,doc['accessors'][index])
    indices = inverse.astype('<u4').reshape(-1,1)
    return {'attributes':new_attributes,'indices':append(indices,{'componentType':5125,'type':'SCALAR'}),
            'material':primitive['material'],'mode':4}


is_blade = np.isin(labels[faces[:,0]],blade_labels)
doc['meshes'][node['mesh']]['primitives'] = [subset(~is_blade)]
pivots = [(3.78565,6.54,2.9909),(-3.78565,6.54,2.9909),
          (3.382,6.54,-3.3518),(-3.382,6.54,-3.3518)]
counts = []
for index,pivot in enumerate(pivots):
    selected = []
    for label in blade_labels:
        center = positions[labels==label].mean(0)
        nearest = np.argmin([np.linalg.norm(center[[0,2]]-np.array(p)[[0,2]]) for p in pivots])
        if nearest == index:
            selected.append(label)
    assert len(selected) == 2
    mask = np.isin(labels[faces[:,0]],selected)
    counts.append(int(mask.sum()))
    mesh_index = len(doc['meshes'])
    doc['meshes'].append({'name':f'rotor_{index+1}_blades','primitives':[subset(mask,pivot)]})
    pivot_index = len(doc['nodes'])
    doc['nodes'].append({'name':f'rotor_{index+1}','translation':list(pivot),'mesh':mesh_index})
    doc['nodes'][8]['children'].append(pivot_index)

# Remove only the separate display case; the industrial drone remains intact.
assert doc['nodes'][3]['name'] == 'polySurface4181'
doc['nodes'][2]['children'].remove(3)
doc['buffers'][0]['byteLength'] = len(binary)
json_bytes = json.dumps(doc,separators=(',',':')).encode()
json_bytes += b' ' * (-len(json_bytes)%4)
binary += b'\x00' * (-len(binary)%4)
result = struct.pack('<4sII',b'glTF',2,28+len(json_bytes)+len(binary))
result += struct.pack('<II',len(json_bytes),0x4E4F534A)+json_bytes
result += struct.pack('<II',len(binary),0x004E4942)+binary
(directory/'flight-ready.glb').write_bytes(result)
spec = importlib.util.spec_from_file_location('inspect_glb',pathlib.Path(__file__).with_name('inspect-glb.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
report = module.inspect(directory/'flight-ready.glb')
report['modifications'] = ['Separate display case removed','Eight original blades grouped into four Y-axis rotor pivots; fixed motor housings preserved']
report['rotorTriangles'] = counts
report['suggestedDemoSpanMetres'] = 1.45
report['scaleIsDemoCalibrationNotManufacturerSpecification'] = True
(directory/'flight-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['nodes','file']},indent=2))
