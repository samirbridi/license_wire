#pragma once
#include <QImage>
#include <QSize>
#include <QString>
#include <memory>

QSize fittedPixels(QSize source,QSize output);
QSize displayPixels(QSize logical,qreal devicePixelRatio);

// FFmpeg 7.1 public C ABI, resolved from the same LGPL runtime used by Qt.
// Contexts are private to one sequential worker, never shared concurrently.
class LanczosScaler final {
public:
    LanczosScaler();
    ~LanczosScaler();
    bool available() const;
    QString error() const;
    QImage scale(const QImage& source,QSize target);
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
