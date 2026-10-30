import io
import unittest
from inspect_onnx_structure import inspect

def v(n):
    result=b''
    while n>127:result+=bytes([(n&127)|128]);n>>=7
    return result+bytes([n])
def field(n,data):return v(n*8+2)+v(len(data))+data

class OnnxStructureTests(unittest.TestCase):
    def test_graph_nodes_and_opaque_weights_are_not_loaded(self):
        opaque=b'OPAQUE_NOT_A_TENSOR'
        graph=field(1,field(4,b'Conv')+field(5,opaque))+field(5,opaque)
        data=field(2,b'owned fixture')+field(7,graph)
        class Tracking(io.BytesIO):
            reads=[]
            def read(self,n=-1):
                start=self.tell();value=super().read(n);self.reads.append((start,self.tell()));return value
        stream=Tracking(data)
        result=inspect(stream,len(data))
        offset=data.index(opaque)
        self.assertFalse(any(start<=offset<end for start,end in stream.reads))
        self.assertEqual(result['operators'],{'Conv':1})
        self.assertEqual(result['initializerCount'],1)
        self.assertFalse(result['weightValuesRead'])
    def test_truncation_and_invalid_wire_are_rejected(self):
        for data in [b'\x3a\x7fshort',b'\x0f',b'\x80'*11]:
            with self.assertRaises(ValueError):inspect(io.BytesIO(data),len(data))

if __name__=='__main__':unittest.main()
