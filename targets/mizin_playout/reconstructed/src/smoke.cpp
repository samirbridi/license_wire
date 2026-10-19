#include "smoke.hpp"
#include "channel.hpp"
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QElapsedTimer>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>
#include <QVideoSink>
#include <memory>
#include <functional>

int runSmoke(const QString& directory, const QString& resultPath) {
    NativeChannel channel(false), independent(false);
    QVideoSink mirror1, mirror2;
    int mirrorFrames1 = 0, mirrorFrames2 = 0;
    QObject::connect(&channel, &NativeChannel::frameReady, &mirror1, [&](const QVideoFrame& f) { if (f.isValid()) { mirror1.setVideoFrame(f); ++mirrorFrames1; } });
    QObject::connect(&channel, &NativeChannel::frameReady, &mirror2, [&](const QVideoFrame& f) { if (f.isValid()) { mirror2.setVideoFrame(f); ++mirrorFrames2; } });
    QStringList files = QDir(directory).entryList({"*.mp4", "*.mkv", "*.avi", "*.mov"}, QDir::Files, QDir::Name);
    QJsonArray tests;
    QTimer timer;
    QElapsedTimer clock;
    int current = -1;
    bool phaseIndependent = false;
    bool hadFailure = false;
    QString error;
    QObject::connect(&channel, &NativeChannel::failed, &channel, [&](const QString& e) { error = e; });
    QObject::connect(&independent, &NativeChannel::failed, &independent, [&](const QString& e) { error = e; });
    auto finish = [&] {
        channel.black(); independent.black();
        QJsonObject result{{"result", hadFailure ? "FAIL" : "PASS"}, {"mode", qEnvironmentVariable("MIZIN_DECODE_MODE", "auto")},
            {"scope", "Native decoding and timing; not physical output performance"}, {"tests", tests}};
        QFile out(resultPath);
        if (!out.open(QIODevice::WriteOnly)) { QCoreApplication::exit(3); return; }
        out.write(QJsonDocument(result).toJson()); out.close();
        QCoreApplication::exit(hadFailure ? 2 : 0);
    };
    std::function<void()> next = [&] {
        ++current; error.clear(); clock.restart();
        if (current < files.size()) channel.load(QDir(directory).absoluteFilePath(files[current]));
        else if (files.size() >= 2 && !phaseIndependent) {
            phaseIndependent = true;
            channel.load(QDir(directory).absoluteFilePath(files[0]));
            independent.load(QDir(directory).absoluteFilePath(files[1]));
        } else finish();
    };
    QObject::connect(&timer, &QTimer::timeout, &channel, [&] {
        const bool enough = phaseIndependent ? (channel.frames() >= 8 && independent.frames() >= 8 && channel.position() > 250 && independent.position() > 250)
                                             : (channel.frames() >= 8 && channel.position() > 250 && !channel.pending());
        if (!enough && error.isEmpty() && clock.elapsed() < 12000) return;
        const bool ok = enough && error.isEmpty(); hadFailure |= !ok;
        QJsonObject test{{"name", phaseIndependent ? "independent_channels_and_mirror" : files.value(current)}, {"pass", ok},
            {"frames", channel.frames()}, {"position_ms", channel.position()}, {"duration_ms", channel.duration()},
            {"elapsed_ms", clock.elapsed()}, {"error", error}};
        if (phaseIndependent) {
            const bool separate = channel.path() != independent.path();
            const bool mirrored = mirrorFrames1 > 0 && mirrorFrames1 == mirrorFrames2;
            test["independent_frames"] = independent.frames(); test["distinct_media"] = separate; test["mirrored_frames_equal"] = mirrored;
            hadFailure |= !separate || !mirrored; test["pass"] = ok && separate && mirrored;
        }
        tests.append(test); next();
    });
    if (files.isEmpty()) { hadFailure = true; tests.append(QJsonObject{{"name", "fixtures"}, {"pass", false}, {"error", "No fixtures"}}); QTimer::singleShot(0, &channel, finish); }
    else { timer.start(50); QTimer::singleShot(0, &channel, next); }
    return QCoreApplication::exec();
}
