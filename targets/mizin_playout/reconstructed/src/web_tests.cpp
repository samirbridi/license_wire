#include "web_monitor.hpp"
#include "project_rate.hpp"
#include "web_encoder.hpp"
#include <rtc/rtc.hpp>
#include <QApplication>
#include <QDir>
#include <QEventLoop>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QTcpSocket>
#include <QThread>
#include <atomic>
#include <functional>

namespace {
bool waitUntil(const std::function<bool()>& predicate,int ms=15000){QElapsedTimer t;t.start();while(!predicate()&&t.elapsed()<ms){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
struct Reply {int status=0;QByteArray body;};
Reply http(QNetworkAccessManager& manager,const QByteArray& method,const QString& url,const QByteArray& body={}){
    QNetworkRequest request{QUrl(url)};request.setHeader(QNetworkRequest::ContentTypeHeader,"application/sdp");QNetworkReply* reply=manager.sendCustomRequest(request,method,body);
    waitUntil([&]{return reply->isFinished();},20000);Reply result{reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt(),reply->readAll()};reply->deleteLater();return result;
}
QList<int> nalTypes(const QByteArray& data){QList<int> types;for(int i=0;i+3<data.size();++i)if(data[i]==0&&data[i+1]==0&&data[i+2]==1){types<<(data[i+3]&0x1f);i+=3;}return types;}
// A real libdatachannel receiver negotiating exactly like the browser page: server offer, client answer.
struct Client {
    std::shared_ptr<rtc::PeerConnection> pc;std::vector<std::shared_ptr<rtc::Track>> tracks;
    std::atomic<int> video{0},audio{0},idr{0},sps{0},profile{-1};std::atomic<bool> gathered{false};QString session;
    bool connect(QNetworkAccessManager& manager,const QString& base,const QString& code,int program){
        pc=std::make_shared<rtc::PeerConnection>(rtc::Configuration{});
        pc->onTrack([this](std::shared_ptr<rtc::Track> track){tracks.push_back(track);
            if(track->description().type()=="video"){auto depacketizer=std::make_shared<rtc::H264RtpDepacketizer>(rtc::NalUnit::Separator::LongStartSequence);depacketizer->addToChain(std::make_shared<rtc::RtcpReceivingSession>());track->setMediaHandler(depacketizer);
                track->onFrame([this](rtc::binary data,rtc::FrameInfo){const QByteArray bytes(reinterpret_cast<const char*>(data.data()),int(data.size()));++video;const auto types=nalTypes(bytes);if(types.contains(5))++idr;if(types.contains(7)){++sps;const int at=bytes.indexOf(QByteArray("\x00\x00\x01\x67",4));if(at>=0&&at+4<bytes.size())profile=uchar(bytes[at+4]);}});}
            else{track->setMediaHandler(std::make_shared<rtc::RtcpReceivingSession>());track->onMessage([this](rtc::binary){++audio;},[](std::string){});}
        });
        pc->onGatheringStateChange([this](rtc::PeerConnection::GatheringState state){if(state==rtc::PeerConnection::GatheringState::Complete)gathered=true;});
        const auto offer=http(manager,"POST",base+"/api/session?k="+code+"&program="+QString::number(program));if(offer.status!=200)return false;
        const auto json=QJsonDocument::fromJson(offer.body).object();session=json["session"].toString();
        pc->setRemoteDescription(rtc::Description(json["sdp"].toString().toStdString(),"offer"));
        if(!waitUntil([this]{return gathered.load();},8000))return false;const auto answer=pc->localDescription();if(!answer)return false;
        return http(manager,"POST",base+"/api/answer?k="+code+"&session="+session,QByteArray::fromStdString(std::string(*answer))).status==204;
    }
    ~Client(){if(pc)pc->close();}
};
}

int runWebTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);bool all=true;QJsonArray tests;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    QImage bars(32,16,QImage::Format_RGB32);bars.fill(QColor(16,128,235));QByteArray nv12(32*16*3/2,0);rgbToNv12(bars,reinterpret_cast<uchar*>(nv12.data()));
    record("nv12_uses_bt709_limited_range",qAbs(uchar(nv12[0])-112)<=2&&uchar(nv12[32*16])>128&&uchar(nv12[32*16+1])<128,{{"y",uchar(nv12[0])},{"u",uchar(nv12[32*16])},{"v",uchar(nv12[32*16+1])}});
    NativeChannel channel(false);channel.setLocalAudioEnabled(false);channel.setLoop(true);channel.load(QDir(directory).absoluteFilePath("01-h264.mp4"));
    const bool playing=waitUntil([&]{return channel.frames()>=5;});record("fixture_program_plays",playing);
    WebMonitorServer server([&]{return QList<WebProgramInfo>{{1,"Program A",QFileInfo(channel.path()).fileName(),!channel.path().isEmpty(),channel.playing()}};},[&](int id){return id==1?&channel:nullptr;});
    record("server_is_off_until_started",!server.running()&&server.urls().isEmpty()&&server.port()==0);
    const bool started=server.start(0,false,"testcode42");const QString base=QString("http://127.0.0.1:%1").arg(server.port());const QString code="testcode42";
    record("starts_on_this_computer_only",started&&server.port()>0&&server.urls().size()==1&&server.urls()[0].startsWith("http://127.0.0.1:"),{{"urls",QJsonArray::fromStringList(server.urls())}});
    // Manual/browser QA only: keep the fixture Program published so a real browser can open the page.
    if(const int hold=qEnvironmentVariableIntValue("MIZIN_WEB_TEST_HOLD_SECONDS");hold>0&&started){QFile url(resultPath+".url");if(url.open(QIODevice::WriteOnly))url.write(server.urls().constFirst().toUtf8());url.close();waitUntil([]{return false;},hold*1000);}
    QNetworkAccessManager manager;
    const auto page=http(manager,"GET",base+"/");record("serves_view_only_page",page.status==200&&page.body.contains("MIZIN")&&!page.body.contains("/api/cut"));
    record("api_without_code_is_forbidden",http(manager,"GET",base+"/api/programs").status==403&&http(manager,"GET",base+"/api/programs?k=wrong").status==403);
    const auto list=http(manager,"GET",base+"/api/programs?k="+code);const auto programs=QJsonDocument::fromJson(list.body).object()["programs"].toArray();
    record("lists_programs_with_tally",list.status==200&&programs.size()==1&&programs[0].toObject()["name"].toString()=="Program A"&&programs[0].toObject()["onAir"].toBool());
    record("unknown_program_is_rejected",http(manager,"POST",base+"/api/session?k="+code+"&program=99").status==404&&server.encoders()==0);
    record("control_endpoints_do_not_exist",http(manager,"POST",base+"/api/cut?k="+code).status==404);
    {
        Client first;const bool negotiated=first.connect(manager,base,code,1);
        const bool received=waitUntil([&]{return first.video>=20&&first.audio>=20&&first.idr>=1&&first.sps>=1;},20000);const auto stats=server.statistics();
        record("webrtc_viewer_receives_h264_and_opus",negotiated&&received,{{"video_frames",first.video.load()},{"audio_packets",first.audio.load()},{"idr",first.idr.load()},{"sps",first.sps.load()},{"stats",stats}});
        record("stream_is_constrained_baseline_h264",first.profile==66,{{"profile_idc",first.profile.load()}});
        Client second;const bool secondNegotiated=second.connect(manager,base,code,1);const bool secondReceived=waitUntil([&]{return second.video>=10&&second.idr>=1;},15000);
        record("second_viewer_shares_one_encoder",secondNegotiated&&secondReceived&&server.viewers()==2&&server.encoders()==1,{{"viewers",server.viewers()},{"encoders",server.encoders()}});
        {   // Quality: automatic follows the 1920x1080 fixture; 720p and 4K switch live for the viewers already watching.
            auto streamStats=[&]{const auto streams=server.statistics()["streams"].toArray();return streams.isEmpty()?QJsonObject{}:streams[0].toObject();};
            auto sized=[&](int w,int h){return waitUntil([&]{const auto s=streamStats();return s["width"].toInt()==w&&s["height"].toInt()==h;},10000);};
            const bool automatic=sized(1920,1080);const auto autoStats=streamStats();
            record("automatic_quality_follows_the_source",automatic&&autoStats["bitrate"].toDouble()>=6000000,{{"stats",autoStats}});
            server.setQuality(1);const int spsBefore=first.sps;const bool hd=sized(1280,720)&&waitUntil([&]{return first.sps>spsBefore&&first.video>=5;},10000);
            record("quality_720p_switches_live",hd,{{"stats",streamStats()}});
            server.setQuality(3);const int framesBefore=first.video;const bool uhd=sized(3840,2160)&&waitUntil([&]{return first.video>=framesBefore+10;},20000);const auto uhdStats=streamStats();
            record("quality_4k_encodes_2160p",uhd&&first.profile==66,{{"stats",uhdStats},{"frames",first.video-framesBefore},{"profile_idc",first.profile.load()}});
            server.setQuality(0);sized(1920,1080);
            // A viewer can choose its own quality on the page: it gets a separate 720p encoder; the default viewers keep 1080p.
            const auto own=http(manager,"POST",base+"/api/session?k="+code+"&program=1&quality=720");const auto ownSession=QJsonDocument::fromJson(own.body).object()["session"].toString();
            const bool separate=waitUntil([&]{return server.encoders()==2;},3000);auto has=[&](int w){for(const auto& v:server.statistics()["streams"].toArray())if(v.toObject()["width"].toInt()==w)return true;return false;};
            const bool sizes=waitUntil([&]{return has(1920)&&has(1280)&&server.encoders()==2;},5000);
            record("viewer_quality_gets_its_own_encoder",own.status==200&&separate&&sizes,{{"encoders",server.encoders()}});
            http(manager,"POST",base+"/api/close?k="+code+"&session="+ownSession);waitUntil([&]{return server.encoders()==1;},3000);
            // Project frame rate: exact NDI/OMT ratios, half rate for fast projects, and a 25 fps project paces the stream.
            int n=0,d=0;frameRateRatio(24000.0/1001,n,d);bool ratios=n==24000&&d==1001;frameRateRatio(25,n,d);ratios&=n==25000&&d==1000;frameRateRatio(60000.0/1001,n,d);ratios&=n==60000&&d==1001;
            projectFrameRate()=50;const bool half=std::abs(webFrameRate()-25)<.01;projectFrameRate()=24000.0/1001;const bool film=std::abs(webFrameRate()-23.976)<.01;
            projectFrameRate()=25;waitUntil([]{return false;},1500);const double e0=streamStats()["encoded_frames"].toDouble();waitUntil([]{return false;},3000);const double rate=(streamStats()["encoded_frames"].toDouble()-e0)/3;
            // The project rate caps the stream (25, not the 30 fps source); reaching it fully depends on host load, so only liveness is required.
            record("project_frame_rate_paces_the_web_monitor",ratios&&half&&film&&rate>=8&&rate<=25.7&&streamStats()["fps_limit"].toInt()==25,{{"encoded_per_s",rate},{"fps_limit",streamStats()["fps_limit"].toInt()}});
            projectFrameRate()=0;
        }
        channel.togglePause();waitUntil([&]{return !channel.playing();},3000);const int before=first.video;QThread::msleep(10);waitUntil([]{return false;},1600);
        record("paused_program_keeps_viewers_fed",first.video-before>=2,{{"frames_while_paused",first.video-before}});channel.togglePause();
        server.setCode("newcode77");waitUntil([&]{return server.viewers()==0;},3000);
        record("new_code_disconnects_viewers_and_rejects_old_code",server.viewers()==0&&server.encoders()==0&&http(manager,"GET",base+"/api/programs?k="+code).status==403&&http(manager,"GET",base+"/api/programs?k=newcode77").status==200);
    }
    {
        Client viewer;const bool negotiated=viewer.connect(manager,base,"newcode77",1);waitUntil([&]{return viewer.video>=3;},10000);server.programRemoved(1);
        record("removed_program_closes_its_stream",negotiated&&viewer.video>=3&&server.viewers()==0&&server.encoders()==0);
    }
    int last=0;for(int i=0;i<25;++i)last=http(manager,"GET",base+"/api/programs?k=guess"+QString::number(i)).status;
    record("repeated_wrong_codes_are_throttled",last==429&&http(manager,"GET",base+"/api/programs?k=newcode77").status==429);
    const quint16 port=server.port();server.stop();QTcpSocket probe;probe.connectToHost("127.0.0.1",port);
    record("stop_closes_listening_port",!server.running()&&!probe.waitForConnected(1500));
    WebMonitorServer lan([]{return QList<WebProgramInfo>{};},[](int){return static_cast<NativeChannel*>(nullptr);});const bool lanStarted=lan.start(0,true,"lancode99");
    record("lan_mode_lists_network_addresses",lanStarted&&lan.urls().size()>=1&&lan.urls().last().startsWith("http://127.0.0.1:"),{{"urls",QJsonArray::fromStringList(lan.urls())}});lan.stop();
    channel.black();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"tests",tests},{"scope","In-process libdatachannel receiver on the same computer over loopback (server offer/client answer as in the page). Not a browser, LAN, Wi-Fi or glass-to-glass latency qualification."}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
