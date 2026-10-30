import copy
import unittest
from extract_style_base import derive


class StyleBaseTests(unittest.TestCase):
    def row(self,path,event,settings):
        return dict(sourcePath=path,eventRootId=event,currentParameters=settings,
            approvalStatus='REFERENCE_APPROVED_BY_PHOTOGRAPHER',styleVariant='color',cameraModel='Canon EOS R6m2',
            isVirtualCopy=False,isMobileProxy=False)

    def test_only_unanimous_present_settings_are_fixed_missing_is_not_default(self):
        rows=[self.row('D:/one/a.CR3',1,dict(CameraProfile='owned profile',ToneCurvePV2012=[0,0,255,255],HueAdjustmentOrange=5)),
              self.row('D:/two/a.CR3',2,dict(CameraProfile='owned profile',ToneCurvePV2012=[0,0,255,255],HueAdjustmentOrange=6,Texture=0))]
        base,report=derive(rows,'a'*64)
        self.assertEqual(base['settings'],dict(CameraProfile='owned profile',ToneCurvePV2012=[0,0,255,255]))
        self.assertIn('HueAdjustmentOrange',report['variableFields'])
        self.assertEqual(report['fields']['Texture']['missing'],1)
        self.assertFalse(base['active']);self.assertFalse(base['modelTrainingPerformed'])
        self.assertFalse(base['completeStyle']);self.assertFalse(base['adobePreset'])

    def test_unapproved_and_other_treatment_cannot_teach_the_base(self):
        approved=self.row('D:/one/a.CR3',1,dict(CameraProfile='A'))
        pending=copy.deepcopy(approved);pending.update(sourcePath='D:/pending.CR3',approvalStatus='PENDING')
        mono=copy.deepcopy(approved);mono.update(sourcePath='D:/mono.CR3',styleVariant='monochrome')
        base,report=derive([approved,pending,mono],'b'*64)
        self.assertEqual(base['referenceCount'],1);self.assertEqual(sum(report['excluded'].values()),2)

    def test_duplicate_conflict_and_nonfinite_settings_are_rejected(self):
        first=self.row('D:/one/a.CR3',1,dict(CameraProfile='A'))
        base,report=derive([first,copy.deepcopy(first)],'c'*64)
        self.assertEqual(report['duplicates'],1)
        second=copy.deepcopy(first);second['currentParameters']['CameraProfile']='B'
        with self.assertRaises(ValueError):derive([first,second],'c'*64)
        second['sourcePath']='D:/new.CR3';second['currentParameters']['Texture']=float('nan')
        with self.assertRaises(ValueError):derive([first,second],'c'*64)


if __name__=='__main__':unittest.main()
