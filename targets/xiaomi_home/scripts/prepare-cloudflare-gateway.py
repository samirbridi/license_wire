"""Prepare the named private connection. Credentials and identifiers stay private."""
import json, os, secrets, tomllib, urllib.request, urllib.error
from pathlib import Path

target=Path(__file__).resolve().parents[1]
private=target/'evidence/private'
runtime=target/'runtime/central'
account=json.loads((private/'cloudflare-whoami-refreshed.json').read_text(encoding='utf-8-sig'))['accounts'][0]['id']
config=Path(os.environ['APPDATA'])/'xdg.config/.wrangler/config/default.toml'
token=tomllib.loads(config.read_text(encoding='utf-8-sig'))['oauth_token']
base=f'https://api.cloudflare.com/client/v4/accounts/{account}'
def api(path,method='GET',body=None):
    req=urllib.request.Request(base+path,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req,timeout=30) as response: result=json.load(response)
    except urllib.error.HTTPError as error:
        payload=json.load(error)
        raise SystemExit(json.dumps({'step':path.split('/')[1],'status':error.code,'errors':[{'code':x.get('code'),'message':x.get('message')} for x in payload.get('errors',[])]})) from None
    if not result.get('success'):raise SystemExit('Cloudflare refused the requested configuration.')
    return result['result']
def save(path,value):path.write_text(json.dumps(value,indent=2),encoding='utf-8')
tunnels=api('/cfd_tunnel?is_deleted=false')
tunnel=next((t for t in tunnels if t['name']=='homecams-private'),None)
if tunnel is None:tunnel=api('/cfd_tunnel','POST',{'name':'homecams-private','config_src':'cloudflare'})
save(private/'cloudflare-homecams-tunnel.json',tunnel)
api('/cfd_tunnel/'+tunnel['id']+'/configurations','PUT',{'config':{'ingress':[{'service':'http_status:404'}]}})
tunnel_token=api('/cfd_tunnel/'+tunnel['id']+'/token')
(private/'cloudflare-tunnel.token').write_text(tunnel_token,encoding='utf-8')
services=api('/connectivity/directory/services')
service=next((s for s in services if s['name']=='homecams-central'),None)
if service is None:service=api('/connectivity/directory/services','POST',{'name':'homecams-central','type':'http','http_port':19846,'host':{'ipv4':'127.0.0.1','network':{'tunnel_id':tunnel['id']}}})
save(private/'cloudflare-homecams-vpc.json',service)
gateway_path=runtime/'https-gateway.json'
if not gateway_path.exists():save(gateway_path,{'origin':'https://homecams.pages.dev','gatewayToken':secrets.token_urlsafe(32),'port':19846})
save(private/'cloudflare-gateway-secrets.json',{'GATEWAY_TOKEN':json.loads(gateway_path.read_text(encoding='utf-8-sig'))['gatewayToken']})
save(private/'wrangler-gateway.json',{'name':'homecams-gateway','main':str(target/'reconstructed/mizin-cameras/cloudflare/gateway.mjs'),'account_id':account,'compatibility_date':'2026-10-27','workers_dev':False,'preview_urls':False,'vpc_services':[{'binding':'CENTRAL','service_id':service['service_id']}]})
print(json.dumps({'tunnelPrepared':True,'vpcServicePrepared':True,'origin':'https://homecams.pages.dev'}))
