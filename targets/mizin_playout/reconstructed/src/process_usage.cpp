#include "process_usage.hpp"
#include <QDateTime>
#include <QString>
#include <QStringList>
#include <algorithm>
#include <cmath>
#include <cwchar>
#include <vector>
#ifdef Q_OS_WIN
#include <qt_windows.h>
#include <psapi.h>
#include <pdh.h>
#include <pdhmsg.h>
#include <map>

struct ProcessUsage::Platform {
    PDH_HQUERY query=nullptr;
    QString gpuPath;
    struct Engine {PDH_HCOUNTER counter=nullptr;bool primed=false;};
    std::map<QString,Engine> engines;
    qint64 refreshAt=-1;
    ~Platform(){if(query)PdhCloseQuery(query);}
    void discover(qint64 now){
        if(now<refreshAt)return;refreshAt=now+5000;
        if(!query&&PdhOpenQueryW(nullptr,0,&query)!=ERROR_SUCCESS){query=nullptr;return;}
        if(gpuPath.isEmpty()){
            PDH_HCOUNTER english=nullptr;
            if(PdhAddEnglishCounterW(query,L"\\GPU Engine(*)\\Utilization Percentage",0,&english)!=ERROR_SUCCESS)return;
            DWORD bytes=0;PdhGetCounterInfoW(english,FALSE,&bytes,nullptr);
            if(bytes>0&&bytes<1024*1024){
                std::vector<quint64> buffer((bytes+7)/8);auto* info=reinterpret_cast<PDH_COUNTER_INFO_W*>(buffer.data());
                if(PdhGetCounterInfoW(english,FALSE,&bytes,info)==ERROR_SUCCESS)gpuPath=QString::fromWCharArray(info->szFullPath);
            }
            PdhRemoveCounter(english);if(gpuPath.isEmpty())return;
        }
        DWORD length=0;const auto status=PdhExpandWildCardPathW(nullptr,reinterpret_cast<LPCWSTR>(gpuPath.utf16()),nullptr,&length,PDH_REFRESHCOUNTERS);
        if(status!=PDH_MORE_DATA||!length||length>1024*1024)return;
        std::vector<wchar_t> paths(length);
        if(PdhExpandWildCardPathW(nullptr,reinterpret_cast<LPCWSTR>(gpuPath.utf16()),paths.data(),&length,PDH_REFRESHCOUNTERS)!=ERROR_SUCCESS)return;
        const QString pid=QString("pid_%1_").arg(GetCurrentProcessId());QStringList present;
        for(const wchar_t* path=paths.data();*path;path+=wcslen(path)+1){
            const QString name=QString::fromWCharArray(path);if(!name.contains(pid,Qt::CaseInsensitive))continue;present.append(name);
            if(engines.contains(name)||engines.size()>=128)continue;
            PDH_HCOUNTER counter=nullptr;if(PdhAddCounterW(query,path,0,&counter)==ERROR_SUCCESS)engines.emplace(name,Engine{counter,false});
        }
        for(auto it=engines.begin();it!=engines.end();)if(!present.contains(it->first)){PdhRemoveCounter(it->second.counter);it=engines.erase(it);}else ++it;
    }
    void gpu(QJsonObject& result,qint64 now){
        discover(now);if(!query||PdhCollectQueryData(query)!=ERROR_SUCCESS)return;
        double busiest=-1;QString engine;
        for(auto& [path,state]:engines){
            PDH_FMT_COUNTERVALUE value{};const bool hadSample=state.primed;state.primed=true;
            if(!hadSample)continue;
            const auto status=PdhGetFormattedCounterValue(state.counter,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,nullptr,&value);
            if(status!=ERROR_SUCCESS||(value.CStatus!=PDH_CSTATUS_VALID_DATA&&value.CStatus!=PDH_CSTATUS_NEW_DATA)||!std::isfinite(value.doubleValue)||value.doubleValue<0)continue;
            if(value.doubleValue>busiest){busiest=value.doubleValue;engine=path;}
        }
        if(busiest>=0){result["gpu_percent"]=std::clamp(busiest,0.0,100.0);result["gpu_engine"]=engine;}
    }
};
#else
struct ProcessUsage::Platform {};
#endif

ProcessUsage::ProcessUsage():platform_(std::make_unique<Platform>()){clock_.start();}
ProcessUsage::~ProcessUsage()=default;
QJsonObject ProcessUsage::sample(){
    const auto now=clock_.nsecsElapsed();const QJsonValue unknown(QJsonValue::Null);
    QJsonObject result{{"cpu_percent",unknown},{"working_set_bytes",unknown},{"gpu_percent",unknown},{"gpu_engine",unknown},
        {"sampled_unix_ms",double(QDateTime::currentMSecsSinceEpoch())},{"interval_ms",cpuPrimed_?double(now-previousTime_)/1000000:0.0},
        {"scope","Current process; CPU normalized by logical processors, RAM working set, busiest observed process GPU engine. Not decoder identification or whole-system load."}};
#ifdef Q_OS_WIN
    result["provider"]="Windows GetProcessTimes / GetProcessMemoryInfo / PDH GPU Engine";result["pid"]=int(GetCurrentProcessId());
    const auto process=GetCurrentProcess();FILETIME created{},exited{},kernel{},user{};
    if(GetProcessTimes(process,&created,&exited,&kernel,&user)){
        const auto ticks=[](FILETIME time){return (quint64(time.dwHighDateTime)<<32)|time.dwLowDateTime;};
        const quint64 cpu=ticks(kernel)+ticks(user);const auto processors=GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
        if(cpuPrimed_&&now>previousTime_&&cpu>=previousCpu_&&processors)result["cpu_percent"]=std::clamp(10000.0*double(cpu-previousCpu_)/(double(now-previousTime_)*processors),0.0,100.0);
        previousCpu_=cpu;previousTime_=now;cpuPrimed_=true;
    }else cpuPrimed_=false;
    PROCESS_MEMORY_COUNTERS memory{};memory.cb=sizeof(memory);
    if(GetProcessMemoryInfo(process,&memory,sizeof(memory)))result["working_set_bytes"]=double(memory.WorkingSetSize);
    platform_->gpu(result,now/1000000);
#else
    result["provider"]="unavailable on this platform";
#endif
    result["sampled_unix_ms"]=double(QDateTime::currentMSecsSinceEpoch());return result;
}
