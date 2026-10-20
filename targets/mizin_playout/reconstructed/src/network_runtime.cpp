#include "network_runtime.hpp"
#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>

NdiApi::NdiApi(){
    const QString app=QCoreApplication::applicationDirPath();QStringList candidates;
    if(!qEnvironmentVariable("MIZIN_NDI_RUNTIME").isEmpty())candidates<<qEnvironmentVariable("MIZIN_NDI_RUNTIME");
#ifdef Q_OS_WIN
    candidates<<app+"/Processing.NDI.Lib.x64.dll";
    for(const auto* key:{"NDI_RUNTIME_DIR_V6","NDI_RUNTIME_DIR_V5"})if(!qEnvironmentVariable(key).isEmpty())candidates<<QDir(qEnvironmentVariable(key)).filePath("Processing.NDI.Lib.x64.dll");
    const auto pf=qEnvironmentVariable("ProgramFiles","C:/Program Files");
    candidates<<pf+"/NDI/NDI 6 Runtime/v6/Processing.NDI.Lib.x64.dll"<<pf+"/NDI/NDI 6 Tools/Runtime/Processing.NDI.Lib.x64.dll"<<pf+"/NDI/NDI 6 SDK/Bin/x64/Processing.NDI.Lib.x64.dll";
#elif defined(Q_OS_MACOS)
    candidates<<app+"/libndi.dylib"<<"/usr/local/lib/libndi.dylib";
#else
    candidates<<app+"/libndi.so.6"<<"/usr/local/lib/libndi.so.6";
#endif
    for(const auto& file:candidates){if(!QFileInfo::exists(file))continue;library.setFileName(file);if(library.load()){path=QFileInfo(file).absoluteFilePath();break;}}
    if(path.isEmpty()){error="NDI runtime not found. Install the official NDI Runtime.";return;}
#define LOAD(name) name=reinterpret_cast<decltype(name)>(library.resolve("NDIlib_" #name));if(!name){error="NDI runtime API is incomplete";return;}
    LOAD(initialize) LOAD(destroy) LOAD(version) LOAD(send_create) LOAD(send_destroy) LOAD(send_send_video_v2) LOAD(send_send_audio_v2) LOAD(send_get_source_name) LOAD(send_get_no_connections)
    LOAD(recv_create_v3) LOAD(recv_destroy) LOAD(recv_capture_v2) LOAD(recv_free_video_v2) LOAD(recv_free_audio_v2) LOAD(find_create_v2) LOAD(find_destroy) LOAD(find_get_current_sources)
#undef LOAD
    if(!initialize()){error="NDI initialization failed";return;}ready=true;versionText=QString::fromUtf8(version());
}
NdiApi::~NdiApi(){if(ready)destroy();}
OmtApi::OmtApi(){
    const auto app=QCoreApplication::applicationDirPath();
    if(qEnvironmentVariable("OMT_STORAGE_PATH").isEmpty()){const auto state=app+"/state/omt";QDir().mkpath(state);qputenv("OMT_STORAGE_PATH",state.toUtf8());}
#ifdef Q_OS_WIN
    const QString file=qEnvironmentVariable("MIZIN_OMT_RUNTIME",app+"/libomt.dll");codec.setFileName(QFileInfo(file).absolutePath()+"/libvmx.dll");codec.load();
#elif defined(Q_OS_MACOS)
    const QString file=qEnvironmentVariable("MIZIN_OMT_RUNTIME",app+"/libomt.dylib");
#else
    const QString file=qEnvironmentVariable("MIZIN_OMT_RUNTIME",app+"/libomt.so");
#endif
    library.setFileName(file);if(!library.load()){error="OMT runtime not found. Install the OMT libraries.";return;}path=QFileInfo(file).absoluteFilePath();
#define LOAD(name) name=reinterpret_cast<decltype(name)>(library.resolve("omt_" #name));if(!name){error="OMT runtime API is incomplete";return;}
    LOAD(send_create) LOAD(send_destroy) LOAD(send) LOAD(send_getaddress) LOAD(send_connections) LOAD(receive_create) LOAD(receive_destroy) LOAD(receive) LOAD(discovery_getaddresses) LOAD(setloggingfilename) LOAD(shutdown)
#undef LOAD
    setloggingfilename(nullptr);ready=true;
}
OmtApi::~OmtApi(){if(ready)shutdown();}
std::shared_ptr<NdiApi> ndiApi(){static auto api=std::make_shared<NdiApi>();return api;}
std::shared_ptr<OmtApi> omtApi(){static auto api=std::make_shared<OmtApi>();return api;}
