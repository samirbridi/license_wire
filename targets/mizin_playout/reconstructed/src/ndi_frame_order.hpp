#pragma once
#include <QtCore>

// SDK delivery time is strict. Source frames are strict by sequence/timecode;
// connection cache may replay the exact same frame (including metadata/pixels).
struct NdiFrameOrder {
    qint64 sequence=-1,timecode=-1,sdkTimestamp=-1;
    QByteArray pixels;
    int cachedRepeats=0;
    bool observe(qint64 next,qint64 tc,qint64 stamp,const QByteArray& content){
        if(next<0||content.isEmpty()||stamp<=sdkTimestamp)return false;
        sdkTimestamp=stamp;
        if(next==sequence){++cachedRepeats;return tc==timecode&&content==pixels;}
        if(next<=sequence||tc<=timecode)return false;
        sequence=next;timecode=tc;pixels=content;return true;
    }
    static qint64 readSequence(const char* metadata){
        if(!metadata)return -1;const auto match=QRegularExpression("<mizin_frame sequence=\"([0-9]+)\"").match(QString::fromUtf8(metadata));
        return match.hasMatch()?match.captured(1).toLongLong():-1;
    }
};
