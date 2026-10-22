"""Sign release metadata locally; publish only under the isolated playout/ prefix.

Signing private material stays in ignored binaries/release-signing, never in R2,
Git or app packages. The public key is compiled into the native client.
"""
import argparse,base64,hashlib,json,pathlib,struct,subprocess,urllib.request,urllib.error,datetime
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://updates.p2pmizin.dev/playout/'
BUCKET='ezshare-updates'
KEY_ID='mizin-playout-2026-01'
# The public domain rejects urllib's generic bot identifier. Use an explicit
# release-client identity, like the native updater; no access rule is changed.
_opener=urllib.request.build_opener()
_opener.addheaders=[('User-Agent','MizinPlayoutRelease/1.0')]
urllib.request.install_opener(_opener)
PRIVATE=ROOT/'binaries/release-signing/private.pem'
PUBLIC=ROOT/'reconstructed/src/update_key.hpp'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def key_blob(key):
 n=key.public_key().public_numbers();e=n.e.to_bytes((n.e.bit_length()+7)//8,'big');m=n.n.to_bytes((n.n.bit_length()+7)//8,'big')
 return struct.pack('<6I',0x31415352,key.key_size,len(e),len(m),0,0)+e+m
def init_key():
 PRIVATE.parent.mkdir(parents=True,exist_ok=True)
 if PRIVATE.exists():key=serialization.load_pem_private_key(PRIVATE.read_bytes(),None)
 else:
  if PUBLIC.exists():raise ValueError('Public trust key already exists; restore the original private key instead of rotating silently.')
  key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  with PRIVATE.open('xb') as f:f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
 text='#pragma once\ninline constexpr const char* UpdateKeyId = "'+KEY_ID+'";\ninline constexpr const char* UpdatePublicBlob = "'+base64.b64encode(key_blob(key)).decode()+'";\n'
 if PUBLIC.exists() and PUBLIC.read_text()!=text:raise ValueError('Signing key does not match compiled trust key')
 PUBLIC.write_text(text,encoding='utf-8');print('Release signing key ready; only its public key is in source.')
def envelope(payload):
 key=serialization.load_pem_private_key(PRIVATE.read_bytes(),None)
 assert base64.b64encode(key_blob(key)).decode() in PUBLIC.read_text()
 raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()
 return dict(key_id=KEY_ID,payload=base64.b64encode(raw).decode(),signature=base64.b64encode(key.sign(raw,padding.PKCS1v15(),hashes.SHA256())).decode())
def prepare():
 p=read(ROOT/'evidence/package-latest.json');build=read(ROOT/'evidence/build-version.json');assert p['version']==build['display'] and build['build_status']=='PASS'
 release=ROOT/p['release'];info=read(release/'artifacts.json');artifacts={}
 for a in info['artifacts']:
  assert sha(release/a['file'])==a['sha256']
  kind='setup' if a['file'].endswith('-setup.exe') else 'portable'
  artifacts[kind]=dict(file='releases/'+release.name+'/'+a['file'],size=a['bytes'],sha256=a['sha256'])
 notes=read(release/'payload/release-notes.json')
 payload=dict(schema=1,product='mizin-playout',channel='preview',platform='windows-x64',version=info['version'],source_commit=info['source_commit'],published_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),notes=notes,artifacts=artifacts)
 if (release/'update-payload.json').exists():
  prior=read(release/'update-payload.json')
  assert {k:v for k,v in prior.items() if k!='published_utc'}=={k:v for k,v in payload.items() if k!='published_utc'},'Immutable release metadata changed'
  payload=prior
 else:
  write(release/'update-manifest.json',envelope(payload));write(release/'update-payload.json',payload)
 print(release)
 return release,payload
def publish(node,wrangler):
 release,payload=prepare()
 # A current package validation is required before any pointer is announced.
 bid=payload['version'].split('build ')[1][:-1]
 validation=read(ROOT/f'evidence/package-validation-{bid}.json');assert validation['result']=='PASS'
 with urllib.request.urlopen('https://updates.p2pmizin.dev/latest-portable.json',timeout=30) as response:p2p_before=hashlib.sha256(response.read()).hexdigest()
 def upload(relative,file,content_type,cache):
  assert relative.startswith('playout/') and '..' not in relative.split('/')
  subprocess.run([str(node),str(wrangler),'r2','object','put',BUCKET+'/'+relative,'--file',str(file),'--content-type',content_type,'--cache-control',cache,'--remote'],cwd=ROOT,check=True)
 def public_hash(relative):
  with urllib.request.urlopen(BASE+relative,timeout=120) as response:
   digest=hashlib.sha256();size=0
   while block:=response.read(1024*1024):digest.update(block);size+=len(block)
  return size,digest.hexdigest()
 def immutable(relative,file,size,digest,content_type='application/octet-stream'):
  try:existing=public_hash(relative)
  except urllib.error.HTTPError as error:
   if error.code!=404:raise
   existing=None
  if existing is None:upload('playout/'+relative,file,content_type,'public, max-age=31536000, immutable')
  else:assert existing==(size,digest),'Refusing to replace an immutable published object: '+relative
  assert public_hash(relative)==(size,digest),'Public object differs: '+relative
 sources=read(ROOT/'packaging/dependency-sources.json');source_root='sources/qt-6.10.2-ffmpeg-7.1.2/'
 for a in [*sources['archives'],sources['configuration']]:
  local=ROOT/'binaries/dependency-sources'/a['file'];assert sha(local)==a['sha256']
  immutable(source_root+a['file'],local,a['bytes'],a['sha256'])
 immutable(source_root+'index.json',ROOT/'packaging/dependency-sources.json',(ROOT/'packaging/dependency-sources.json').stat().st_size,sha(ROOT/'packaging/dependency-sources.json'),'application/json')
 for a in payload['artifacts'].values():
  immutable(a['file'],release/pathlib.PurePosixPath(a['file']).name,a['size'],a['sha256'])
 immutable('history/'+release.name+'.json',release/'update-manifest.json',(release/'update-manifest.json').stat().st_size,sha(release/'update-manifest.json'),'application/json')
 # Last: clients only learn about a version after its artifacts are public/verified.
 upload('playout/preview/latest.json',release/'update-manifest.json','application/json','no-store')
 with urllib.request.urlopen(BASE+'preview/latest.json',timeout=30) as response:assert json.load(response)==read(release/'update-manifest.json')
 with urllib.request.urlopen('https://updates.p2pmizin.dev/latest-portable.json',timeout=30) as response:p2p_after=hashlib.sha256(response.read()).hexdigest()
 assert p2p_before==p2p_after,'P2P feed changed during publication; inspect before continuing'
 write(ROOT/f'evidence/update-publication-{bid}.json',dict(result='PASS',version=payload['version'],feed=BASE+'preview/latest.json',artifacts=payload['artifacts'],sources=sources['url']+'index.json',manifest_sha256=sha(release/'update-manifest.json'),p2p_feed_before=p2p_before,p2p_feed_after=p2p_after,scope='Live Cloudflare R2 readback, artifacts and corresponding source archives before signed latest pointer; P2P feed hash unchanged.'))
 print('Published and read back '+BASE+'preview/latest.json')
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['init-key','prepare','publish']);ap.add_argument('--node',type=pathlib.Path);ap.add_argument('--wrangler',type=pathlib.Path);args=ap.parse_args()
 if args.action=='init-key':init_key()
 elif args.action=='prepare':prepare()
 else:publish(args.node,args.wrangler)
