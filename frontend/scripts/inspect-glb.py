"""Inspect actual GLB bytes and transformed mesh bounds, without a renderer."""
import json
import pathlib
import struct
import sys
import numpy as np


def inspect(path):
    raw = pathlib.Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB header')
    offset, doc, binary = 12, None, None
    while offset < length:
        size, kind = struct.unpack_from('<II', raw, offset)
        chunk = raw[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + size
    if doc.get('extensionsRequired'):
        raise ValueError(f"Unsupported inspection extension: {doc['extensionsRequired']}")
    def accessor(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
        width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        item = np.dtype(dtype).itemsize
        data = np.ndarray((a['count'],width), dtype=dtype, buffer=binary,
                          offset=v.get('byteOffset',0)+a.get('byteOffset',0),
                          strides=(v.get('byteStride',item*width),item))
        return data.copy()
    def transform(node):
        if 'matrix' in node:
            return np.array(node['matrix']).reshape(4,4).T
        x,y,z,w = node.get('rotation',[0,0,0,1])
        m = np.eye(4)
        m[:3,:3] = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                            [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                            [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]) @ np.diag(node.get('scale',[1,1,1]))
        m[:3,3] = node.get('translation',[0,0,0])
        return m
    records = []
    def visit(index,parent):
        node = doc['nodes'][index]
        world = parent @ transform(node)
        if 'mesh' in node:
            points, triangles = [], 0
            for p in doc['meshes'][node['mesh']]['primitives']:
                xyz = accessor(p['attributes']['POSITION'])
                points.append(xyz @ world[:3,:3].T + world[:3,3])
                triangles += doc['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3
            xyz = np.concatenate(points)
            records.append({'node':index,'name':node.get('name',''), 'mesh':node['mesh'],
                            'min':xyz.min(0).round(6).tolist(),'max':xyz.max(0).round(6).tolist(),
                            'vertices':len(xyz),'triangles':triangles})
        for child in node.get('children',[]):
            visit(child,world)
    for root in doc['scenes'][doc.get('scene',0)]['nodes']:
        visit(root,np.eye(4))
    low = np.min([r['min'] for r in records],axis=0)
    high = np.max([r['max'] for r in records],axis=0)
    images = doc.get('images',[])
    report = {'file':pathlib.Path(path).name,'bytes':len(raw),'dimensions':(high-low).round(6).tolist(),
              'min':low.tolist(),'max':high.tolist(),'meshes':len(records),
              'triangles':sum(r['triangles'] for r in records),'materials':len(doc.get('materials',[])),
              'images':len(images),'externalImages':[i['uri'] for i in images if 'uri' in i and not i['uri'].startswith('data:')],
              'animations':len(doc.get('animations',[])),'nodes':records}
    return report


if __name__ == '__main__':
    print(json.dumps(inspect(sys.argv[1]),ensure_ascii=False,indent=2))
