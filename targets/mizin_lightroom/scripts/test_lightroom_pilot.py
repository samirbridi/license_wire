import json
import tempfile
import unittest
from pathlib import Path
from lupa.lua51 import LuaRuntime
from build_lightroom_pilot import lua_literal

SOURCE=Path(__file__).resolve().parents[1]/'reconstructed'/'lightroom-pilot'/'ComparePilot.lua'


class LightroomPilotTests(unittest.TestCase):
    def test_data_escaping_remains_data_in_lua51(self):
        value={'path':'D:\\x"; error("not code") --\\foto.CR3','text':'a\nb\tç'}
        lua=LuaRuntime(unpack_returned_tuples=True)
        result=lua.execute('return '+lua_literal(value))
        self.assertEqual(result['path'],value['path'])
        self.assertEqual(result['text'],value['text'])

    def run_plugin(self,photo_exists=True):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            data={'schema':'mizin-lightroom.saved-pilot/1','entries':[{'path':r'D:\Event\photo.CR3','filename':'photo.CR3',
                  'predictions':{'Exposure2012':0.2,'Temperature':4500,'Contrast2012':13}}]}
            (folder/'PilotData.lua').write_text('return '+lua_literal(data),encoding='utf-8')
            lua=LuaRuntime(unpack_returned_tuples=True)
            lua.globals().plugin_path=folder.as_posix()
            lua.globals().photo_exists=photo_exists
            lua.execute('''
                messages={}
                reads=0
                writes=0
                photo={getRawMetadata=function(self,key) return false end,
                    getDevelopSettings=function(self) reads=reads+1; return {Exposure2012=0.1,Temperature=4600,Contrast2012=12} end}
                catalog={findPhotoByPath=function(self,path) if photo_exists then return photo end end,
                    withWriteAccessDo=function() writes=writes+1; error('Unexpected write') end}
                modules={
                    LrApplication={activeCatalog=function() return catalog end},
                    LrDialogs={message=function(title,body,kind) messages[#messages+1]={title=title,body=body,kind=kind} end},
                    LrPathUtils={child=function(parent,name) return parent..'/'..name end},
                    LrTasks={startAsyncTask=function(fn) fn() end,pcall=pcall},
                }
                import=function(name) if not modules[name] then error('Unexpected SDK import '..name) end; return modules[name] end
                _PLUGIN={path=plugin_path}
            ''')
            lua.execute(SOURCE.read_text(encoding='utf-8'))
            return lua.globals().writes,lua.globals().reads,lua.globals().messages[1]['body']

    def test_comparison_only_reads_catalog(self):
        writes,reads,body=self.run_plugin(True)
        self.assertEqual(writes,0)
        self.assertEqual(reads,1)
        self.assertIn('0.20',body)
        self.assertIn('Nenhuma edicao sera aplicada',body)

    def test_wrong_catalog_does_not_write_or_crash(self):
        writes,reads,body=self.run_plugin(False)
        self.assertEqual((writes,reads),(0,0))
        self.assertIn('nao foram encontradas',body)


if __name__=='__main__':
    unittest.main(verbosity=2)
