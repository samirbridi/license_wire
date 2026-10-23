#include "channel.hpp"
#include <algorithm>
#include "compositor.hpp"
#include <QFileInfo>
#include <QUrl>
#include <QMediaDevices>
#include <QAudioBuffer>
#include <QMediaMetaData>
#include <cmath>

NativeChannel::NativeChannel(bool preview, QObject* parent) : QObject(parent), preview_(preview) {
    clock_.start();
    timeout_.setSingleShot(true);
    connect(&timeout_,&QTimer::timeout,this,[this]{reject(incoming_,"Media preparation timed out");});
    boundary_.setInterval(10); boundary_.setTimerType(Qt::PreciseTimer);
    connect(&boundary_,&QTimer::timeout,this,[this]{
        if (!ended_ && !path().isEmpty() && playing() && rangeEnd()>0 && position()>=rangeEnd()) finishRange();
    }); boundary_.start();
    for (int i=0;i<2;++i) {
        auto& d=decks_[i];
        d.player=new QMediaPlayer(this); d.audio=new QAudioOutput(this); d.sink=new QVideoSink(this);
        d.player->setAudioOutput(d.audio); d.player->setVideoSink(d.sink); d.audio->setMuted(true);
        if(!preview_){QAudioFormat f;f.setSampleRate(48000);f.setChannelCount(2);f.setSampleFormat(QAudioFormat::Float);d.tap=new QAudioBufferOutput(f,this);d.player->setAudioBufferOutput(d.tap);connect(d.tap,&QAudioBufferOutput::audioBufferReceived,this,[this,i](const QAudioBuffer& b){receiveAudio(i,b);});}
        connect(d.sink,&QVideoSink::videoFrameChanged,this,[this,i](const QVideoFrame& frame){
            if (!frame.isValid() || decks_[i].cue.path.isEmpty() || decks_[i].player->source().isEmpty()) return;
            ++receivedFrames_;
            auto& deck=decks_[i];
            const qint64 timestamp=frame.startTime()<0 ? deck.player->position() : frame.startTime()/1000;
            if (pending_ && i==incoming_ && (!deck.sourceLoaded || !deck.seekSet || timestamp+2<deck.cue.in)) {++prerollFiltered_;return;}
            if (i==active_ && timestamp+2<deck.cue.in) return;
            if (i==active_ && deck.cue.end(deck.player->duration())>0 && timestamp>=deck.cue.end(deck.player->duration())) {
                finishRange(); return;
            }
            if (i==active_ && ended_) return;
            deck.last=frame; ++deck.frames;
            if (pending_ && i==incoming_) { acceptPrepared(); return; }
            if (i==active_) renderActive();
        });
        connect(d.player,&QMediaPlayer::mediaStatusChanged,this,[this,i](QMediaPlayer::MediaStatus status){
            if (status==QMediaPlayer::InvalidMedia) reject(i,decks_[i].player->errorString());
            if (status==QMediaPlayer::LoadedMedia || status==QMediaPlayer::BufferedMedia) {decks_[i].sourceLoaded=true;setupSeek(i);}
            if (pending_ && i==incoming_ && status==QMediaPlayer::BufferedMedia && !decks_[i].player->hasVideo()) acceptPrepared();
            if (i==active_ && status==QMediaPlayer::EndOfMedia) finishRange();
            emit changed();
        });
        connect(d.player,&QMediaPlayer::errorOccurred,this,[this,i](QMediaPlayer::Error,const QString& text){reject(i,text);});
        connect(d.player,&QMediaPlayer::positionChanged,this,[this,i]{
            if (i==active_) { if (!decks_[i].player->hasVideo()) renderActive(); emit changed(); }
        });
        connect(d.player,&QMediaPlayer::durationChanged,this,[this,i]{setupSeek(i);emit changed();});
        connect(d.player,&QMediaPlayer::seekableChanged,this,[this,i]{setupSeek(i);});
        connect(d.player,&QMediaPlayer::playbackStateChanged,this,[this]{emit changed();});
    }
    auto* devices=new QMediaDevices(this);connect(devices,&QMediaDevices::audioOutputsChanged,this,[this]{setAudioDevice(deviceId_);});
    setAudioDevice({});
    if(!preview_){audioTimer_.setInterval(10);audioTimer_.setTimerType(Qt::PreciseTimer);connect(&audioTimer_,&QTimer::timeout,this,&NativeChannel::pumpAudio);audioTimer_.start();}
}
void NativeChannel::setupSeek(int i) {
    if (!pending_ || i!=incoming_ || decks_[i].seekSet || !decks_[i].sourceLoaded) return;
    auto& d=decks_[i];
    if (d.player->duration()<=0) return;
    if (const auto error=d.cue.error(d.player->duration()); !error.isEmpty()) {reject(i,error);return;}
    // Duration can arrive before the backend announces seekability. Do not reject
    // a valid local file during that transient metadata state.
    if (d.cue.in>0 && !d.player->isSeekable()) return;
    d.seekSet=true; d.player->setPosition(d.cue.in);
}
void NativeChannel::beginPrepare(const Cue& cue, bool autoTake, bool play) {
    cancelPrepared();++requestGeneration_;preparationPath_=cue.path;preparationError_.clear();lastError_.clear();preparationMs_=0;preparationClock_.start();preparationState_="preparing";
    if (const auto error=cue.error(); !error.isEmpty()) {preparationFailed(error);return;}
    if (!QFileInfo(cue.path).isFile()) {preparationFailed("File not found: "+cue.path);return;}
    stopOutgoing();
    incoming_=1-active_; auto& d=decks_[incoming_];
    d.audio->setMuted(true); d.player->stop(); d.player->setSource({});
    d.frames=0; d.last={}; d.cue=cue; d.seekSet=false;d.sourceLoaded=false;
    audioMix_.clear(incoming_);
    pending_=true; autoTake_=autoTake; playIncoming_=play;
    timeout_.start(15000); d.player->setSource(QUrl::fromLocalFile(cue.path));
    d.player->setLoops(QMediaPlayer::Once); d.player->play(); emit changed();
}
void NativeChannel::loadCue(const Cue& cue, bool play) {beginPrepare(cue,true,play);}
void NativeChannel::prepareCue(const Cue& cue) {beginPrepare(cue,false,true);}
void NativeChannel::setPlaybackRate(double rate){rate=std::clamp(rate,0.5,1.5);if(std::abs(rate-rate_)<0.0005)return;rate_=rate;decks_[active_].player->setPlaybackRate(rate);}
void NativeChannel::cancelPrepared() {
    if (pending_ || ready_) {pending_=ready_=false;preparationState_="cancelled";timeout_.stop();decks_[incoming_].audio->setMuted(true);decks_[incoming_].player->stop();}
}
void NativeChannel::acceptPrepared() {
    if (!pending_ || !decks_[incoming_].seekSet) return;
    pending_=false;ready_=true;preparationState_="ready";preparationMs_=preparationClock_.elapsed();timeout_.stop();decks_[incoming_].player->pause();
    const bool take=autoTake_; emit preparedReady(); if (take && ready_) takePrepared();
}
void NativeChannel::takePrepared() {
    if (!ready_) return;
    const int previous=active_; const bool hadProgram=!path().isEmpty() && output_.isValid();
    active_=incoming_; incoming_=previous;activeGeneration_=requestGeneration_;ready_=false;ended_=false;pausedAtUs_=-1;
    rate_=1.0;decks_[active_].player->setPlaybackRate(1.0);
    const auto c=cue(); const qint64 length=rangeEnd()-c.in;
    blendMs_=preview_?0:qMin<qint64>(hadProgram && c.transition!=Transition::Cut ? c.transitionMs : c.enterMs,qMax<qint64>(0,length/2));
    blendType_=hadProgram && c.transition!=Transition::Cut ? c.transition : Transition::Dissolve;
    if (hadProgram && blendMs_>0 && c.transition!=Transition::Cut) outgoing_=previous;
    else {decks_[previous].audio->setMuted(true);decks_[previous].player->stop();{const auto ringGuard=audioMix_.guard();audioMix_.envelope[previous].cutoffUs=programTimeUs();}outgoing_=-1;}
    auto& d=decks_[active_];d.audio->setVolume(blendMs_>0?0:1);d.audio->setMuted(true);
    syncAudioTimeline(active_,c.in*1000);
    if(outgoing_>=0){const auto ringGuard=audioMix_.guard();auto& old=audioMix_.envelope[outgoing_];old.fadeOutStartUs=programTimeUs();old.fadeOutUs=blendMs_*1000/(blendType_==Transition::FadeBlack?2:1);}
    if (playIncoming_) d.player->play();
    renderActive();emit started();emit changed();
}
void NativeChannel::stopOutgoing() {
    if (outgoing_>=0) {decks_[outgoing_].audio->setMuted(true);decks_[outgoing_].player->stop();outgoing_=-1;}
}
void NativeChannel::renderActive() {
    auto& d=decks_[active_];
    const qint64 timestamp=d.last.isValid() && d.last.startTime()>=0 ? d.last.startTime()/1000 : position();
    const qint64 elapsed=qMax<qint64>(0,timestamp-d.cue.in);
    const double p=blendMs_>0?qBound(0.0,double(elapsed)/double(blendMs_),1.0):1.0;
    const qint64 exitMs=preview_?0:qMin<qint64>(d.cue.exitMs,qMax<qint64>(0,(rangeEnd()-d.cue.in)/2));
    const double exitGain=exitMs>0 && !ready_ ? qBound(0.0,double(rangeEnd()-timestamp)/double(exitMs),1.0):1.0;
    const double incomingGain=(blendType_==Transition::FadeBlack?qMax(0.0,2*p-1):p)*exitGain;
    d.gain=float(incomingGain);
    if (outgoing_>=0) decks_[outgoing_].gain=float(blendType_==Transition::FadeBlack?qMax(0.0,1-2*p):1-p);
    {const auto ringGuard=audioMix_.guard();auto& envelope=audioMix_.envelope[active_];const qint64 endUs=d.offsetUs+rangeEnd()*1000;
    envelope.cutoffUs=endUs;envelope.fadeOutUs=ready_?0:exitMs*1000;envelope.fadeOutStartUs=exitMs>0 && !ready_?endUs-exitMs*1000:-1;}
    applyLocalAudio();
    QVideoFrame frame=d.last;
    if (frame.isValid() && (p<1 || exitGain<1)) {
        QElapsedTimer composition;composition.start();
        const QImage old=outgoing_>=0?decks_[outgoing_].last.toImage():QImage{};
        QImage image=composeImages(old,frame.toImage(),p,blendType_);
        if (exitGain<1) image=composeImages({},image,exitGain,Transition::Dissolve);
        if (image.isNull()) {reject(active_,"Transition frame conversion failed");return;}
        frame=QVideoFrame(image);frame.setStartTime(d.last.startTime());frame.setEndTime(d.last.endTime());++composedFrames_;
        compositionLastMs_=double(composition.nsecsElapsed())/1000000.0;compositionPeakMs_=qMax(compositionPeakMs_,compositionLastMs_);compositionTotalMs_+=compositionLastMs_;++compositionSamples_;
    }
    if (p>=1) stopOutgoing();
    output_=frame;if(frame.isValid()){++publishedFrames_;
        // ADR-018: how late frames are published relative to the audio mix timeline (decode/render pipeline).
        if(frame.startTime()>=0&&playing()){const qint64 lag=std::clamp<qint64>(programTimeUs()-(decks_[active_].offsetUs+frame.startTime()),0,500000);const qint64 old=videoLagUs_.load();videoLagUs_=old<0?lag:(old*15+lag)/16;}
       const auto now=clock_.elapsed();publishedTimes_.push_back(now);while(!publishedTimes_.empty()&&(publishedTimes_.front()<now-1000||publishedTimes_.size()>512))publishedTimes_.pop_front();}emit frameReady(output_);
}
void NativeChannel::finishRange() {
    if (ended_ || path().isEmpty()) return;
    ended_=true;decks_[active_].player->pause();decks_[active_].audio->setMuted(true);stopOutgoing();
    if (!preview_ && cue().exitMs>0 && !ready_) {output_={};emit frameReady(output_);}
    if (loop_) {
        ended_=false;decks_[active_].player->setPosition(cue().in);decks_[active_].audio->setMuted(true);decks_[active_].player->play();
        syncAudioTimeline(active_,cue().in*1000);decks_[active_].realign=true;decks_[active_].realignTargetUs=cue().in*1000;applyLocalAudio();
    } else emit rangeEnded();
    emit changed();
}
void NativeChannel::reject(int index,const QString& message) {
    lastError_=message;
    if ((pending_ || ready_) && index==incoming_) {cancelPrepared();preparationState_="error";preparationError_=message;preparationMs_=preparationClock_.isValid()?preparationClock_.elapsed():0;}
    emit failed(message);emit changed();
}
void NativeChannel::preparationFailed(const QString& message){preparationState_="error";preparationError_=lastError_=message;preparationMs_=preparationClock_.elapsed();emit failed(message);emit changed();}
void NativeChannel::togglePause() {
    auto* player=decks_[active_].player;
    if (playing()) {pausedAtUs_=programTimeUs();player->pause();if(outgoing_>=0)decks_[outgoing_].player->pause();flushAudio();}
    else if (!player->source().isEmpty()) {
        if (ended_) {ended_=false;player->setPosition(cue().in);}
        decks_[active_].audio->setMuted(true);player->play();if(outgoing_>=0)decks_[outgoing_].player->play();
        if(pausedAtUs_>=0){const auto delta=programTimeUs()-pausedAtUs_;for(int i=0;i<2;++i){decks_[i].offsetUs+=delta;const auto ringGuard=audioMix_.guard();audioMix_.envelope[i].shift(delta);}pausedAtUs_=-1;}else syncAudioTimeline(active_,position()*1000);
        applyLocalAudio();
    }
}
void NativeChannel::seek(qint64 ms) {
    if (path().isEmpty() || !decks_[active_].player->isSeekable()) return;
    const qint64 target=qBound(cue().in,ms,qMax(cue().in,rangeEnd()-1));stopOutgoing();ended_=false;decks_[active_].player->setPosition(target);
    flushAudio();syncAudioTimeline(active_,decks_[active_].player->position()*1000);decks_[active_].realign=true;decks_[active_].realignTargetUs=target*1000;
}
void NativeChannel::black() {
    cancelPrepared();outgoing_=-1;ended_=false;pausedAtUs_=-1;
    ++requestGeneration_;activeGeneration_=0;preparationState_="empty";preparationPath_.clear();preparationError_.clear();publishedTimes_.clear();
    for (auto& d:decks_) {d.audio->setMuted(true);d.player->stop();d.player->setSource({});d.cue={};d.last={};}
    output_={};emit frameReady(output_);emit changed();
    flushAudio();
}
QString NativeChannel::path() const {return decks_[active_].cue.path;}
qint64 NativeChannel::position() const {return decks_[active_].player->position();}
qint64 NativeChannel::duration() const {return decks_[active_].player->duration();}
bool NativeChannel::playing() const {return decks_[active_].player->playbackState()==QMediaPlayer::PlayingState;}
int NativeChannel::frames() const {return decks_[active_].frames;}
QJsonObject NativeChannel::diagnostics()const {
    const auto* player=decks_[active_].player;const auto metadata=player->metaData();const auto size=output_.isValid()?output_.size():metadata.value(QMediaMetaData::Resolution).toSize();
    const double fps=metadata.value(QMediaMetaData::VideoFrameRate).toDouble();const auto now=clock_.elapsed();int recent=0;for(auto time:publishedTimes_)if(time>=now-1000)++recent;
    const auto prepMs=preparationState_=="preparing"&&preparationClock_.isValid()?preparationClock_.elapsed():preparationMs_;
    QJsonObject result{{"source",path()},{"playback",path().isEmpty()?"empty":pending()?"preparing":playing()?"playing":"paused"},
        {"has_video",hasVideo()},{"has_audio",hasAudio()},{"seekable",seekable()},{"duration_ms",duration()},{"position_ms",position()},
        {"width",size.width()},{"height",size.height()},{"nominal_fps",fps>0?QJsonValue(fps):QJsonValue(QJsonValue::Null)},
        {"video_codec",metadata.stringValue(QMediaMetaData::VideoCodec)},{"audio_codec",metadata.stringValue(QMediaMetaData::AudioCodec)},
        {"backend_buffer_progress",double(player->bufferProgress())},{"published_frames",double(publishedFrames_)},{"received_video_callbacks",double(receivedFrames_)},
        {"video_frames_last_second",recent},{"preroll_frames_filtered",double(prerollFiltered_)},{"cpu_composed_frames",double(compositionSamples_)},
        {"cpu_composition_last_ms",compositionSamples_?QJsonValue(compositionLastMs_):QJsonValue(QJsonValue::Null)},
        {"cpu_composition_peak_ms",compositionSamples_?QJsonValue(compositionPeakMs_):QJsonValue(QJsonValue::Null)},
        {"cpu_composition_mean_ms",compositionSamples_?QJsonValue(compositionTotalMs_/double(compositionSamples_)):QJsonValue(QJsonValue::Null)},
        {"preparation_state",preparationState_},{"preparation_source",preparationPath_},{"preparation_ms",double(prepMs)},{"preparation_error",preparationError_},
        {"request_generation",double(requestGeneration_)},{"active_generation",double(activeGeneration_)},{"audio_buffers_tapped",audioBuffers_},{"last_error",lastError_},
        {"decoder_adapter",QJsonValue(QJsonValue::Null)},{"decode_time_ms",QJsonValue(QJsonValue::Null)},{"decoder_dropped_frames",QJsonValue(QJsonValue::Null)},{"decoder_packet_queue",QJsonValue(QJsonValue::Null)}};
    return result;
}
void NativeChannel::setMasterVolume(float value){volume_=std::isfinite(value)?qBound(0.0f,value,1.0f):0;applyLocalAudio();emit changed();}
void NativeChannel::setAudioMuted(bool value){if(value && !muted_)emit audioReset();muted_=value;applyLocalAudio();emit changed();}
void NativeChannel::setLocalAudioEnabled(bool value){localAudio_=value;applyLocalAudio();emit changed();}
void NativeChannel::setAudioDevice(const QByteArray& id){
    deviceId_=id;QAudioDevice selected;
    if(id.isEmpty())selected=QMediaDevices::defaultAudioOutput();else for(const auto& device:QMediaDevices::audioOutputs())if(device.id()==id){selected=device;break;}
    const bool wasAvailable=deviceAvailable_;deviceAvailable_=!selected.isNull();
    if(deviceAvailable_)for(auto& d:decks_)d.audio->setDevice(selected);
    applyLocalAudio();if(wasAvailable && !deviceAvailable_)emit audioWarning("Audio device unavailable; local output muted");emit changed();
}
void NativeChannel::mixLocal(qint64 first,int frames,float* out,int* missing)const{audioMix_.mixInto(first,frames,engineGain_.load(),engineSilent_.load(),out,missing);}
void NativeChannel::setLocalEngine(bool owned){localEngine_=owned;applyLocalAudio();emit changed();}
void NativeChannel::applyLocalAudio(){engineGain_=volume_;engineSilent_=preview_ || muted_ || !localAudio_;for(int i=0;i<2;++i){auto& d=decks_[i];d.audio->setVolume(qBound(0.0f,d.gain*volume_,1.0f));d.audio->setMuted(localEngine_ || preview_ || muted_ || !localAudio_ || !deviceAvailable_ || ended_ || (i!=active_ && i!=outgoing_));}}
void NativeChannel::syncAudioTimeline(int deck,qint64 mediaUs){
    const auto ringGuard=audioMix_.guard();auto& d=decks_[deck];d.offsetUs=programTimeUs()-mediaUs;audioMix_.clear(deck);auto& e=audioMix_.envelope[deck];e={};e.startUs=d.offsetUs+d.cue.in*1000;e.fadeInUs=blendMs_*1000;e.fadeBlackIn=blendType_==Transition::FadeBlack;e.cutoffUs=d.offsetUs+d.cue.end(d.player->duration())*1000;
}
void NativeChannel::flushAudio(){audioMix_.clear();emit audioReset();}
void NativeChannel::receiveAudio(int i,const QAudioBuffer& b){
    if(preview_ || !b.isValid() || ended_ || (i!=active_ && i!=outgoing_) || decks_[i].player->playbackState()!=QMediaPlayer::PlayingState)return;
    const auto f=b.format();if(f.sampleRate()!=48000 || f.channelCount()!=2 || f.sampleFormat()!=QAudioFormat::Float){emit audioWarning("Unsupported decoded audio format; network audio requires stereo float 48 kHz");return;}
    const qint64 start=b.startTime()>=0?b.startTime():decks_[i].player->position()*1000;
    // Buffers decoded before the seek can still arrive (and position() can still report the old place): only a buffer
    // from the seek target re-anchors the timeline, at the presented position when that is already updated.
    if(decks_[i].realign){const qint64 target=decks_[i].realignTargetUs;if(start<target-50000||start>target+2000000)return;
        // Never anchor this buffer in the past (the engine would read a gap and raise its headroom for good).
        qint64 media=decks_[i].player->position()*1000;if(media<target-50000||media>start)media=start;decks_[i].realign=false;syncAudioTimeline(i,media);}
    const auto& d=decks_[i];
    const int first=int(qMax<qint64>(0,(d.cue.in*1000-start)*48/1000));const int end=qMin(b.frameCount(),int(qMax<qint64>(0,(d.cue.end(d.player->duration())*1000-start)*48/1000)));
    if(first>=end)return;const qint64 firstSample=(d.offsetUs+start)*48/1000+first;
    if(firstSample>audioCursor_+AudioMixRing::capacity || firstSample+end-first<audioCursor_)return;
    audioMix_.push(i,b.constData<float>()+first*2,end-first,firstSample);++audioBuffers_;
}
void NativeChannel::pumpAudio(){
    const qint64 available=qMax<qint64>(0,(programTimeUs()-40000)*48/1000);
    if(available-audioCursor_>4800)audioCursor_=(available/480)*480;
    for(int count=0;audioCursor_+480<=available && count<4;++count){auto p=audioMix_.mix(audioCursor_,480,volume_,muted_ || preview_);audioCursor_+=480;float left=0,right=0;const auto* samples=reinterpret_cast<const float*>(p.samples.constData());for(int n=0;n<p.frames();++n){left=qMax(left,std::abs(samples[n*2]));right=qMax(right,std::abs(samples[n*2+1]));}emit audioMeter(left,right);emit audioReady(p);}
}
qint64 NativeChannel::videoTimeUs()const{const auto frame=lastFrame();return frame.isValid() && frame.startTime()>=0?decks_[active_].offsetUs+frame.startTime():programTimeUs();}
