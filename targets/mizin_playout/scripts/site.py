"""Write site/assets/release.json from the validated package and the published update base URL.
Run before deploying the presentation site (Cloudflare Pages project "playoutmizin")."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://playoutmizin.pages.dev/updates/'
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
# Keep the static fallback links in index.html identical to release.json.
import re
index=ROOT/'site/index.html';html=index.read_text(encoding='utf-8')
for kind,a in artifacts.items():
    html=re.sub(r'(data-download="'+kind+r'" href=")[^"]*(")',lambda m:m.group(1)+a['url']+m.group(2),html)
    html=re.sub(r'(<code data-sha="'+kind+r'">SHA-256 )[0-9a-f]{64}',lambda m:m.group(1)+a['sha256'],html)
    html=re.sub(r'(<span data-size="'+kind+r'">)[^<]*',lambda m:m.group(1)+f"{a['bytes']/1e6:.1f} MB",html)
html=re.sub(r'(data-version>)v[^<]*',lambda m:m.group(1)+latest['version'],html)
index.write_text(html,encoding='utf-8');print(index)
# What's new: each published version is added once (newest first) from its packaged bilingual notes.
import datetime
changelog_path=ROOT/'site/assets/changelog.json'
changelog=json.loads(changelog_path.read_text(encoding='utf-8')) if changelog_path.exists() else []
if not any(item['version']==latest['version'] for item in changelog):
    notes=json.loads((ROOT/latest['release']/'payload/release-notes.json').read_text(encoding='utf-8-sig'))
    changelog.insert(0,dict(version=latest['version'],date=datetime.date.today().isoformat(),notes={'en':notes['en'],'pt-BR':notes['pt-BR']}))
    changelog_path.write_text(json.dumps(changelog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(changelog_path)
# Cache busting: stylesheets/scripts are cached by browsers; stamp their content hash so every change is picked up.
for page in (ROOT/'site').glob('*.html'):
    html=page.read_text(encoding='utf-8')
    html=re.sub(r'assets/(styles\.css|site\.js)(\?v=[^"]*)?"',lambda m:'assets/'+m.group(1)+'?v='+__import__('hashlib').sha256((ROOT/'site/assets'/m.group(1)).read_bytes()).hexdigest()[:10]+'"',html)
    page.write_text(html,encoding='utf-8')
