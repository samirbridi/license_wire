"""Write site/assets/release.json from the validated package and the published update base URL.
Run before deploying the presentation site (Cloudflare Pages project "playoutmizin")."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://updates.p2pmizin.dev/playout/'
latest=json.loads((ROOT/'evidence/package-latest.json').read_text(encoding='utf-8-sig'))
bid=latest['version'].split('build ')[1][:-1]
assert json.loads((ROOT/f'evidence/package-validation-{bid}.json').read_text(encoding='utf-8-sig'))['result']=='PASS'
release=pathlib.PurePosixPath(latest['release']).name;artifacts={}
for a in latest['artifacts']:
    kind='setup' if a['file'].endswith('-setup.exe') else 'portable'
    artifacts[kind]=dict(url=BASE+'releases/'+release+'/'+a['file'],bytes=a['bytes'],sha256=a['sha256'])
out=ROOT/'site/assets/release.json'
out.write_text(json.dumps(dict(version=latest['version'],artifacts=artifacts),indent=2)+'\n',encoding='utf-8')
print(out)
