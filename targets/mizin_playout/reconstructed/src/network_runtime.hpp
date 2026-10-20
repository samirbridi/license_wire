#pragma once
#define NDILIB_CPP_DEFAULT_CONSTRUCTORS 0
#include "Processing.NDI.Lib.h"
#include "libomt.h"
#include <QLibrary>
#include <QString>
#include <memory>

struct NdiApi final {
    QLibrary library;
    QString path,versionText,error;
    bool ready=false;
#define NDI_FN(name) decltype(&NDIlib_##name) name=nullptr;
    NDI_FN(initialize) NDI_FN(destroy) NDI_FN(version)
    NDI_FN(send_create) NDI_FN(send_destroy) NDI_FN(send_send_video_v2) NDI_FN(send_send_audio_v2)
    NDI_FN(send_get_source_name) NDI_FN(send_get_no_connections)
    NDI_FN(recv_create_v3) NDI_FN(recv_destroy) NDI_FN(recv_capture_v2) NDI_FN(recv_free_video_v2) NDI_FN(recv_free_audio_v2)
    NDI_FN(find_create_v2) NDI_FN(find_destroy) NDI_FN(find_get_current_sources)
#undef NDI_FN
    NdiApi();
    ~NdiApi();
};
struct OmtApi final {
    QLibrary library,codec;
    QString path,error;
    bool ready=false;
#define OMT_FN(name) decltype(&omt_##name) name=nullptr;
    OMT_FN(send_create) OMT_FN(send_destroy) OMT_FN(send) OMT_FN(send_getaddress) OMT_FN(send_connections)
    OMT_FN(receive_create) OMT_FN(receive_destroy) OMT_FN(receive) OMT_FN(discovery_getaddresses)
    OMT_FN(setloggingfilename) OMT_FN(shutdown)
#undef OMT_FN
    OmtApi();
    ~OmtApi();
};
std::shared_ptr<NdiApi> ndiApi();
std::shared_ptr<OmtApi> omtApi();
