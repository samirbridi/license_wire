"""Assemble an immutable Windows x64 private preview from a successful build.

No version is chosen here. Packaging consumes the version reserved by build.ps1.
Only explicit runtime files are copied; developer state, fixtures and SDKs stay out.
"""
import argparse
import ctypes
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME_FILES = ('MizinPlayout.exe', 'MizinUpdater.exe', 'Processing.NDI.Lib.x64.dll', 'Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Widgets.dll',
    'Qt6Multimedia.dll', 'Qt6MultimediaWidgets.dll', 'Qt6Network.dll', 'Qt6OpenGL.dll',
    'Qt6OpenGLWidgets.dll', 'avcodec-61.dll', 'avformat-61.dll', 'avutil-59.dll',
    'swresample-5.dll', 'swscale-8.dll', 'D3Dcompiler_47.dll', 'icuuc.dll', 'libomt.dll', 'libvmx.dll')
PLUGIN_DIRS = ('generic', 'imageformats', 'multimedia', 'networkinformation', 'platforms', 'styles', 'tls')

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def nsis(value):
    # Fail rather than let path characters inject NSIS commands/variables.
    if any(c in str(value) for c in ('$', '"', '\n', '\r')):
        raise ValueError('Unsupported NSIS path characters: '+str(value))
    return str(value).replace('/', '\\')

def file_version(path):
    api=ctypes.windll.version
    api.GetFileVersionInfoSizeW.argtypes=[ctypes.c_wchar_p,ctypes.c_void_p]
    api.GetFileVersionInfoW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]
    api.VerQueryValueW.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_uint)]
    size=api.GetFileVersionInfoSizeW(str(path),None)
    if not size:raise ValueError('Missing Windows version resource: '+str(path))
    data=ctypes.create_string_buffer(size)
    if not api.GetFileVersionInfoW(str(path),0,size,data):raise ctypes.WinError()
    pointer=ctypes.c_void_p();length=ctypes.c_uint()
    if not api.VerQueryValueW(data,'\\',ctypes.byref(pointer),ctypes.byref(length)):raise ctypes.WinError()
    fixed=ctypes.cast(pointer,ctypes.POINTER(ctypes.c_uint32))
    return (fixed[2]>>16,fixed[2]&65535,fixed[3]>>16,fixed[3]&65535)

