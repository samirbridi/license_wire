#pragma once
#include "channel.hpp"
#include <QScopedValueRollback>

// Each Program owns its running-order snapshot, so A and B advance independently.
// Operator edits are applied on the next TAKE; a running show cannot change silently.
class PlaylistController final : public QObject {
    Q_OBJECT
public:
    explicit PlaylistController(NativeChannel* channel,QObject* parent=nullptr) : QObject(parent),channel_(channel) {
        connect(channel_,&NativeChannel::started,this,[this]{
            current_=queuedIndex_;queued_=false;blocked_=false;emit cueStarted(current_);
            QTimer::singleShot(0,this,[this]{advance();});
        });
        connect(channel_,&NativeChannel::changed,this,[this]{advance();});
        connect(channel_,&NativeChannel::preparedReady,this,[this]{advance();});
        connect(channel_,&NativeChannel::rangeEnded,this,[this]{advance();});
        connect(channel_,&NativeChannel::failed,this,[this]{blocked_=true;queued_=false;});
    }
    void start(const QList<Cue>& items,int index) {
        if (index<0 || index>=items.size()) return;
        items_=items;current_=-1;queuedIndex_=index;queued_=false;blocked_=false;
        channel_->cancelPrepared();channel_->loadCue(items_[index]);
    }
    void setSequential(bool value) {
        sequential_=value;
        if (value) channel_->setLoop(false);
        else if(queued_) {queued_=false;channel_->cancelPrepared();}
        advance();
    }
    void setRepeat(bool value) {if(queued_){queued_=false;channel_->cancelPrepared();}repeat_=value;advance();}
    bool sequential() const {return sequential_;}
    bool repeat() const {return repeat_;}
    int current() const {return current_;}
    void stop() {current_=-1;queued_=false;channel_->black();}
signals:
    void cueStarted(int index);
private:
    NativeChannel* channel_;
    QList<Cue> items_;
    int current_=-1,queuedIndex_=-1;
    bool sequential_=false,repeat_=false,queued_=false,blocked_=false,advancing_=false;
    void advance() {
        if (advancing_ || !sequential_ || blocked_ || current_<0 || channel_->path().isEmpty() || channel_->transitioning()) return;
        QScopedValueRollback<bool> guard(advancing_,true);
        int next=current_+1;
        if (next>=items_.size()) {if(!repeat_)return;next=0;}
        if (!queued_) {
            queued_=true;queuedIndex_=next;channel_->prepareCue(items_[next]);
        }
        const auto& incoming=items_[queuedIndex_];
        const qint64 overlap=incoming.transition==Transition::Cut?0:qMin<qint64>(incoming.transitionMs,qMax<qint64>(0,(channel_->rangeEnd()-channel_->cue().in)/2));
        if (channel_->prepared() && (channel_->ended() || (channel_->playing() && channel_->position()>=channel_->rangeEnd()-overlap)))
            channel_->takePrepared();
    }
};
