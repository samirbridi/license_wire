"""Create an owner-private deployment archive. Never upload this to public hosting."""
import hashlib,json,shutil,sys,zipfile
from pathlib import Path
target=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(target/'runtime/package-python'))
import yaml
release=json.loads((target/'release-state.json').read_text(encoding='utf-8-sig'))
if release['status']!='built':raise SystemExit('A completed automatic build is required')
artifact=target/release['artifact'];receipt=json.loads((target/f"evidence/builds/{release['runId']}-bridge.json").read_text(encoding='utf-8-sig'))
binary=artifact/'bridge/go2rtc-linux-amd64'
expected=next(x['sha256'] for x in receipt['files'] if x['platform']=='linux')
if not receipt['pass'] or hashlib.sha256(binary.read_bytes()).hexdigest()!=expected:raise SystemExit('Bridge integrity check failed')
root=target/f"evidence/private/nas-build-{release['build']:04d}"
if root.exists():raise SystemExit('Package directory already exists; preserve previous attempt')
root.mkdir();shutil.copytree(artifact,root/'app',ignore=shutil.ignore_patterns('bridge','diagnostics'))
shutil.copytree(artifact/'bridge',root/'bridge',ignore=shutil.ignore_patterns('*.exe'))
shutil.copyfile(artifact/'deploy/compose.yaml',root/'compose.yaml')
metadata=json.loads((target/'runtime/qr-login/process.json').read_text(encoding='utf-8-sig'))
config=yaml.safe_load(Path(metadata['config']).read_text(encoding='utf-8-sig'))
entries=json.loads((target/'runtime/central/bridge-streams.json').read_text(encoding='utf-8-sig'))
if not config.get('xiaomi') or not all(x['source'].startswith('xiaomi://') for x in entries):raise SystemExit('Unexpected bridge configuration')
data=root/'data';bridge=data/'bridge';bridge.mkdir(parents=True)
configuration={'api':{'listen':'127.0.0.1:19843'},'rtsp':{'listen':''},'webrtc':{'listen':'127.0.0.1:19844','ice_servers':[]},'xiaomi':config['xiaomi'],'streams':{x['alias']:[x['source']] for x in entries}}
(bridge/'bridge.yaml').write_text(yaml.safe_dump(configuration,allow_unicode=True),encoding='utf-8')
private=data/'central/evidence/private';private.mkdir(parents=True)
shutil.copyfile(target/'evidence/private/camera-sources-cn.json',private/'camera-sources-cn.json')
runtime=data/'central/runtime/central';runtime.mkdir(parents=True)
for name in ['cameras.json','https-gateway.json','sd-enabled.json']:shutil.copyfile(target/'runtime/central'/name,runtime/name)
(runtime/'media-config.json').write_text(json.dumps({'encoder':'libx264'}),encoding='utf-8')
shutil.copyfile(target/'evidence/private/cloudflare-tunnel.token',data/'tunnel.token')
(root/'LEIA-ME.txt').write_text('Pacote privado de instalacao no NAS. Contem sessoes Xiaomi e segredo do tunel. Nao publicar.\nExtrair numa pasta nova exclusiva em /volume1/docker/homecams.\nAntes de iniciar o servico tunnel no NAS, encerrar somente o tunel homecams do Windows.\nCriar projeto Container Manager usando compose.yaml. Nao alterar outras pastas.\nA central gera convite de dez minutos em data/central/runtime/central/owner-remote-access.json.\nO teste final precisa confirmar video, SD e reinicio com Windows desligado.\n',encoding='utf-8')
archive=root.with_suffix('.zip')
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=5) as z:
 for p in root.rglob('*'):
  if p.is_file():
   info=zipfile.ZipInfo(str(Path(root.name)/p.relative_to(root)).replace('\\','/'))
   info.external_attr=(0o100700 if p.name=='go2rtc-linux-amd64' else 0o100600)<<16
   z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED)
manifest={'version':release['version'],'sourceCommit':release['sourceCommit'],'private':True,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archiveBytes':archive.stat().st_size,'cameras':6,'windowsSessionsCopied':False,'nasTested':False}
(root/'package-receipt.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'version':release['version'],'privateArchive':str(archive),'bytes':archive.stat().st_size}))
