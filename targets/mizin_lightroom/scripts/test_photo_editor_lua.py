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
    def test_extended_predictions_apply_only_available_controls(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            values=self.predictions();values.update(HueAdjustmentOrange=-22,Texture=13,Dehaze=4)
            runtime.globals().predictions_json=json.dumps(values)
            runtime.execute('source.settings.HueAdjustmentOrange=0;source.settings.Texture=0;source.settings.Dehaze=nil')
            settings,omitted=runtime.eval('editor.settings(codec.decode(predictions_json),nil,source.settings)')
            self.assertEqual(settings['HueAdjustmentOrange'],-22)
            self.assertEqual(settings['Texture'],13)
            self.assertIsNone(settings['Dehaze'])
            self.assertIn('Dehaze',list(omitted.values()))
            for key,value in [('Texture',101),('CropAngle',2)]:
                invalid=self.predictions();invalid[key]=value
                runtime.globals().predictions_json=json.dumps(invalid)
                with self.assertRaises(Exception):
                    runtime.eval('editor.settings(codec.decode(predictions_json),nil,source.settings)')

    def test_in_place_keeps_grid_selection_and_restores_without_copies(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder)
            directory=self.plan(runtime,folder)
            runtime.execute("progress.setCaption=function() end;manifest.mode='IN_PLACE';source.applyDevelopSettings=function(self,settings) assert(inGate);for k,v in pairs(settings) do self.settings[k]=clone(v) end end")
            (directory/'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
            before=runtime.globals().editor.fingerprint(runtime.globals().source.settings)
            status,_,_=runtime.globals().editor.applyInPlace(runtime.globals().catalog,str(directory),runtime.globals().manifest,runtime.globals().progress)
            self.assertEqual(status,'COMPLETED')
            self.assertEqual(runtime.globals().createCount,0)
            self.assertEqual(runtime.globals().moduleName,'library')
            self.assertNotEqual(runtime.globals().editor.fingerprint(runtime.globals().source.settings),before)
            restored,skipped,_=runtime.globals().editor.restoreSession(directory.as_posix())
            self.assertEqual((restored,skipped),(1,0))
            self.assertEqual(runtime.globals().editor.fingerprint(runtime.globals().source.settings),before)

    def test_in_place_partial_failure_can_restore_but_manual_changes_are_preserved(self):
        for manual_change in (False, True):
            with self.subTest(manual_change=manual_change), tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder)
                directory=self.plan(runtime,folder)
                runtime.execute("manifest.mode='IN_PLACE';source.applyDevelopSettings=function(self,settings) self.settings.Exposure2012=settings.Exposure2012;error('partial write') end")
                (directory/'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
                before=runtime.globals().editor.fingerprint(runtime.globals().source.settings)
                status,_,_=runtime.globals().editor.applyInPlace(runtime.globals().catalog,directory.as_posix(),runtime.globals().manifest,runtime.globals().progress)
                self.assertEqual(status,'COMPLETED_WITH_ERRORS')
                self.assertTrue((directory/'001-failed.json').exists())
                runtime.execute("source.applyDevelopSettings=function(self,settings) for k,v in pairs(settings) do self.settings[k]=clone(v) end end")
                if manual_change: runtime.execute('source.settings.Exposure2012=1.57')
                restored,skipped,_=runtime.globals().editor.restoreSession(directory.as_posix())
                self.assertEqual((restored,skipped),(0,1) if manual_change else (1,0))
                if not manual_change:self.assertEqual(runtime.globals().editor.fingerprint(runtime.globals().source.settings),before)

    def test_in_place_cancellation_does_not_write_or_create_copies(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            runtime.execute('cancelNow=true')
            status,_,_=runtime.globals().editor.applyInPlace(runtime.globals().catalog,directory.as_posix(),runtime.globals().manifest,runtime.globals().progress)
            self.assertEqual(status,'CANCELLED')
            self.assertFalse((directory/'001-ready.json').exists())
            self.assertEqual(runtime.globals().createCount,0)

    def test_full_catalog_capture_above_old_edit_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime = self.setup_editor(Path(temp))
            runtime.execute('masters={};selected={};for i=1,280 do local p=newMaster(i);masters[i]=p;selected[i]=p end')
            records, photos, _ = runtime.globals().editor.capture(runtime.globals().catalog)
            self.assertEqual(len(records), 280)
            self.assertEqual(len(photos), 280)

    def test_mixed_capture_preserves_monochrome_without_aborting_color(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute('other.settings.ConvertToGrayscale=true;selected={source,other}')
            records,photos,skipped=runtime.globals().editor.capture(runtime.globals().catalog)
            self.assertEqual(len(records),2)
            self.assertEqual([p['treatment'] for p in photos.values()],['color','monochrome'])
            self.assertEqual(skipped.monochrome,1)
            self.assertTrue(runtime.globals().other.settings.ConvertToGrayscale)

    def test_virtual_source_is_resolved_by_identity_not_path_alone(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute('v=newMaster(77);v.isCopy=true;v.master=source;v.path=source.path;source.copies={v};selected={v}')
            records,photos,skipped=runtime.globals().editor.capture(runtime.globals().catalog)
            self.assertEqual(records[1]['id'],'77')
            self.assertTrue(photos[1]['isVirtualCopy'])

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
                p.applyDevelopPreset=function(self,preset,pluginId)
                    assert(inGate and self.isCopy and selected[1]==self and moduleName=='develop','Adaptive preset only on the selected new copy')
                    presetApplied=(presetApplied or 0)+1
                    for key,value in pairs(preset.values) do self.settings[key]=clone(value) end
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
            catalog.withWriteAccessDo=function(self,title,fn)
                assert(not inGate);catalogWrites=catalogWrites+1
                if gateRace and title==gateRaceTitle then
                    if gateRace=='selection' then selected={source} else source.settings.CropTop=.3 end
                end
                inGate=true;local ok,err=pcall(fn);inGate=false;if not ok then error(err) end
            end
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
            progress={setCaption=function() end,isCanceled=function() return cancelNow==true end,setPortionComplete=function(self,part) if cancelAt==part then cancelNow=true end end}
            editor=dofile(plugin_path..'/PhotoEditor.lua')
        ''')
        def execute(job):
            request=json.loads((Path(job)/'request.json').read_text(encoding='utf-8'))
            predictions=self.predictions()
            if runtime.globals().invalid_prediction:predictions['Temperature']=1
            results=[{'id':p['id'],'path':p['path'],'status':'COMPUTED','predictions':predictions} for p in request['photos']]
            if request.get('geometry',{}).get('horizon'):
                for row in results:row['geometry']={'status':'PROPOSAL_ONLY','imageSlopeDegrees':3.0,'imageWidth':1024,'imageHeight':683,'applyAutomatically':False}
                if runtime.globals().only_first_geometry:
                    for row in results[1:]:
                        row['geometry']={'status':'KEEP_EXISTING','reason':'EYES_WITHOUT_SCENE_SUPPORT','applyAutomatically':False}
            status='COMPLETED'
            if runtime.globals().fail_last and len(results)>1:
                last=results[-1]
                results[-1]={'id':last['id'],'path':last['path'],'filename':'ultima.CR3','status':'FAILED','error':'Camera nao suportada'}
                status='COMPLETED_WITH_ERRORS'
            self.last_request=request
            report={'schema':'mizin-lightroom.selection-analysis/1','status':status,'operation':'analyze',
                    'modelSha256':'f'*64,'computedPhotos':sum(r['status']=='COMPUTED' for r in results),'failedPhotos':0,
                    'results':results}
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
            self.assertEqual(self.apply(runtime,directory)[0],'COMPLETED_WITH_ERRORS')
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


    def test_selection_or_settings_change_while_waiting_for_write_gate_stops_before_apply(self):
        for title,race in [('Mizin: salvar estado anterior da copia','selection'),('Mizin: aplicar edicao na copia','selection'),('Mizin: aplicar edicao na copia','settings')]:
            with self.subTest(title=title,race=race),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
                runtime.globals().gateRaceTitle=title;runtime.globals().gateRace=race
                with self.assertRaises(Exception):self.apply(runtime,directory)
                self.assertEqual(runtime.globals().applyCount,0)

    def test_unsupported_files_are_counted_and_skipped_instead_of_aborting(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute("jpeg=newMaster(9);jpeg.path='D:/fotos/9.JPG';other.settings.ConvertToGrayscale=true;selected={source,jpeg,other}")
            records,photos,skipped=runtime.globals().editor.capture(runtime.globals().catalog)
            self.assertEqual(len(records),2)
            self.assertEqual((skipped.unsupported,skipped.monochrome),(1,1))
            runtime.execute('selected={source,source}')
            with self.assertRaises(Exception):runtime.globals().editor.capture(runtime.globals().catalog)

    def test_intensity_blends_with_current_values_and_offsets_are_clamped(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.globals().predictions_json=json.dumps(self.predictions())
            runtime.execute('source.settings.Texture=4')
            adjusted=runtime.eval("editor.adjust(codec.decode(predictions_json),source.settings,{intensity=50,exposure=.2,texture=10,temperature=0})")
            before=runtime.globals().source.settings
            self.assertAlmostEqual(adjusted.Exposure2012,before.Exposure2012+.5*(.234-before.Exposure2012)+.2)
            self.assertAlmostEqual(adjusted.Temperature,before.Temperature+.5*(5436.3-before.Temperature))
            self.assertEqual(adjusted.Texture,14)
            settings,_=runtime.eval('editor.settings(editor.adjust(codec.decode(predictions_json),source.settings,{intensity=50,exposure=.2,texture=10}),nil,source.settings)')
            self.assertEqual(settings.Texture,14)
            clamped=runtime.eval("editor.adjust({Exposure2012=4.9,Temperature=49000,Tint=0,Contrast2012=99,Highlights2012=0,Shadows2012=0,Whites2012=0,Blacks2012=0,Saturation=0,Vibrance=0},source.settings,{intensity=100,exposure=2,temperature=3000,contrast=50})")
            self.assertEqual((clamped.Exposure2012,clamped.Temperature,clamped.Contrast2012),(5,50000,100))
            for bad in ('{intensity=120}','{intensity=-1}','{exposure=3}','{temperature=0/0}'):
                with self.subTest(bad=bad),self.assertRaises(Exception):
                    runtime.eval('editor.adjust(codec.decode(predictions_json),source.settings,'+bad+')')

    def test_saved_options_are_sanitized(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            options=runtime.eval('editor.validOptions({intensity=250,exposure=.5,temperature=99999,tint=0/0})')
            self.assertEqual((options.intensity,options.exposure,options.temperature,options.tint),(100,.5,0,0))

    def test_complementary_preset_never_overrides_model_or_geometry(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.globals().predictions_json=json.dumps(self.predictions())
            runtime.execute('''
                fixturePreset={getSetting=function() return {Exposure2012=2,CropTop=.5,CropAngle=3,GrainAmount=20,CameraProfile='Adobe Portrait',
                    ProcessVersion='6.7',MaskGroupBasedCorrections={},Orientation='AB',CustomTemperature=9000,PostCropVignetteAmount=-15} end}
                presetValues=editor.presetSettings(fixturePreset)
                planned=editor.settings(codec.decode(predictions_json),nil,source.settings)
                presetKeys=editor.mergePreset(planned,presetValues)
            ''')
            preset=runtime.globals().presetValues
            for blocked in ('CropTop','CropAngle','ProcessVersion','MaskGroupBasedCorrections','Orientation'):
                self.assertIsNone(preset[blocked])
            planned=runtime.globals().planned
            self.assertEqual(planned.Exposure2012,.23)
            self.assertIsNone(planned.CustomTemperature)
            self.assertEqual((planned.GrainAmount,planned.CameraProfile,planned.PostCropVignetteAmount),(20,'Adobe Portrait',-15))
            self.assertEqual(list(runtime.globals().presetKeys.values()),['CameraProfile','GrainAmount','PostCropVignetteAmount'])

    def test_preset_keys_apply_to_new_copy_and_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder)
            runtime.globals().predictions_json=json.dumps(self.predictions())
            runtime.execute('''
                records=editor.capture(catalog)
                for _,record in ipairs(records) do
                    record.settings=editor.settings(codec.decode(predictions_json),nil,source.settings)
                    record.presetKeys=editor.mergePreset(record.settings,{GrainAmount=25,CameraProfile='Adobe Portrait'})
                    record.copyName='Mizin fixture '..record.id
                end
                manifest={schema='mizin-lightroom.edit-session/1',sessionId='preset-session',catalogPath=catalog:getPath(),photos=records,mode='NEW_VIRTUAL_COPIES_ONLY'}
            ''')
            directory=folder/'MizinLightroomLocal/editing/preset-session';directory.mkdir(parents=True)
            (directory/'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
            original=runtime.globals().editor.fingerprint(runtime.globals().source.settings)
            status,copies,_=self.apply(runtime,directory)
            self.assertEqual(status,'COMPLETED')
            self.assertEqual((copies[1].settings.GrainAmount,copies[1].settings.CameraProfile),(25,'Adobe Portrait'))
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(1,0))
            self.assertEqual(original,runtime.globals().editor.fingerprint(copies[1].settings))

    def test_full_entry_uses_saved_fine_adjustment_and_scene_option(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder)
            runtime.execute("modules.LrDialogs.presentModalDialog=function(props) referenceProps.intensity=50;referenceProps.exposure=.2;referenceProps.scene=true;return 'ok' end")
            before=runtime.globals().source.settings.Exposure2012
            Path(runtime.globals().editor.edit())
            copy=runtime.globals().source.copies[1]
            self.assertAlmostEqual(copy.settings.Exposure2012,round(before+.5*(.234-before)+.2,2))
            self.assertEqual(runtime.globals().prefs.editOptions.intensity,50)
            self.assertTrue(self.last_request['sceneConsistency']['enabled'])

    def test_full_entry_continues_with_computed_photos_after_confirmation(self):
        for answer,expected in (('ok',1),('cancel',0)):
            with self.subTest(answer=answer),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder)
                runtime.globals().fail_last=True;runtime.globals().confirm_answer=answer
                runtime.execute("selected={source,other};modules.LrDialogs.confirm=function(title,body) confirmBody=body;return confirm_answer end")
                runtime.globals().editor.edit()
                self.assertEqual(runtime.globals().applyCount,expected)
                self.assertIn('ultima.CR3',runtime.globals().confirmBody)
                self.assertEqual(len(runtime.globals().other.copies),0)
                self.assertFalse(runtime.globals().MizinEditorBusy)

    def test_horizon_crop_is_rotation_safe_and_respects_existing_crop(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute('''
                proposal={status='PROPOSAL_ONLY',imageSlopeDegrees=3.0,imageWidth=1500,imageHeight=1000}
                plain={CropAngle=0,CropTop=0,CropLeft=0,CropBottom=1,CropRight=1}
                planned={};angle=editor.horizon(planned,plain,proposal)
            ''')
            import math
            planned=runtime.globals().planned
            self.assertEqual(runtime.globals().angle,3)
            self.assertIsNone(planned.HasCrop)  # Not part of the readable SDK develop controls.
            # Lightroom stores the TOP-LEFT and BOTTOM-RIGHT corners of the rotated crop
            # rectangle. Rebuild that rectangle and require all four corners inside the image
            # and the original aspect ratio (the old equal-margin crop failed both).
            W,H=1500,1000;phi=math.radians(planned.CropAngle)
            tl=(planned.CropLeft*W,planned.CropTop*H);br=(planned.CropRight*W,planned.CropBottom*H)
            dx,dy=br[0]-tl[0],br[1]-tl[1]
            cw=dx*math.cos(phi)+dy*math.sin(phi);ch=-dx*math.sin(phi)+dy*math.cos(phi)
            self.assertAlmostEqual(cw/ch,W/H,places=3)
            cx,cy=(tl[0]+br[0])/2,(tl[1]+br[1])/2
            for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1)):
                x=cx+sx*cw/2*math.cos(phi)-sy*ch/2*math.sin(phi);y=cy+sx*cw/2*math.sin(phi)+sy*ch/2*math.cos(phi)
                self.assertTrue(-1e-6<=x<=W+1e-6 and -1e-6<=y<=H+1e-6,(x,y))
            self.assertGreater(cw/W,.9)
            # Beyond tolerance (.05 margin, .5 degree): still preserved, same as a bare default crop.
            for case in ("{CropTop=.1}","{CropAngle=1}"):
                result,reason=runtime.eval('editor.horizon({},'+case+',proposal)')
                self.assertIsNone(result);self.assertIn('corte',reason)
            for proposal in ("{status='KEEP_EXISTING'}","{status='PROPOSAL_ONLY',imageSlopeDegrees=12,imageWidth=10,imageHeight=10}","nil"):
                self.assertIsNone(runtime.eval('editor.horizon({},plain,'+proposal+')')[0])

    def test_horizon_crop_matches_lightroom_own_straighten_values(self):
        # Values Lightroom itself wrote for centered straightens in the photographer's approved
        # catalog (private/raw-datasets/20261029T172842Z-c6cf2182). 111 of 127 such crops match
        # this convention to 0.002; the rest were tightened by hand afterwards.
        cases=[  # imageSlope, render W, H, sensorSwapped, observed Top, Left
            (-3.14,1024,684,'false',.0760,.0211),
            (-2.03,1024,684,'false',.0505,.0141),
            (-1.98,684,1024,'true',.0493,.0137),  # portrait: crop lives in the landscape sensor frame
            (-1.98,684,1024,'nil',.0493,.0137),   # older engine without the flag: landscape sensor assumed
        ]
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            for slope,w,h,swapped,top,left in cases:
                with self.subTest(slope=slope,w=w,h=h,swapped=swapped):
                    runtime.execute(f"planned={{}};editor.horizon(planned,{{}},{{status='PROPOSAL_ONLY',imageSlopeDegrees={slope},imageWidth={w},imageHeight={h},sensorSwapped={swapped}}})")
                    planned=runtime.globals().planned
                    self.assertAlmostEqual(planned.CropAngle,slope)
                    # The small safety shrink keeps us at or just inside Lightroom's own maximum crop.
                    self.assertAlmostEqual(planned.CropTop,top,delta=.0015);self.assertGreaterEqual(planned.CropTop,top-.0002)
                    self.assertAlmostEqual(planned.CropLeft,left,delta=.0015);self.assertGreaterEqual(planned.CropLeft,left-.0002)
                    self.assertAlmostEqual(planned.CropBottom,1-planned.CropTop);self.assertAlmostEqual(planned.CropRight,1-planned.CropLeft)
            # Opposite rotation mirrors the corners: the top margin collapses, the side one grows.
            runtime.execute("planned={};editor.horizon(planned,{},{status='PROPOSAL_ONLY',imageSlopeDegrees=3.14,imageWidth=1024,imageHeight=684,sensorSwapped=false})")
            planned=runtime.globals().planned
            self.assertLess(planned.CropTop,.002);self.assertGreater(planned.CropLeft,.05)

    def test_automatic_edit_honors_saved_horizon_but_never_masks(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute("prefs.editOptions={horizon=true,mask='preset-uuid'};auto=editor.autoChoice()")
            auto=runtime.globals().auto
            self.assertTrue(auto.horizon);self.assertIsNone(auto.maskPresetUuid);self.assertTrue(auto.inPlace)
            runtime.execute("prefs.editOptions={};auto=editor.autoChoice()")
            self.assertFalse(runtime.globals().auto.horizon)

    def test_horizon_tolerates_small_preexisting_crop_residual(self):
        # Real catalog evidence: 0 of 2,201 real photos with crop data ever had an exact
        # default crop; every one carries a small residual from a lens/profile correction.
        # Requiring an exact match rejected every real photo regardless of detection quality.
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute("proposal={status='PROPOSAL_ONLY',imageSlopeDegrees=3.0,imageWidth=1500,imageHeight=1000}")
            for within in ("{CropTop=.02,CropLeft=.02,CropBottom=.98,CropRight=.98}",
                           "{CropAngle=.3}","{CropTop=.04,CropBottom=.96}"):
                # M.horizon returns a single value (the angle) on success, not a tuple.
                # Kept with margin from the exact .05/1-.95 tolerance edge, where binary
                # floating point (1-.95=.050000000000000044) would make an exact-boundary
                # fixture flaky rather than exercising the tolerance itself.
                angle=runtime.eval('editor.horizon({},'+within+',proposal)')
                self.assertEqual(angle,3)
            # A genuinely different, deliberate reframing (beyond the tolerance) still blocks it.
            for beyond in ("{CropTop=.08,CropBottom=.92}","{CropAngle=.8}"):
                result,reason=runtime.eval('editor.horizon({},'+beyond+',proposal)')
                self.assertIsNone(result);self.assertIn('corte',reason)

    def test_horizon_skip_reasons_are_specific_not_generic(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            cases=[("nil",'geometria nao foi calculada'),
                   ("{status='KEEP_EXISTING',reason='ALREADY_LEVEL'}",'ja esta nivelada'),
                   ("{status='KEEP_EXISTING',reason='ANALYSIS_FAILED'}",'nao foi possivel analisar'),
                   ("{status='KEEP_EXISTING',reason='INSUFFICIENT_AGREEMENT'}",'sem referencias confiaveis'),
                   ("{status='KEEP_EXISTING',reason='EYES_WITHOUT_SCENE_SUPPORT'}",'sem referencia segura do ambiente'),
                   ("{status='KEEP_EXISTING',reason='SCENE_EYES_DISAGREE'}",'nao confirmam o mesmo eixo')]
            for proposal,expected in cases:
                result,reason=runtime.eval('editor.horizon({},{CropTop=0,CropLeft=0,CropBottom=1,CropRight=1},'+proposal+')')
                self.assertIsNone(result);self.assertIn(expected,reason)

    def test_full_entry_straightens_both_new_copies_and_direct_edits(self):
        # Horizon crop writes through the same before/after settings restore as every other
        # direct-edit control, so (unlike adaptive masks, which need applyDevelopPreset on a
        # fresh copy) it is not restricted to new copies.
        for destination in ('copies','selection'):
            with self.subTest(destination=destination),tempfile.TemporaryDirectory() as temp:
                folder=Path(temp);runtime=self.setup_editor(folder);runtime.globals().destination=destination
                runtime.execute("source.settings.CropTop=0;source.applyDevelopSettings=function(self,settings) assert(inGate);for k,v in pairs(settings) do self.settings[k]=clone(v) end end")
                runtime.execute("modules.LrDialogs.confirm=function() return 'ok' end;modules.LrDialogs.presentModalDialog=function(props) referenceProps.horizon=true;referenceProps.destination=destination;return 'ok' end")
                runtime.globals().editor.edit()
                self.assertTrue(bool(self.last_request.get('geometry')))
                target=runtime.globals().source.copies[1] if destination=='copies' else runtime.globals().source
                self.assertEqual(target.settings.CropAngle,3)

    def test_twenty_photos_are_edited_when_only_one_has_reliable_leveling(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute('''
                only_first_geometry=true;masters={};selected={}
                for i=1,20 do
                    local p=newMaster(i);p.settings.CropTop=0
                    p.applyDevelopSettings=function(self,settings)
                        assert(inGate);for k,v in pairs(settings) do self.settings[k]=clone(v) end
                    end
                    masters[i]=p;selected[i]=p
                end
                modules.LrDialogs.confirm=function() return 'ok' end
                modules.LrDialogs.presentModalDialog=function(props)
                    referenceProps.horizon=true;referenceProps.destination='selection';return 'ok'
                end
                modules.LrDialogs.message=function(title,message) finalMessage=message end
            ''')
            directory=Path(runtime.globals().editor.edit())
            session=json.loads((directory/'session.json').read_text())
            outcome=json.loads((directory/'outcome.json').read_text())
            self.assertEqual(len(self.last_request['photos']),20)
            self.assertEqual(session['geometryAnalyzed'],20)
            self.assertEqual(outcome['application']['completed'],20)
            self.assertEqual(outcome['application']['straightened'],1)
            self.assertIn('Fotos analisadas para nivelamento: 20 de 20',runtime.globals().finalMessage)
            self.assertIn('19x',runtime.globals().finalMessage)
            self.assertEqual(runtime.globals().masters[20].settings.Temperature,5436)

    def test_adaptive_mask_preset_is_applied_to_new_copy_and_restored(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder)
            runtime.execute('''
                maskPreset={values={MaskGroupBasedCorrections={{MaskName='Pessoa',CorrectionAmount=1}}},getName=function() return 'Adaptativo: Pessoa' end}
                maskPreset.getSetting=function() return maskPreset.values end
                emptyPreset={values={GrainAmount=10},getName=function() return 'Granulacao' end};emptyPreset.getSetting=function() return emptyPreset.values end
                presetsByUuid={['mask-uuid']=maskPreset,['grain-uuid']=emptyPreset}
                modules.LrApplication.developPresetByUuid=function(uuid) return presetsByUuid[uuid] end
                modules.LrApplication.developPresetFolders=function() return {{getName=function() return 'Adaptativos' end,getDevelopPresets=function()
                    return {{getName=function() return 'Pessoa' end,getUuid=function() return 'mask-uuid' end},{getName=function() return 'Grao' end,getUuid=function() return 'grain-uuid' end}} end}} end
                modules.LrDialogs.presentModalDialog=function(props) referenceProps.mask=chosenMask;return 'ok' end
            ''')
            original=runtime.globals().editor.fingerprint(runtime.globals().source.settings)
            runtime.globals().chosenMask='grain-uuid'
            with self.assertRaisesRegex(Exception,'nao contem mascaras'):runtime.globals().editor.edit()
            self.assertEqual(runtime.globals().catalogWrites,0)
            runtime.globals().chosenMask='mask-uuid'
            directory=Path(runtime.globals().editor.edit())
            copy=runtime.globals().source.copies[1]
            self.assertEqual(runtime.globals().presetApplied,1)
            self.assertEqual(copy.settings.MaskGroupBasedCorrections[1].MaskName,'Pessoa')
            self.assertTrue(json.loads((directory/'001-applied.json').read_text())['masksChanged'])
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(1,0))
            self.assertEqual(original,runtime.globals().editor.fingerprint(copy.settings))
            self.assertEqual(original,runtime.globals().editor.fingerprint(runtime.globals().source.settings))

    def test_direct_edit_preset_skips_controls_the_photo_does_not_have(self):
        with tempfile.TemporaryDirectory() as temp:
            runtime=self.setup_editor(Path(temp))
            runtime.execute("planned={};mergedKeys=editor.mergePreset(planned,{GrainAmount=20,NewFutureControl=5},{GrainAmount=0})")
            self.assertEqual(list(runtime.globals().mergedKeys.values()),['GrainAmount'])
            self.assertIsNone(runtime.globals().planned.NewFutureControl)

    def test_in_place_restore_issues_are_written_to_disk(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder)
            runtime.execute("progress.setCaption=function() end;manifest.mode='IN_PLACE';source.applyDevelopSettings=function(self,settings) assert(inGate);for k,v in pairs(settings) do self.settings[k]=clone(v) end end")
            (directory/'session.json').write_text(runtime.globals().codec.encode(runtime.globals().manifest))
            runtime.globals().editor.applyInPlace(runtime.globals().catalog,str(directory),runtime.globals().manifest,runtime.globals().progress)
            runtime.execute('source.settings.Exposure2012=1.57')
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(0,1))
            self.assertEqual(len(list(directory.glob('restore-issues-*.json'))),1)

    def test_selection_change_while_waiting_for_restore_gate_preserves_copies(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);runtime=self.setup_editor(folder);directory=self.plan(runtime,folder);self.apply(runtime,directory)
            runtime.globals().gateRaceTitle='Mizin: restaurar copia da ultima edicao';runtime.globals().gateRace='selection'
            self.assertEqual(runtime.globals().editor.restoreSession(directory.as_posix())[:2],(0,1))
            self.assertEqual(runtime.globals().restoreCount,0)


if __name__=='__main__':unittest.main(verbosity=2)
