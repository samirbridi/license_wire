#include "channel.hpp"
#include <QFileInfo>
#include <QUrl>

NativeChannel::NativeChannel(bool preview, QObject* parent) : QObject(parent), preview_(preview) {
    timeout_.setSingleShot(true);
    connect(&timeout_, &QTimer::timeout, this, [this] { reject(incoming_, "Media preparation timed out"); });
    for (int i = 0; i < 2; ++i) {
        auto& d = decks_[i];
        d.player = new QMediaPlayer(this);
        d.audio = new QAudioOutput(this);
        d.sink = new QVideoSink(this);
        d.player->setAudioOutput(d.audio);
        d.player->setVideoSink(d.sink);
        d.audio->setMuted(true);
        connect(d.sink, &QVideoSink::videoFrameChanged, this, [this, i](const QVideoFrame& frame) {
            if (!frame.isValid()) return;
            auto& deck = decks_[i];
            deck.last = frame;
            ++deck.frames;
            if (pending_ && i == incoming_) promote(i);
            if (i == active_) emit frameReady(frame);
        });
        connect(d.player, &QMediaPlayer::mediaStatusChanged, this, [this, i](QMediaPlayer::MediaStatus status) {
            if (status == QMediaPlayer::InvalidMedia) reject(i, decks_[i].player->errorString());
            // Audio-only media has no first video frame to wait for.
            if (pending_ && i == incoming_ && status == QMediaPlayer::BufferedMedia && !decks_[i].player->hasVideo()) promote(i);
            emit changed();
        });
        connect(d.player, &QMediaPlayer::errorOccurred, this, [this, i](QMediaPlayer::Error, const QString& text) { reject(i, text); });
        connect(d.player, &QMediaPlayer::positionChanged, this, [this, i] { if (i == active_) emit changed(); });
        connect(d.player, &QMediaPlayer::durationChanged, this, [this] { emit changed(); });
        connect(d.player, &QMediaPlayer::playbackStateChanged, this, [this] { emit changed(); });
    }
}

void NativeChannel::load(const QString& path, bool play) {
    if (!QFileInfo(path).isFile()) { emit failed("File not found: " + path); return; }
    pending_ = false;
    incoming_ = 1 - active_;
    auto& d = decks_[incoming_];
    d.audio->setMuted(true);
    d.player->stop();
    d.frames = 0;
    d.last = {};
    d.path = path;
    playIncoming_ = play;
    pending_ = true;
    timeout_.start(15000);
    d.player->setSource(QUrl::fromLocalFile(path));
    d.player->setLoops(loop_ ? QMediaPlayer::Infinite : QMediaPlayer::Once);
    d.player->play(); // Muted preroll. Existing Program remains until first frame.
    emit changed();
}

void NativeChannel::promote(int index) {
    if (!pending_ || index != incoming_) return;
    timeout_.stop();
    pending_ = false;
    const int previous = active_;
    active_ = index;
    decks_[previous].audio->setMuted(true);
    decks_[previous].player->stop();
    decks_[active_].audio->setMuted(preview_);
    if (!playIncoming_) decks_[active_].player->pause();
    emit changed();
}

void NativeChannel::reject(int index, const QString& message) {
    if (pending_ && index == incoming_) {
        pending_ = false;
        timeout_.stop();
        decks_[index].audio->setMuted(true);
        decks_[index].player->stop();
    }
    emit failed(message);
    emit changed();
}

void NativeChannel::togglePause() {
    auto* p = decks_[active_].player;
    if (p->playbackState() == QMediaPlayer::PlayingState) p->pause();
    else if (!p->source().isEmpty()) p->play();
}

void NativeChannel::black() {
    pending_ = false;
    timeout_.stop();
    for (auto& d : decks_) { d.audio->setMuted(true); d.player->stop(); d.player->setSource({}); d.path.clear(); d.last = {}; }
    emit frameReady(QVideoFrame{});
    emit changed();
}

void NativeChannel::setLoop(bool loop) { loop_ = loop; for (auto& d : decks_) d.player->setLoops(loop ? QMediaPlayer::Infinite : QMediaPlayer::Once); }
QString NativeChannel::path() const { return decks_[active_].path; }
qint64 NativeChannel::position() const { return decks_[active_].player->position(); }
qint64 NativeChannel::duration() const { return decks_[active_].player->duration(); }
bool NativeChannel::playing() const { return decks_[active_].player->playbackState() == QMediaPlayer::PlayingState; }
int NativeChannel::frames() const { return decks_[active_].frames; }
QVideoFrame NativeChannel::lastFrame() const { return decks_[active_].last; }
