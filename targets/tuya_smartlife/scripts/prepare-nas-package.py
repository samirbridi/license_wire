"""Owner-private NAS bundle: complete portal + explicitly verified Xiaomi bridge."""
import hashlib,json,shutil,sys,zipfile
from pathlib import Path
from urllib.parse import urlparse,parse_qsl,urlencode,urlunparse

target=Path(__file__).resolve().parents[1];workspace=target.parents[1];xiaomi=workspace/'targets/xiaomi_home'
sys.path.insert(0,str(xiaomi/'runtime/package-python'))
import yaml
release=json.loads((target/'release-state.json').read_text(encoding='utf-8-sig'))
bridge_release=json.loads((xiaomi/'release-state.json').read_text(encoding='utf-8-sig'))
if release['status']!='built' or bridge_release['status']!='built':raise SystemExit('Automatic builds must complete first')
receipt=json.loads((xiaomi/f"evidence/builds/{bridge_release['runId']}-bridge.json").read_text(encoding='utf-8-sig'))
binary=xiaomi/bridge_release['artifact']/'bridge/go2rtc-linux-amd64'
expected=next(x['sha256'] for x in receipt['files'] if x['platform']=='linux')
if not receipt['pass'] or hashlib.sha256(binary.read_bytes()).hexdigest()!=expected:raise SystemExit('Bridge integrity check failed')
root=target/f"evidence/private/nas-portal-build-{release['build']:04d}"
root.mkdir();app=root/'app';destination=app/'workspace';portal=destination/'targets/tuya_smartlife/reconstructed/mizin-portal'
shutil.copytree(target/release['artifact'],portal,ignore=shutil.ignore_patterns('diagnostics'))
shutil.copyfile(portal/'deploy/Dockerfile',app/'Dockerfile');shutil.copyfile(portal/'deploy/compose.yaml',root/'compose.yaml')
shutil.copyfile(target/'VERSION',destination/'targets/tuya_smartlife/VERSION')
scripts=destination/'targets/tuya_smartlife/scripts';scripts.mkdir(parents=True)
for p in (target/'scripts').glob('*.py'):shutil.copyfile(p,scripts/p.name)
shutil.copytree(xiaomi/bridge_release['artifact'],destination/'targets/xiaomi_home/reconstructed/mizin-cameras',ignore=shutil.ignore_patterns('bridge','diagnostics'))
bridge=root/'bridge';bridge.mkdir();shutil.copyfile(binary,bridge/binary.name)
metadata=json.loads((xiaomi/'runtime/qr-login/process.json').read_text(encoding='utf-8-sig'))
original=yaml.safe_load(Path(metadata['config']).read_text(encoding='utf-8-sig'))
entries=json.loads((xiaomi/'runtime/central/bridge-streams.json').read_text(encoding='utf-8-sig'))
cameras=json.loads((xiaomi/'runtime/central/cameras.json').read_text(encoding='utf-8-sig'))
sources={x['alias']:x['source'] for x in entries};aliases=[]
for camera in cameras:
 for view in camera.get('views') or [{'sourceAlias':camera['sourceAlias']}]:
  base=view['sourceAlias'];u=urlparse(sources[base]);params=dict(parse_qsl(u.query));quality='4' if params['model']=='isa.camera.hlc7' else '3'
  alias=base+'_quality'+quality;params['subtype']=quality;params['minwidth']='2880' if params['model']=='xiaomi.camera.cw701' else '2304';sources[alias]=urlunparse(u._replace(query=urlencode(params)));aliases.append(alias)
data=root/'data';bridge_data=data/'bridge';bridge_data.mkdir(parents=True)
configuration={'api':{'listen':'127.0.0.1:19843'},'rtsp':{'listen':''},'webrtc':{'listen':'127.0.0.1:19844','ice_servers':[]},'xiaomi':original['xiaomi'],'streams':{k:[v] for k,v in sources.items()}}
(bridge_data/'bridge.yaml').write_text(yaml.safe_dump(configuration,allow_unicode=True),encoding='utf-8')
runtime=data/'xiaomi/runtime/central';runtime.mkdir(parents=True)
for name in ['cameras.json','https-gateway.json']:shutil.copyfile(xiaomi/'runtime/central'/name,runtime/name)
(runtime/'media-config.json').write_text(json.dumps({'encoder':'libx264'}),encoding='utf-8')
(runtime/'bridge-streams.json').write_text(json.dumps([{'alias':k,'source':v} for k,v in sources.items()]),encoding='utf-8')
(data/'archive-aliases.json').write_text(json.dumps(aliases),encoding='utf-8')
tuya_data=data/'tuya';tuya_data.mkdir()
for name in ['devices_registry.json','tuya_token.json','tuya_cloud_devices.json','scenes.json','schedules.json','automations.json','tariff_config.json','ui_config.json','energy_history.json','activity_logs.json']:
 source=target/'runtime'/name
 if source.exists():shutil.copyfile(source,tuya_data/name)
shutil.copyfile(xiaomi/'evidence/private/cloudflare-tunnel.token',data/'tunnel.token')
(root/'LEIA-ME.txt').write_text('PACOTE PRIVADO: sessoes Xiaomi, chaves locais Tuya e credencial de tunel. Nao publicar.\nPlataforma completa preservada; automacoes de dispositivos suspensas durante o piloto.\nGravacoes: /volume4/HDD 1TB - V2/Mizin-Cameras. Nenhuma gravacao e apagada automaticamente.\nTeste inicial: 10 segundos por visao, com audio e video; se todos passarem, inicia segmentos de 5 minutos ate 100 GiB ou 2 GiB livres.\nPodem ocorrer intervalos ao reconectar fluxos entre segmentos; estabilidade 24h ainda precisa de medicao.\nO tunel remoto esta desativado por perfil ate a troca controlada do conector Windows.\nConvite remoto: data/xiaomi/runtime/central/owner-remote-access.json, renovado a cada 8 minutos.\n',encoding='utf-8')
archive=root.with_suffix('.zip')
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=5) as z:
 for p in root.rglob('*'):
  if p.is_file():
   info=zipfile.ZipInfo(str(Path(root.name)/p.relative_to(root)).replace('\\','/'));info.external_attr=(0o100700 if p.name=='go2rtc-linux-amd64' else 0o100600)<<16
   z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED)
manifest={'version':release['version'],'sourceCommit':release['sourceCommit'],'bridgeVersion':bridge_release['version'],'bridgeSha256':expected,'private':True,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archiveBytes':archive.stat().st_size,'cameras':6,'views':len(aliases),'nasTested':False,'fullPortalIncluded':True,'archivePath':'/volume4/HDD 1TB - V2/Mizin-Cameras'}
(root/'package-receipt.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'version':release['version'],'privateArchive':str(archive),'bytes':archive.stat().st_size,'views':len(aliases)}))
