"""Recapture the site's screenshots (EN and PT-BR) from the built app in layout-preview mode, so the
site always shows the current interface. Run after scripts/build.ps1 (uses dist/MizinPlayout.exe)."""
import pathlib,subprocess,tempfile,shutil
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];EXE=ROOT/'dist/MizinPlayout.exe';OUT=ROOT/'site/assets/shots'
# (capture arguments, file the app writes, site name per language)
SHOTS=[(['--capture-page','0'],{'en':'01-main-en.png','pt-BR':'04-main-pt-BR.png'},{'en':'01-main-en','pt-BR':'04-main-pt-BR'}),
       (['--capture-page','3'],{'en':'02-outputs-en.png','pt-BR':'02-outputs-en.png'},{'en':'02-outputs-en','pt-BR':'03-outputs-pt-BR'}),
       (['--capture-page','1'],{'en':'05-edit-en.png','pt-BR':'06-edit-pt-BR.png'},{'en':'05-edit-en','pt-BR':'06-edit-pt-BR'}),
       (['--capture-page','4'],{'en':'07-audio-en.png','pt-BR':'08-audio-pt-BR.png'},{'en':'07-audio-en','pt-BR':'08-audio-pt-BR'}),
       (['--capture-digital'],{'en':'09-network-en.png','pt-BR':'10-network-pt-BR.png'},{'en':'09-network-en','pt-BR':'10-network-pt-BR'}),
       (['--capture-link'],{'en':'13-link-en.png','pt-BR':'14-link-pt-BR.png'},{'en':'13-link-en','pt-BR':'14-link-pt-BR'})]
work=pathlib.Path(tempfile.mkdtemp(prefix='mizin-site-shots-'))
try:
    for args,written,names in SHOTS:
        for lang in ('en','pt-BR'):
            folder=work/(names[lang]);folder.mkdir()
            subprocess.run([str(EXE),'--board','--board-programs','3','--capture-dir',str(folder),'--lang',lang,'--state-dir',str(work/'state'),*args],check=True,timeout=120)
            Image.open(folder/written[lang]).convert('RGB').save(OUT/(names[lang]+'.webp'),'WEBP',quality=82)
            print(OUT/(names[lang]+'.webp'))
finally:shutil.rmtree(work,ignore_errors=True)
