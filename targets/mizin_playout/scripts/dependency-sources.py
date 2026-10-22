"""Preserve upstream LGPL sources/configuration alongside downloadable previews.

Archives are fetched from their official HTTPS origins, validated as readable tar
files without extraction and hashed. This is not a claim of bit-identical rebuilds.
"""
import concurrent.futures,hashlib,json,pathlib,tarfile,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/'binaries/dependency-sources'
QT='https://download.qt.io/archive/qt/6.10/6.10.2/submodules/'
URLS=[QT+'qtbase-everywhere-src-6.10.2.tar.xz',QT+'qtmultimedia-everywhere-src-6.10.2.tar.xz','https://ffmpeg.org/releases/ffmpeg-7.1.2.tar.xz']
def get(url):
 p=DEST/url.rsplit('/',1)[1]
 if not p.exists():
  with urllib.request.urlopen(url,timeout=120) as response,p.open('xb') as output:
   while block:=response.read(1024*1024):output.write(block)
 with tarfile.open(p) as archive:
  members=archive.getmembers();assert len(members)>100
 return dict(file=p.name,origin=url,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),members=len(members))
def main():
 DEST.mkdir(parents=True,exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:entries=list(pool.map(get,URLS))
 # Retain third-party notices from the matching source trees, not just SPDX
 # license identifiers. No archive member is extracted to an arbitrary path.
 for entry in entries:
  with tarfile.open(DEST/entry['file']) as archive:
   for member in archive.getmembers():
    path=pathlib.PurePosixPath(member.name);name=path.name.lower()
    if member.isfile() and (name.startswith(('license','copying','notice')) or name=='qt_attribution.json') and member.size<2*1024*1024:
     parts=path.parts[1:]
     if not parts or '..' in parts:continue
     target=ROOT/'packaging/notices/upstream'/entry['file'].removesuffix('.tar.xz')/pathlib.Path(*parts)
     target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile(member).read())
 manifest=dict(schema=1,url='https://playoutmizin.pages.dev/updates/sources/qt-6.10.2-ffmpeg-7.1.2/',archives=entries,scope='Unmodified official release sources matching deployed versions. Supplied SDK configuration and deployed FFmpeg configuration retained; bit-identical rebuild not qualified.')
 (ROOT/'packaging/dependency-sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 config=DEST/'build-configuration.zip'
 with zipfile.ZipFile(config,'w',zipfile.ZIP_DEFLATED) as bundle:
  def add(name,data):
   info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;bundle.writestr(info,data)
  sdk=ROOT/'binaries/qt/6.10.2/msvc2022_64'
  for name in ('qtbase','qtmultimedia'):
   for extension in ('opt','summary'):add(f'config_{name}.{extension}',(sdk/f'config_{name}.{extension}').read_bytes())
  for name in ('qtbase-6.10.2.source.spdx','qtmultimedia-6.10.2.source.spdx'):add(name,(sdk/'sbom'/name).read_bytes())
  add('README.txt','Qt: use MSVC x64, CMake and Ninja, run configure with config_qtbase.opt; build/install qtbase, then configure qtmultimedia against it using its recorded options and FFmpeg. FFmpeg: use the exact avutil_configuration string in the packaged licenses/ffmpeg-runtime.json, MSVC toolchain, shared libraries and matching ABI majors. Configuration paths refer to the upstream Qt build farm and must be adapted locally. App: source ZIP includes CMakeLists.txt, native source, public update trust key and build scripts; point Qt6_DIR at your compatible modified Qt installation. Dynamic libraries may be replaced/relinked and debugged. No matching binary rebuild or physical-device qualification is asserted.\n')
 manifest['configuration']=dict(file=config.name,bytes=config.stat().st_size,sha256=hashlib.sha256(config.read_bytes()).hexdigest())
 (ROOT/'packaging/dependency-sources.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(manifest))
if __name__=='__main__':main()
