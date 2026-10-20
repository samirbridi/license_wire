#pragma once
#include <QElapsedTimer>
#include <QJsonObject>
#include <memory>

// Called serially on a worker. Missing OS/driver counters stay null.
class ProcessUsage final {
public:
    ProcessUsage();
    ~ProcessUsage();
    QJsonObject sample();
private:
    struct Platform;
    std::unique_ptr<Platform> platform_;
    QElapsedTimer clock_;
    quint64 previousCpu_=0;
    qint64 previousTime_=0;
    bool cpuPrimed_=false;
};
