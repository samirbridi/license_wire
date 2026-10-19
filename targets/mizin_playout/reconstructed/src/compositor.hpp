#pragma once
#include "cue.hpp"
#include <QImage>
#include <QPainter>
#include <QSize>
#include <QtGlobal>

// Reference CPU compositor, only during transitions. Mirrored outputs share one result.
inline QImage composeImages(const QImage& outgoing, const QImage& incoming, double progress, Transition type) {
    const QSize size = incoming.isNull() ? outgoing.size() : incoming.size();
    if (size.isEmpty()) return {};
    const double p = qBound(0.0,progress,1.0);
    QImage result(size,QImage::Format_RGB32); result.fill(Qt::black);
    QPainter painter(&result);
    auto draw = [&](const QImage& image, double opacity) {
        if (image.isNull() || opacity <= 0) return;
        QSize scaled = image.size(); scaled.scale(size,Qt::KeepAspectRatio);
        const QRect target(QPoint((size.width()-scaled.width())/2,(size.height()-scaled.height())/2),scaled);
        painter.setOpacity(opacity); painter.drawImage(target,image);
    };
    if (type == Transition::Dissolve) { draw(outgoing,1); draw(incoming,p); }
    else if (type == Transition::FadeBlack) { draw(outgoing,qMax(0.0,1.0-2*p)); draw(incoming,qMax(0.0,2*p-1)); }
    else draw(incoming,1);
    return result;
}
