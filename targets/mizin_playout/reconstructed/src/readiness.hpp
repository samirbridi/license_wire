#pragma once
#include "channel.hpp"
#include <QFileSystemWatcher>
#include <QFileInfo>
#include <QDateTime>
#include <QScopedValueRollback>

// A bounded, muted source check. READY validates file/trim and a decoded Preview
// frame at In; it does not claim an armed Program, hardware decode or physical sync.
class CueReadiness final : public QObject {
    Q_OBJECT
public:
    enum class State { Empty, Preparing, Ready, Error };
    CueReadiness(NativeChannel* preview,QObject* parent=nullptr):QObject(parent),preview_(preview) {
        timer_.setInterval(100);connect(&timer_,&QTimer::timeout,this,&CueReadiness::poll);
        connect(preview_,&NativeChannel::changed,this,[this]{QTimer::singleShot(0,this,&CueReadiness::poll);});
        connect(preview_,&NativeChannel::frameReady,this,[this]{poll();});
        connect(preview_,&NativeChannel::failed,this,[this](const QString& message){if(generation_&&preview_->requestGeneration()==generation_&&(state_==State::Preparing||state_==State::Ready))fail(message);});
        connect(&watcher_,&QFileSystemWatcher::fileChanged,this,[this](const QString& path){if(path==cue_.path&&(state_==State::Ready||state_==State::Preparing)&&!fileUnchanged())fail("Media changed; cue again");});
    }
    State state()const{return state_;}
    QString error()const{return error_;}
    bool readyFor(const Cue& cue)const {
        return state_==State::Ready&&sameRange(cue_,cue)&&preview_->requestGeneration()==generation_&&preview_->activeGeneration()==generation_;
    }
    void clear() {
        timer_.stop();if(!watcher_.files().isEmpty())watcher_.removePaths(watcher_.files());
        state_=State::Empty;cue_={};error_.clear();generation_=0;seekIssued_=false;firstFrameUs_=-1;elapsedMs_=0;if(preview_->playing())preview_->togglePause();emit changed();
    }
    void prepare(const Cue& cue) {
        clear();cue_=cue;clock_.start();state_=State::Preparing;emit changed();
        preview_->black();
        if(const auto error=cue.error();!error.isEmpty()){fail(error);return;}
        const QFileInfo info(cue.path);if(!info.isFile()||!info.isReadable()){fail("File is missing or unreadable");return;}
        bytes_=info.size();modified_=info.lastModified().toMSecsSinceEpoch();watcher_.addPath(cue.path);
        // Keep the Preview's full range so EDIT can scrub outside the applied trim.
        preview_->load(cue.path,false);generation_=preview_->requestGeneration();timer_.start();poll();
    }
    bool recheckFile() {
        if(state_!=State::Ready)return false;
        if(!fileUnchanged()){fail("Media changed; cue again");return false;}
        return true;
    }
    QJsonObject snapshot()const {
        const QString state=state_==State::Ready?"ready":state_==State::Preparing?"preparing":state_==State::Error?"error":"empty";
        return {{"state",state},{"cue",cue_.json()},{"error",error_},{"generation",double(generation_)},
            {"elapsed_ms",double(state_==State::Preparing?clock_.elapsed():elapsedMs_)},{"first_verified_video_pts_us",double(firstFrameUs_)},
            {"scope","Muted Preview source/trim verification; Program decks still prepare on TAKE. Audio-only checks use backend readiness, not decoded PCM proof."}};
    }
signals:
    void changed();
private:
    NativeChannel* preview_;
    State state_=State::Empty;
    Cue cue_;
    QTimer timer_;
    QFileSystemWatcher watcher_;
    QElapsedTimer clock_;
    quint64 generation_=0,seekPublication_=0;
    qint64 bytes_=0,modified_=0,firstFrameUs_=-1,elapsedMs_=0;
    bool seekIssued_=false,checking_=false;
    QString error_;
    static bool sameRange(const Cue& a,const Cue& b){return a.path==b.path&&a.in==b.in&&a.out==b.out;}
    bool fileUnchanged()const{const QFileInfo info(cue_.path);return info.isFile()&&info.isReadable()&&info.size()==bytes_&&info.lastModified().toMSecsSinceEpoch()==modified_;}
    void fail(const QString& error){timer_.stop();state_=State::Error;error_=error;elapsedMs_=clock_.isValid()?clock_.elapsed():0;if(preview_->playing())preview_->togglePause();emit changed();}
    void poll() {
        if(checking_||state_==State::Empty||state_==State::Error||!generation_)return;
        const QScopedValueRollback<bool> checking(checking_,true);
        if(preview_->requestGeneration()!=generation_){fail("Preview changed; cue again");return;}
        if(state_==State::Ready)return;
        if(clock_.elapsed()>20000){fail("Cue verification timed out");return;}
        if(preview_->preparationState()=="error"){fail(preview_->preparationError());return;}
        if(preview_->activeGeneration()!=generation_||preview_->preparing()||preview_->duration()<=0)return;
        if(const auto error=cue_.error(preview_->duration());!error.isEmpty()){fail(error);return;}
        if(!preview_->hasVideo()&&!preview_->hasAudio()){fail("No playable audio or video stream");return;}
        if(!seekIssued_){
            if(cue_.in>0&&!preview_->seekable()){fail("Source cannot seek to In");return;}
            seekIssued_=true;seekPublication_=preview_->publishedFrames();
            if(cue_.in>0){preview_->seek(cue_.in);if(preview_->hasVideo()&&!preview_->playing())preview_->togglePause();return;}
        }
        if(preview_->hasVideo()){
            const auto frame=preview_->lastFrame();if(!frame.isValid())return;
            if(cue_.in>0&&preview_->publishedFrames()<=seekPublication_)return;
            if(frame.startTime()<0){fail("Video timestamps unavailable for In verification");return;}
            const auto timestamp=frame.startTime()/1000;
            if(timestamp+2<cue_.in||timestamp>=cue_.end(preview_->duration()))return;
            firstFrameUs_=frame.startTime();
        }else if(preview_->position()+2<cue_.in)return;
        if(!fileUnchanged()){fail("Media changed; cue again");return;}
        state_=State::Ready;elapsedMs_=clock_.elapsed();timer_.stop();
        if(preview_->playing())preview_->togglePause();emit changed();
    }
};
