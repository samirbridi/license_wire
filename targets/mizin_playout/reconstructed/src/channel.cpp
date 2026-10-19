#include "channel.hpp"
#include "compositor.hpp"
#include <QFileInfo>
#include <QUrl>

NativeChannel::NativeChannel(bool preview, QObject* parent) : QObject(parent), preview_(preview) {
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
        connect(d.sink,&QVideoSink::videoFrameChanged,this,[this,i](const QVideoFrame& frame){
            if (!frame.isValid()) return;
            auto& deck=decks_[i];
            const qint64 timestamp=frame.startTime()<0 ? deck.player->position() : frame.startTime()/1000;
            if (pending_ && i==incoming_ && (!deck.seekSet || timestamp+2<deck.cue.in)) return;
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
        connect(d.player,&QMediaPlayer::playbackStateChanged,this,[this]{emit changed();});
    }
}
void NativeChannel::setupSeek(int i) {
    if (!pending_ || i!=incoming_ || decks_[i].seekSet) return;
    auto& d=decks_[i];
    if (d.player->duration()<=0) return;
    if (const auto error=d.cue.error(d.player->duration()); !error.isEmpty()) {reject(i,error);return;}
    if (d.cue.in>0 && !d.player->isSeekable()) {reject(i,"Media is not seekable");return;}
    d.seekSet=true; d.player->setPosition(d.cue.in);
}
void NativeChannel::beginPrepare(const Cue& cue, bool autoTake, bool play) {
    if (const auto error=cue.error(); !error.isEmpty()) {emit failed(error);return;}
    if (!QFileInfo(cue.path).isFile()) {emit failed("File not found: "+cue.path);return;}
    cancelPrepared(); stopOutgoing();
    incoming_=1-active_; auto& d=decks_[incoming_];
    d.audio->setMuted(true); d.player->stop(); d.player->setSource({});
    d.frames=0; d.last={}; d.cue=cue; d.seekSet=false;
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
    active_=incoming_; incoming_=previous;ready_=false;ended_=false;
    const auto c=cue(); const qint64 length=rangeEnd()-c.in;
    blendMs_=preview_?0:qMin<qint64>(hadProgram && c.transition!=Transition::Cut ? c.transitionMs : c.enterMs,qMax<qint64>(0,length/2));
    blendType_=hadProgram && c.transition!=Transition::Cut ? c.transition : Transition::Dissolve;
    if (hadProgram && blendMs_>0 && c.transition!=Transition::Cut) outgoing_=previous;
    else {decks_[previous].audio->setMuted(true);decks_[previous].player->stop();outgoing_=-1;}
    auto& d=decks_[active_];d.audio->setVolume(blendMs_>0?0:1);d.audio->setMuted(preview_);
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
    d.audio->setVolume(float(incomingGain));
    if (outgoing_>=0) decks_[outgoing_].audio->setVolume(float(blendType_==Transition::FadeBlack?qMax(0.0,1-2*p):1-p));
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
        ended_=false;decks_[active_].player->setPosition(cue().in);decks_[active_].audio->setMuted(preview_);decks_[active_].player->play();
    } else emit rangeEnded();
    emit changed();
}
void NativeChannel::reject(int index,const QString& message) {
    if ((pending_ || ready_) && index==incoming_) cancelPrepared();
    emit failed(message);emit changed();
}
void NativeChannel::togglePause() {
    auto* player=decks_[active_].player;
    if (playing()) {player->pause();if(outgoing_>=0)decks_[outgoing_].player->pause();}
    else if (!player->source().isEmpty()) {
        if (ended_) {ended_=false;player->setPosition(cue().in);}
        decks_[active_].audio->setMuted(preview_);player->play();if(outgoing_>=0)decks_[outgoing_].player->play();
    }
}
void NativeChannel::seek(qint64 ms) {
    if (path().isEmpty() || !decks_[active_].player->isSeekable()) return;
    stopOutgoing();ended_=false;decks_[active_].player->setPosition(qBound(cue().in,ms,qMax(cue().in,rangeEnd()-1)));
}
void NativeChannel::black() {
    cancelPrepared();outgoing_=-1;ended_=false;
    for (auto& d:decks_) {d.audio->setMuted(true);d.player->stop();d.player->setSource({});d.cue={};d.last={};}
    output_={};emit frameReady(output_);emit changed();
}
QString NativeChannel::path() const {return decks_[active_].cue.path;}
qint64 NativeChannel::position() const {return decks_[active_].player->position();}
qint64 NativeChannel::duration() const {return decks_[active_].player->duration();}
bool NativeChannel::playing() const {return decks_[active_].player->playbackState()==QMediaPlayer::PlayingState;}
int NativeChannel::frames() const {return decks_[active_].frames;}
