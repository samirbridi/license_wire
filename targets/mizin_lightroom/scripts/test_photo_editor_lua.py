"""Contract tests for SDK calls and durable recovery; these are not native Lightroom QA."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import test_local_lua as native_base
from test_local_lua import LUA

def fixture_base():
    settings=dict(CameraProfile='Fixture profile',ProcessVersion='15.4',ColorNoiseReduction=25,ToneCurveName2012='Custom',
        ToneCurvePV2012=[0,10,255,245],ToneCurvePV2012Red=[0,0,255,255],ToneCurvePV2012Green=[0,0,255,255],ToneCurvePV2012Blue=[0,0,255,255],
        SplitToningBalance=80,SplitToningHighlightHue=240,SplitToningHighlightSaturation=3,SplitToningShadowHue=220,SplitToningShadowSaturation=5,
        ColorGradeBlending=100,ColorGradeGlobalHue=0,ColorGradeGlobalLum=0,ColorGradeGlobalSat=0,ColorGradeHighlightLum=0,
        ColorGradeMidtoneHue=0,ColorGradeMidtoneLum=0,ColorGradeMidtoneSat=0,ColorGradeShadowLum=0)
    return dict(schema='mizin-lightroom.fixed-style-base/1',supportedTreatment='color',completeStyle=False,settings=settings)


class PhotoEditorLuaTests(unittest.TestCase):
    def setup_editor(self, folder):
        runtime=native_base.LocalLuaTests().setup_native(folder)
        runtime.globals().digest=lambda text:hashlib.sha256(text.encode('utf-8')).hexdigest()
        runtime.globals().base_json=json.dumps(fixture_base())
        runtime.globals().ready_exists=lambda:bool(list((folder/'MizinLightroomLocal/editing').glob('*/*-ready.json')))
        runtime.execute('''
            codec=dofile(plugin_path..'/Json.lua');base=codec.decode(base_json)
            function clone(value) if type(value)~='table' then return value end;local out={};for k,v in pairs(value) do out[k]=clone(v) end;return out end
            moduleName='library';inGate=false;uuidCounter=0;applyCount=0;restoreCount=0;createCount=0;behavior='normal';snapshotBehavior='normal';applyBehavior='normal'
            modules.LrDigest={SHA256={digest=digest}}
            modules.LrApplicationView={switchToModule=function(name) moduleName=name end,getCurrentModuleName=function() return moduleName end}
            modules.LrUUID.generateUUID=function() uuidCounter=uuidCounter+1;return 'fixture-'..uuidCounter end
            modules.LrTasks.sleep=function() end
            modules.LrProgressScope=function() return {isCanceled=function() return false end,setCancelable=function() end,setCaption=function() end,setPortionComplete=function() end,done=function() end} end
            modules.LrDialogs.presentModalDialog=function(props) referenceProps.base=false;return 'ok' end
            function newMaster(id)
                local p={localIdentifier=id,path='D:/fotos/'..id..'.CR3',isCopy=false,copies={},snapshots={},states={}}
                p.settings=clone(base.settings)
                p.settings.ToneCurvePV2012={0,0,255,255}
                for k,v in pairs(photo:getDevelopSettings()) do p.settings[k]=v end
                p.settings.WhiteBalance='As Shot';p.settings.Look={Name='Adobe Color',Amount=1};p.settings.CropTop=.1
                p.settings.HueAdjustmentRed=12;p.settings.MaskGroupBasedCorrections={{MaskName='Original mask'}}
                p.getDevelopSettings=function(self) return clone(self.settings) end
                p.getRawMetadata=function(self,key)
                    if key=='path' then return self.path elseif key=='isVirtualCopy' then return self.isCopy
                    elseif key=='virtualCopies' then return self.copies elseif key=='masterPhoto' then return self.master end
                end
                p.getDevelopSnapshots=function(self) assert(not self.isCopy,'Enumerate snapshots on master');return self.snapshots end
                p.createDevelopSnapshot=function(self,name,update)
                    assert(inGate and self.isCopy and selected[1]==self and moduleName=='develop');assert(update==false)
                    if snapshotBehavior=='false' then return false end
                    local id='snapshot-'..self.localIdentifier
                    self.master.snapshots[#self.master.snapshots+1]={name=name,snapshotID=id,id_global='delete-only-'..id}
                    self.master.states[id]=clone(self.settings);return true
                end
                p.applyDevelopSettings=function(self,settings,history,flatten)
                    assert(inGate and self.isCopy and selected[1]==self and moduleName=='develop','Only a selected virtual copy inside write gate')
                    assert(ready_exists(),'Durable recovery record precedes any adjustment')
                    assert(flatten==false);applyCount=applyCount+1
                    if applyBehavior=='partial' then self.settings.Exposure2012=settings.Exposure2012;error('SDK failed after partial update') end
                    for key,value in pairs(settings) do self.settings[key]=clone(value) end
                    self.settings.CustomTemperature=settings.Temperature;self.settings.CustomTint=settings.Tint
                    if settings.SplitToningBalance then self.settings.ColorGradeBalance=settings.SplitToningBalance end
                    if applyBehavior=='collateral' then self.settings.CropTop=.4 end
                end
                p.applyDevelopSnapshot=function(self,id)
                    assert(inGate and self.isCopy and selected[1]==self and moduleName=='develop')
                    assert(self.master.states[id],'Use snapshotID, never id_global')
                    restoreCount=restoreCount+1;self.settings=clone(self.master.states[id])
                end
                return p
            end
            source=newMaster(1);other=newMaster(2);masters={source,other};selected={source}
            catalog.getPath=function() return 'D:/catalog.lrcat' end
            catalog.getTargetPhoto=function() return selected[1] end
            catalog.getTargetPhotos=function() return selected end
            catalog.setSelectedPhotos=function(self,target,photos) selected=photos;if behavior=='selection-race' then selected={other} end end
            catalog.findPhotoByPath=function(self,path) for _,p in ipairs(masters) do if p.path==path then return p end end end
            catalog.withWriteAccessDo=function(self,title,fn) assert(not inGate);catalogWrites=catalogWrites+1;inGate=true;local ok,err=pcall(fn);inGate=false;if not ok then error(err) end end
            catalog.createCollectionSet=function() assert(inGate);return {} end
            catalog.createCollection=function()
                assert(inGate);collection={photos={},addPhotos=function(self,photos) assert(inGate);for _,p in ipairs(photos) do self.photos[#self.photos+1]=p end end};return collection
            end
            catalog.createVirtualCopies=function(self,name)
                assert(not inGate and moduleName=='library' and #selected==1 and not selected[1].isCopy)
                createCount=createCount+1;local master=selected[1]
                if behavior=='original' then return {master} end
                if behavior=='preexisting' then return {master.copies[1]} end
                local copy={};for key,value in pairs(master) do copy[key]=value end
                copy.localIdentifier=100+createCount;copy.isCopy=true;copy.master=master;copy.settings=clone(master.settings)
                master.copies[#master.copies+1]=copy;selected={copy}
                if behavior=='wrong-master' then copy.master=other end
                if behavior=='many' then return {copy,copy} end
                return {copy}
            end
            catalog.setActiveSources=function() end
            progress={isCanceled=function() return cancelNow==true end,setPortionComplete=function(self,part) if cancelAt==part then cancelNow=true end end}
            editor=dofile(plugin_path..'/PhotoEditor.lua')
        ''')
        def execute(job):
            request=json.loads((Path(job)/'request.json').read_text(encoding='utf-8'))
            predictions=self.predictions()
            if runtime.globals().invalid_prediction:predictions['Temperature']=1
            report={'schema':'mizin-lightroom.selection-analysis/1','status':'COMPLETED','operation':'analyze',
                    'modelSha256':'f'*64,'computedPhotos':len(request['photos']),'failedPhotos':0,
                    'results':[{'id':p['id'],'path':p['path'],'status':'COMPUTED','predictions':predictions} for p in request['photos']]}
            (Path(job)/'results.json').write_text(json.dumps(report))
        runtime.globals().mock_execute=execute
        return runtime

    @staticmethod
    def predictions():
        return dict(Exposure2012=.234,Temperature=5436.3,Tint=-2.6,Contrast2012=19.2,Highlights2012=-30,
                    Shadows2012=40,Whites2012=-50,Blacks2012=-10,Saturation=5,Vibrance=10)

    def plan(self,runtime,folder,use_base=True):
        runtime.globals().predictions_json=json.dumps(self.predictions())
        runtime.execute('''
            records=editor.capture(catalog)
            for _,record in ipairs(records) do record.settings,record.omittedBaseKeys=editor.settings(codec.decode(predictions_json),useBase and base or nil,source.settings);record.copyName='Mizin fixture '..record.id end
            manifest={schema='mizin-lightroom.edit-session/1',sessionId='test-session',catalogPath=catalog:getPath(),photos=records,mode='NEW_VIRTUAL_COPIES_ONLY'}
        '''.replace('useBase and',('true' if use_base else 'false')+' and'))
        directory=folder/'MizinLightroomLocal/editing/test-session';directory.mkdir(parents=True)
        (directory/'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
        return directory

    def apply(self,runtime,directory):
        return runtime.globals().editor.applyPlan(runtime.globals().catalog,directory.as_posix(),runtime.globals().manifest,runtime.globals().progress)

    def test_new_copies_receive_ten_controls_and_nineteen_static_fields_and_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            original=runtime.globals().editor.fingerprint(runtime.globals().source.getDevelopSettings(runtime.globals().source))
            status,copies,_=self.apply(runtime,directory)
            self.assertEqual(status,'COMPLETED');self.assertEqual(len(copies),1)
            self.assertEqual(runtime.globals().applyCount,1)
            actual=copies[1].settings
            self.assertEqual(actual.Exposure2012,.23);self.assertEqual(actual.Temperature,5436);self.assertEqual(actual.Tint,-3)
            self.assertEqual(actual.WhiteBalance,'Custom');self.assertEqual(actual.SplitToningBalance,80)
            self.assertEqual(actual.ToneCurvePV2012[2],10)
            self.assertEqual(actual.HueAdjustmentRed,12);self.assertEqual(actual.CropTop,.1)
            self.assertEqual(original,runtime.globals().editor.fingerprint(runtime.globals().source.settings))
            restored,skipped,_=runtime.globals().editor.restoreSession(directory.as_posix())
            self.assertEqual((restored,skipped),(1,0));self.assertEqual(runtime.globals().restoreCount,1)
            self.assertEqual(original,runtime.globals().editor.fingerprint(copies[1].settings))
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(0,0))

    def test_manual_changes_are_not_overwritten_on_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            self.apply(runtime,directory);runtime.execute('source.copies[1].settings.HueAdjustmentRed=25')
            restored,skipped,issues=runtime.globals().editor.restoreSession(directory.as_posix())
            self.assertEqual((restored,skipped),(0,1));self.assertEqual(runtime.globals().restoreCount,0)
            self.assertIn('outras alteracoes',issues[1].error)

    def test_bad_copy_results_and_selection_races_never_apply(self):
        for behavior in ['original','wrong-master','many','preexisting','selection-race']:
            with self.subTest(behavior=behavior),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder)
                if behavior=='preexisting':runtime.execute("catalog:createVirtualCopies('old');selected={source}")
                runtime.globals().behavior=behavior;directory=self.plan(runtime,folder)
                with self.assertRaises(Exception):self.apply(runtime,directory)
                self.assertEqual(runtime.globals().applyCount,0)

    def test_partial_sdk_failure_has_durable_snapshot_and_can_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            runtime.globals().applyBehavior='partial'
            with self.assertRaises(Exception):self.apply(runtime,directory)
            self.assertTrue((directory/'001-ready.json').exists());self.assertTrue((directory/'001-failed.json').exists())
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(1,0))

    def test_snapshot_failure_and_journal_collision_prevent_adjustments(self):
        for failure in ['snapshot','journal']:
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
                if failure=='snapshot':runtime.globals().snapshotBehavior='false'
                else:(directory/'001-ready.json').write_text('{}')
                with self.assertRaises(Exception):self.apply(runtime,directory)
                self.assertEqual(runtime.globals().applyCount,0)

    def test_changed_source_and_changed_catalog_are_rejected(self):
        for failure in ['source','catalog']:
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
                runtime.execute('source.settings.CropTop=.2' if failure=='source' else "manifest.catalogPath='D:/other.lrcat'")
                with self.assertRaises(Exception):self.apply(runtime,directory)
                self.assertEqual(runtime.globals().createCount,0);self.assertEqual(runtime.globals().applyCount,0)

    def test_cancellation_leaves_only_unedited_new_copy_for_review(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            runtime.globals().cancelAt=1
            self.assertEqual(self.apply(runtime,directory)[0],'CANCELLED');self.assertEqual(runtime.globals().applyCount,0)
            self.assertEqual(len(runtime.globals().source.copies),1)

    def test_full_entry_calculates_then_edits_and_releases_busy_flags(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder)
            directory=Path(runtime.globals().editor.edit())
            self.assertTrue((directory/'outcome.json').exists());self.assertEqual(runtime.globals().launches,1)
            self.assertEqual(runtime.globals().applyCount,1);self.assertFalse(runtime.globals().MizinEditorBusy)

    def test_invalid_prediction_is_rejected_before_catalog_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp));runtime.globals().invalid_prediction=True
            with self.assertRaises(Exception):runtime.globals().editor.edit()
            self.assertEqual(runtime.globals().catalogWrites,0);self.assertEqual(runtime.globals().applyCount,0)
            self.assertFalse(runtime.globals().MizinEditorBusy)

    def test_canonical_hash_is_order_independent_and_rejects_nonfinite(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            self.assertTrue(runtime.eval("editor.fingerprint({z=2,a={1,2}})==editor.fingerprint({a={1,2},z=2})"))
            with self.assertRaises(Exception):runtime.execute('editor.fingerprint({x=0/0})')

    def test_style_overlay_does_not_include_profile_noise_or_process_version(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp));runtime.globals().predictions_json=json.dumps(self.predictions())
            settings,omitted=runtime.eval('editor.settings(codec.decode(predictions_json),base,source.settings)')
            self.assertEqual(len(list(settings.keys())),30)
            self.assertIsNone(settings.CameraProfile);self.assertIsNone(settings.Look);self.assertIsNone(settings.ProcessVersion)
            self.assertIsNone(settings.ColorNoiseReduction);self.assertEqual(len(omitted),0)

    def test_two_sources_are_edited_in_their_own_new_copies(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);runtime.execute('selected={source,other}')
            directory=self.plan(runtime,folder);status,copies,_=self.apply(runtime,directory)
            self.assertEqual(status,'COMPLETED');self.assertEqual(len(copies),2);self.assertEqual(runtime.globals().applyCount,2)
            self.assertEqual(copies[1].master.localIdentifier,1);self.assertEqual(copies[2].master.localIdentifier,2)
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(2,0))

    def test_other_engine_requests_are_rejected_during_editing(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp));runtime.globals().MizinEditorBusy=True
            with self.assertRaises(Exception):runtime.execute("dofile(plugin_path..'/LocalAnalysis.lua').run('diagnostic')")
            self.assertEqual(runtime.globals().launches,0)

    def test_unavailable_toning_is_omitted_and_invalid_curve_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp));runtime.globals().predictions_json=json.dumps(self.predictions())
            runtime.execute('source.settings.ColorGradeMidtoneHue=nil')
            settings,omitted=runtime.eval('editor.settings(codec.decode(predictions_json),base,source.settings)')
            self.assertIsNone(settings.ColorGradeMidtoneHue);self.assertEqual(len(omitted),1)
            with self.assertRaises(Exception):runtime.execute('base.settings.ToneCurvePV2012={0,0,0,255};editor.settings(codec.decode(predictions_json),base,source.settings)')

    def test_crash_without_after_record_can_restore_exact_plan_but_not_manual_nearby_values(self):
        for manual in [False,True]:
            with self.subTest(manual=manual),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
                self.apply(runtime,directory);(directory/'001-applied.json').unlink()
                if manual:runtime.execute('source.copies[1].settings.Temperature=5435')
                result=runtime.globals().editor.restoreSession(directory.as_posix())
                self.assertEqual(result[:2],(0,1) if manual else (1,0))


if __name__=='__main__':unittest.main(verbosity=2)
