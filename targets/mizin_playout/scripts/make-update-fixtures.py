"""Signed test-only metadata. Never upload this directory or use its test version as a release."""
import copy,hashlib,json,pathlib
from updates import envelope,ROOT,write
directory=ROOT/'binaries/update-fixtures';directory.mkdir(parents=True,exist_ok=True)
payload=dict(schema=1,product='mizin-playout',channel='preview',platform='windows-x64',version='v999.0.0 (build 9999)',source_commit='QA_FIXTURE_NOT_A_RELEASE',notes={'en':['Fixture: a signed test release. No real update is announced.'],'pt-BR':['Exemplo de teste: versão assinada. Nenhuma atualização real é anunciada.']},artifacts={'setup':dict(file='releases/MizinPlayout-QA/MizinPlayout-QA-setup.exe',size=27,sha256=hashlib.sha256(b'mizin update fixture bytes\n').hexdigest())})
write(directory/'valid.json',envelope(payload))
for name,key,value in [('product','product','another-product'),('platform','platform','linux-x64'),('channel','channel','stable'),('version','version','not-a-version')]:
 modified=copy.deepcopy(payload);modified[key]=value;write(directory/(name+'.json'),envelope(modified))
for name,key,value in [('path','file','../MizinPlayout-QA-setup.exe'),('url','file','https://example.com/MizinPlayout-QA-setup.exe'),('size','size',999999999999),('hash','sha256','bad')]:
 modified=copy.deepcopy(payload);modified['artifacts']['setup'][key]=value;write(directory/(name+'.json'),envelope(modified))
modified=copy.deepcopy(payload);modified['notes']={'en':[],'pt-BR':['Fixture']};write(directory/'notes.json',envelope(modified))
print('Signed QA fixtures prepared; not release metadata.')
