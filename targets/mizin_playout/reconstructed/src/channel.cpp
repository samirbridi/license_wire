#include "channel.hpp"
#include "compositor.hpp"
#include <QFileInfo>
#include <QUrl>
#include <QMediaDevices>
#include <QAudioBuffer>
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
            auto& deck=decks_[i];
            const qint64 timestamp=frame.startTime()<0 ? deck.player->position() : frame.startTime()/1000;
            if (pending_ && i==incoming_ && (!deck.seekSet || timestamp+2<deck.cue.in)) return;
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
            if (status==QMediaPlayer::LoadedMedia || status==QMediaPlayer::BufferedMedia) setupSeek(i);
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
    if (!pending_ || i!=incoming_ || decks_[i].seekSet) return;
    auto& d=decks_[i];
    if (d.player->duration()<=0) return;
    if (const auto error=d.cue.error(d.player->duration()); !error.isEmpty()) {reject(i,error);return;}
    // Duration can arrive before the backend announces seekability. Do not reject
    // a valid local file during that transient metadata state.
    if (d.cue.in>0 && !d.player->isSeekable()) return;
    d.seekSet=true; d.player->setPosition(d.cue.in);
}
void NativeChannel::beginPrepare(const Cue& cue, bool autoTake, bool play) {
    if (const auto error=cue.error(); !error.isEmpty()) {emit failed(error);return;}
    if (!QFileInfo(cue.path).isFile()) {emit failed("File not found: "+cue.path);return;}
    cancelPrepared(); stopOutgoing();
    incoming_=1-active_; auto& d=decks_[incoming_];
    d.audio->setMuted(true); d.player->stop(); d.player->setSource({});
    d.frames=0; d.last={}; d.cue=cue; d.seekSet=false;
    audioMix_.clear(incoming_);
    pending_=true; autoTake_=autoTake; playIncoming_=play;
    timeout_.start(15000); d.player->setSource(QUrl::fromLocalFile(cue.path));
    d.player->setLoops(QMediaPlayer::Once); d.player->play(); emit changed();
}
void NativeChannel::loadCue(const Cue& cue, bool play) {beginPrepare(cue,true,play);}
void NativeChannel::prepareCue(const Cue& cue) {beginPrepare(cue,false,true);}
void NativeChannel::cancelPrepared() {
    if (pending_ || ready_) {pending_=ready_=false;timeout_.stop();decks_[incoming_].audio->setMuted(true);decks_[incoming_].player->stop();}
}
void NativeChannel::acceptPrepared() {
    if (!pending_ || !decks_[incoming_].seekSet) return;
    pending_=false;ready_=true;timeout_.stop();decks_[incoming_].player->pause();
    const bool take=autoTake_; emit preparedReady(); if (take && ready_) takePrepared();
}
void NativeChannel::takePrepared() {
    if (!ready_) return;
    const int previous=active_; const bool hadProgram=!path().isEmpty() && output_.isValid();
    active_=incoming_; incoming_=previous;ready_=false;ended_=false;pausedAtUs_=-1;
    const auto c=cue(); const qint64 length=rangeEnd()-c.in;
    blendMs_=preview_?0:qMin<qint64>(hadProgram && c.transition!=Transition::Cut ? c.transitionMs : c.enterMs,qMax<qint64>(0,length/2));
    blendType_=hadProgram && c.transition!=Transition::Cut ? c.transition : Transition::Dissolve;
    if (hadProgram && blendMs_>0 && c.transition!=Transition::Cut) outgoing_=previous;
    else {decks_[previous].audio->setMuted(true);decks_[previous].player->stop();audioMix_.envelope[previous].cutoffUs=programTimeUs();outgoing_=-1;}
    auto& d=decks_[active_];d.audio->setVolume(blendMs_>0?0:1);d.audio->setMuted(true);
    syncAudioTimeline(active_,c.in*1000);
    if(outgoing_>=0){auto& old=audioMix_.envelope[outgoing_];old.fadeOutStartUs=programTimeUs();old.fadeOutUs=blendMs_*1000/(blendType_==Transition::FadeBlack?2:1);}
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
    auto& envelope=audioMix_.envelope[active_];const qint64 endUs=d.offsetUs+rangeEnd()*1000;
    envelope.cutoffUs=endUs;envelope.fadeOutUs=ready_?0:exitMs*1000;envelope.fadeOutStartUs=exitMs>0 && !ready_?endUs-exitMs*1000:-1;
    applyLocalAudio();
    QVideoFrame frame=d.last;
    if (frame.isValid() && (p<1 || exitGain<1)) {
        const QImage old=outgoing_>=0?decks_[outgoing_].last.toImage():QImage{};
        QImage image=composeImages(old,frame.toImage(),p,blendType_);
        if (exitGain<1) image=composeImages({},image,exitGain,Transition::Dissolve);
        if (image.isNull()) {reject(active_,"Transition frame conversion failed");return;}
        frame=QVideoFrame(image);frame.setStartTime(d.last.startTime());frame.setEndTime(d.last.endTime());++composedFrames_;
    }
    if (p>=1) stopOutgoing();
    output_=frame;emit frameReady(output_);
}
void NativeChannel::finishRange() {
    if (ended_ || path().isEmpty()) return;
    ended_=true;decks_[active_].player->pause();decks_[active_].audio->setMuted(true);stopOutgoing();
    if (!preview_ && cue().exitMs>0 && !ready_) {output_={};emit frameReady(output_);}
    if (loop_) {
        ended_=false;decks_[active_].player->setPosition(cue().in);decks_[active_].audio->setMuted(true);decks_[active_].player->play();
        syncAudioTimeline(active_,cue().in*1000);applyLocalAudio();
    } else emit rangeEnded();
    emit changed();
}
void NativeChannel::reject(int index,const QString& message) {
    if ((pending_ || ready_) && index==incoming_) cancelPrepared();
    emit failed(message);emit changed();
}
void NativeChannel::togglePause() {
    auto* player=decks_[active_].player;
    if (playing()) {pausedAtUs_=programTimeUs();player->pause();if(outgoing_>=0)decks_[outgoing_].player->pause();flushAudio();}
    else if (!player->source().isEmpty()) {
        if (ended_) {ended_=false;player->setPosition(cue().in);}
        decks_[active_].audio->setMuted(true);player->play();if(outgoing_>=0)decks_[outgoing_].player->play();
        if(pausedAtUs_>=0){const auto delta=programTimeUs()-pausedAtUs_;for(int i=0;i<2;++i){decks_[i].offsetUs+=delta;audioMix_.envelope[i].shift(delta);}pausedAtUs_=-1;}else syncAudioTimeline(active_,position()*1000);
        applyLocalAudio();
    }
}
void NativeChannel::seek(qint64 ms) {
    if (path().isEmpty() || !decks_[active_].player->isSeekable()) return;
    stopOutgoing();ended_=false;decks_[active_].player->setPosition(qBound(cue().in,ms,qMax(cue().in,rangeEnd()-1)));
    flushAudio();syncAudioTimeline(active_,decks_[active_].player->position()*1000);
}
void NativeChannel::black() {
    cancelPrepared();outgoing_=-1;ended_=false;pausedAtUs_=-1;
    for (auto& d:decks_) {d.audio->setMuted(true);d.player->stop();d.player->setSource({});d.cue={};d.last={};}
    output_={};emit frameReady(output_);emit changed();
    flushAudio();
}
QString NativeChannel::path() const {return decks_[active_].cue.path;}
qint64 NativeChannel::position() const {return decks_[active_].player->position();}
qint64 NativeChannel::duration() const {return decks_[active_].player->duration();}
bool NativeChannel::playing() const {return decks_[active_].player->playbackState()==QMediaPlayer::PlayingState;}
int NativeChannel::frames() const {return decks_[active_].frames;}
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
void NativeChannel::applyLocalAudio(){for(int i=0;i<2;++i){auto& d=decks_[i];d.audio->setVolume(qBound(0.0f,d.gain*volume_,1.0f));d.audio->setMuted(preview_ || muted_ || !localAudio_ || !deviceAvailable_ || ended_ || (i!=active_ && i!=outgoing_));}}
void NativeChannel::syncAudioTimeline(int deck,qint64 mediaUs){
    auto& d=decks_[deck];d.offsetUs=programTimeUs()-mediaUs;audioMix_.clear(deck);auto& e=audioMix_.envelope[deck];e={};e.startUs=d.offsetUs+d.cue.in*1000;e.fadeInUs=blendMs_*1000;e.fadeBlackIn=blendType_==Transition::FadeBlack;e.cutoffUs=d.offsetUs+d.cue.end(d.player->duration())*1000;
}
void NativeChannel::flushAudio(){audioMix_.clear();emit audioReset();}
void NativeChannel::receiveAudio(int i,const QAudioBuffer& b){
    if(preview_ || !b.isValid() || ended_ || (i!=active_ && i!=outgoing_) || decks_[i].player->playbackState()!=QMediaPlayer::PlayingState)return;
    const auto f=b.format();if(f.sampleRate()!=48000 || f.channelCount()!=2 || f.sampleFormat()!=QAudioFormat::Float){emit audioWarning("Unsupported decoded audio format; network audio requires stereo float 48 kHz");return;}
    const auto& d=decks_[i];const qint64 start=b.startTime()>=0?b.startTime():d.player->position()*1000;
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