def stage(qt, redist, compiler):
    build = read(ROOT/'evidence/build-version.json')
    if build['build_status'] != 'PASS' or build['display'] != (ROOT/'VERSION').read_text().strip():
        raise ValueError('A successful automatically versioned build is required')
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)', build['display'])
    major, minor, patch, number = map(int, match.groups())
    if file_version(ROOT/'dist/MizinPlayout.exe')!=(major,minor,patch,number):
        raise ValueError('Executable version resource does not match reserved build')
    runtime_version=file_version(redist)
    slug = f'MizinPlayout-{major}.{minor}.{patch}-build{number:04d}-windows-x64-preview'
    release = ROOT/'releases'/slug
    release.mkdir(parents=True, exist_ok=False)
    payload = release/'payload'
    payload.mkdir()
    dist = ROOT/'dist'
    for name in RUNTIME_FILES:
        shutil.copy2(dist/name, payload/name)
    for name in PLUGIN_DIRS:
        source = dist/name
        files = list(source.glob('*.dll'))
        if not files:
            raise ValueError('Required plugin folder missing: '+name)
        (payload/name).mkdir()
        for file in files:
            shutil.copy2(file, payload/name/file.name)
    if not (payload/'platforms/qwindows.dll').exists() or not (payload/'multimedia/ffmpegmediaplugin.dll').exists():
        raise ValueError('Native Windows / FFmpeg plugins missing')
    (payload/'docs').mkdir()
    for name in ('quick-start.en.md','quick-start.pt-BR.md','THIRD_PARTY.md'):
        shutil.copy2(ROOT/'docs'/name, payload/'docs'/name)
    shutil.copy2(ROOT/'CHANGELOG.md', payload/'CHANGELOG.md')
    shutil.copy2(ROOT/'VERSION', payload/'VERSION')
    shutil.copy2(ROOT/'packaging/release-notes.json',payload/'release-notes.json')
    shutil.copy2(ROOT/'packaging/dependency-sources.json',payload/'dependency-sources.json')
    shutil.copy2(ROOT/'packaging/README-PREVIEW.txt', payload/'README.txt')
    shutil.copy2(ROOT/'packaging/Start portable.cmd', payload/'Start portable.cmd')
    licenses = payload/'licenses'
    shutil.copytree(ROOT/'packaging/notices', licenses)
    (licenses/'qt-sdk-sbom').mkdir()
    for file in (qt/'sbom').glob('*.spdx.json'):
        shutil.copy2(file, licenses/'qt-sdk-sbom'/file.name)
    (licenses/'omt').mkdir()
    shutil.copy2(ROOT/'reconstructed/third_party/omt/LICENSE.txt', licenses/'omt/LICENSE.txt')
    shutil.copytree(dist/'licenses/ndi',licenses/'ndi')
    shutil.copy2(compiler/'COPYING', licenses/'NSIS-COPYING.txt')
    (licenses/'ndi-headers').mkdir()
    # Header notices are MIT; the private NDI runtime has separate vendor terms below.
    shutil.copy2(ROOT/'reconstructed/third_party/ndi/Processing.NDI.Lib.h', licenses/'ndi-headers/Processing.NDI.Lib.h')
    (payload/'prerequisites').mkdir()
    shutil.copy2(redist, payload/'prerequisites/vc_redist.x64.exe')
    (payload/'source').mkdir()
    subprocess.run(['git', '-C', str(ROOT.parents[1]), 'archive', '--format=zip',
        '--output='+str(payload/'source/mizin-playout-source.zip'), build['source_commit'], '--',
        'targets/mizin_playout/reconstructed', 'targets/mizin_playout/scripts',
        'targets/mizin_playout/packaging'], check=True)
    # Exact FFmpeg build configuration is read from the deployed LGPL runtime.
    library = ctypes.CDLL(str((payload/'avutil-59.dll').resolve()), winmode=0x1100)
    ffmpeg = {}
    for key in ('avutil_configuration','avutil_license'):
        function = getattr(library, key)
        function.restype = ctypes.c_char_p
        ffmpeg[key] = function().decode()
    if '--enable-gpl' in ffmpeg['avutil_configuration'] or 'LGPL' not in ffmpeg['avutil_license']:
        raise ValueError('Unexpected FFmpeg runtime license/configuration')
    write(licenses/'ffmpeg-runtime.json', ffmpeg)
    write(payload/'build-info.json', dict(version=build['display'], source_commit=build['source_commit'],
        executable_sha256=sha(payload/'MizinPlayout.exe'), architecture='x64', channel='private-preview',
        public_release_ready=False, remaining=['Authenticode signed release', 'bit-identical dependency rebuild qualification',
            'clean Windows machine', 'physical display/audio/AV sync', 'ISSUE-001 NDI receiver timestamps'],
        ndi='Official SDK runtime is bundled privately beside the app, with vendor/third-party notices; no NDI Tools or system DLL replacement.',
        settings='Default per-user AppLocalDataLocation; --portable uses adjacent state/; --state-dir has precedence.'))
    files = sorted(p for p in payload.rglob('*') if p.is_file())
    inventory = [dict(path=p.relative_to(payload).as_posix(), bytes=p.stat().st_size, sha256=sha(p)) for p in files]
    write(payload/'package-manifest.json', dict(version=build['display'], files=inventory))
    files.append(payload/'package-manifest.json')
    directories = sorted({p.parent.relative_to(payload).as_posix() for p in files if p.parent != payload}, key=lambda p:p.count('/'), reverse=True)
    # Explicit uninstall list: unknown files, media and user profiles are retained.
    include = [f'!define APP_VERSION "{build["display"]}"', f'!define APP_NUMERIC "{major}.{minor}.{patch}.{number}"',
        f'!define PAYLOAD "{nsis(payload)}"', f'!define OUTPUT "{nsis(release/(slug+"-setup.exe"))}"',
        f'!define APP_ICON "{nsis(ROOT/"reconstructed/assets/mizin-playout.ico")}"',
        f'!define RUNTIME_MAJOR "{runtime_version[0]}"',f'!define RUNTIME_MINOR "{runtime_version[1]}"',f'!define RUNTIME_BUILD "{runtime_version[2]}"',
        '!macro InstallPayload']
    for file in sorted(files):
        rel=file.relative_to(payload)
        parent=nsis(rel.parent) if str(rel.parent) != '.' else ''
        include += [f'  SetOutPath "$INSTDIR\\{parent}"', f'  File "{nsis(file)}"']
    include += ['!macroend', '!macro UninstallPayload']
    for file in sorted(files):
        include.append(f'  Delete "$INSTDIR\\{nsis(file.relative_to(payload))}"')
    for directory in directories:
        include.append(f'  RMDir "$INSTDIR\\{nsis(directory)}"')
    include += ['!macroend']
    (release/'payload.nsh').write_text('\n'.join(include)+'\n',encoding='utf-8-sig')
    return release

def finish(release):
    payload=release/'payload'
    info=read(payload/'build-info.json')
    for entry in read(payload/'package-manifest.json')['files']:
        if sha(payload/entry['path']) != entry['sha256']:
            raise ValueError('Package changed after staging: '+entry['path'])
    setup=release/(release.name+'-setup.exe')
    if not setup.is_file():
        raise ValueError('NSIS did not produce the installer')
    archive=release/(release.name+'-portable.zip')
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=7) as bundle:
        for file in sorted(payload.rglob('*')):
            if file.is_file():
                bundle.write(file, release.name+'/'+file.relative_to(payload).as_posix())
    outputs=[dict(file=p.name,bytes=p.stat().st_size,sha256=sha(p)) for p in (setup,archive)]
    write(release/'artifacts.json',dict(**info,artifacts=outputs))
    (release/'SHA256SUMS.txt').write_text(''.join(f'{x["sha256"]}  {x["file"]}\n' for x in outputs),encoding='ascii')
    write(ROOT/'evidence/package-latest.json',dict(**info,artifacts=outputs,release=release.relative_to(ROOT).as_posix(),
        payload_files=len(read(payload/'package-manifest.json')['files'])+1))
    print(json.dumps(dict(version=info['version'],release=str(release),artifacts=outputs)))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['stage','finish'])
    parser.add_argument('--qt-root',type=pathlib.Path)
    parser.add_argument('--vc-redist',type=pathlib.Path)
    parser.add_argument('--nsis-root',type=pathlib.Path)
    parser.add_argument('--release',type=pathlib.Path)
    args=parser.parse_args()
    if args.action=='stage':
        print(stage(args.qt_root,args.vc_redist,args.nsis_root))
    else:
        finish(args.release.resolve())
