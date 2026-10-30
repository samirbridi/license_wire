"""Derive an inactive style base from unanimous, explicitly approved user edits.

The input is the existing data-only snapshot export, not a live catalog. Missing
values never become defaults. Variable fields remain outside the fixed base.
This is a descriptive asset, not a fitted predictor or an Adobe preset.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
from pathlib import Path

NUMERIC_PILOT={'Exposure2012','Temperature','Tint','Contrast2012','Highlights2012',
               'Shadows2012','Whites2012','Blacks2012','Saturation','Vibrance'}
STYLE_FIELDS={'Look','ProcessVersion','CameraProfile','ToneCurveName2012',
              'ToneCurvePV2012','ToneCurvePV2012Red','ToneCurvePV2012Green','ToneCurvePV2012Blue',
              'Clarity2012','Texture','Dehaze','Sharpness','LuminanceSmoothing','ColorNoiseReduction',
              'ParametricDarks','ParametricLights','ParametricHighlights','ParametricShadows',
              'SplitToningBalance','SplitToningHighlightHue','SplitToningHighlightSaturation',
              'SplitToningShadowHue','SplitToningShadowSaturation'} | {
    prefix+color for prefix in ('HueAdjustment','SaturationAdjustment','LuminanceAdjustment')
    for color in ('Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta')} | {
    'ColorGrade'+part for part in ('Blending','Balance','GlobalHue','GlobalSat','GlobalLum',
        'MidtoneHue','MidtoneSat','MidtoneLum','HighlightLum','ShadowLum')}


def encoded(value):return json.dumps(value,sort_keys=True,ensure_ascii=False,allow_nan=False,separators=(',',':'))


def derive(rows,source_hash):
    usable={};excluded=collections.Counter();duplicate=0
    for row in rows:
        if row.get('approvalStatus')!='REFERENCE_APPROVED_BY_PHOTOGRAPHER':excluded['notExplicitlyApproved']+=1;continue
        if row.get('styleVariant')!='color':excluded['notColor']+=1;continue
        if row.get('cameraModel')!='Canon EOS R6m2':excluded['otherCamera']+=1;continue
        if row.get('isVirtualCopy') is not False or row.get('isMobileProxy') is not False:
            excluded['virtualOrProxyOrUnknown']+=1;continue
        path=row.get('sourcePath')
        if not isinstance(path,str) or not path.strip() or not isinstance(row.get('currentParameters'),dict):
            raise ValueError('Missing source identity/settings')
        key=path.replace('/','\\').casefold()
        if key in usable:
            if encoded(usable[key]['currentParameters'])!=encoded(row['currentParameters']) or usable[key].get('eventRootId')!=row.get('eventRootId'):
                raise ValueError('Conflicting approved source')
            duplicate+=1;continue
        # Validate serializability and finite data before publishing any output.
        encoded(row['currentParameters'])
        usable[key]=row
    if not usable:raise ValueError('No eligible approved references')
    eligible=list(usable.values());events={str(row['eventRootId']) for row in eligible}
    summary={};fixed={}
    for key in sorted(STYLE_FIELDS):
        values=collections.Counter(encoded(row['currentParameters'][key]) for row in eligible if key in row['currentParameters'])
        present=sum(values.values());unanimous=present==len(eligible) and len(values)==1
        summary[key]={'present':present,'missing':len(eligible)-present,'distinct':len(values),
                      'unanimousAcrossAllReferences':unanimous,
                      'mostCommon':[{'value':json.loads(value),'count':count} for value,count in values.most_common(5)]}
        if unanimous:fixed[key]=json.loads(next(iter(values)))
    base={'schema':'mizin-lightroom.fixed-style-base/1','sourceExportSha256':source_hash,
          'referenceCount':len(eligible),'eventCount':len(events),'supportedCameraModels':['Canon EOS R6m2'],
          'supportedTreatment':'color','selectionRule':'PRESENT_AND_EXACTLY_EQUAL_IN_EVERY_APPROVED_REFERENCE',
          'settings':fixed,'profileResourcesIncluded':False,'externalProfileReferencesOnly':True,
          'active':False,'completeStyle':False,'adobePreset':False,'modelTrainingPerformed':False,'catalogWritePerformed':False,
          'photographicValidation':False,'hostApplicationValidation':False,
          'notIncluded':['per-photo variable controls','crop','local masks','lens and geometry','external profile/LUT assets']}
    report={'schema':'mizin-lightroom.style-corpus-summary/1','referenceCount':len(eligible),'eventCount':len(events),
            'excluded':dict(excluded),'duplicates':duplicate,'sourceExportSha256':source_hash,'fields':summary,
            'fixedFieldCount':len(fixed),'variableFields':[k for k,s in summary.items() if s['distinct']>1],
            'missingFields':[k for k,s in summary.items() if s['missing']>0],
            'limitations':['Snapshot export omits some settings; absence is not zero or a Lightroom default.',
                'Counts describe existing approved work, not an independent quality benchmark.',
                'Fixed profile/Look identifiers require the corresponding Adobe resources on the editing machine.']}
    names=collections.Counter(row['currentParameters'].get('Look',{}).get('Name') for row in eligible)
    report['lookNameCounts']=[{'name':name,'count':count} for name,count in names.items()]
    report['limitations'].append('CameraProfile alone does not reproduce a Look; the Look structure varies and is not included in the fixed base.')
    return base,report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();rows=[];sha=hashlib.sha256()
    with a.source.open('rb') as stream:
        for _ in range(100001):
            line=stream.readline(1024*1024+1)
            if not line:break
            if len(line)>1024*1024:raise ValueError('Input record exceeds budget')
            sha.update(line)
            if line.strip():rows.append(json.loads(line))
        else:raise ValueError('Input record count exceeds budget')
    base,report=derive(rows,sha.hexdigest());a.output.mkdir(parents=True,exist_ok=False)
    for filename,value in [('style-base.json',base),('style-corpus-summary.json',report)]:
        (a.output/filename).write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'referenceCount':base['referenceCount'],'eventCount':base['eventCount'],
                      'fixedFields':list(base['settings']),'variableFields':report['variableFields'],'active':False}))


if __name__=='__main__':main()
