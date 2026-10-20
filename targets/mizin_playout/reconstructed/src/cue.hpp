#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QStringList>
#include <cmath>
#include <array>

enum class Transition { Cut, Dissolve, FadeBlack };
struct Cue {
    QString path;
    qint64 in = 0, out = -1; // -1 means native duration. Originals are never edited.
    Transition transition = Transition::Cut;
    int transitionMs = 300, enterMs = 0, exitMs = 0;
    qint64 end(qint64 duration) const { return out < 0 ? duration : out; }
    QString error(qint64 duration = 0) const {
        if (path.isEmpty()) return "Empty media path";
        if (in < 0 || (out != -1 && out <= in)) return "In must be before Out";
        if (duration > 0 && (in >= duration || out > duration)) return "Trim exceeds media duration";
        if (transitionMs < 0 || transitionMs > 10000 || enterMs < 0 || enterMs > 10000 || exitMs < 0 || exitMs > 10000)
            return "Transition duration must be between 0 and 10 seconds";
        return {};
    }
    QJsonObject json() const {
        return {{"source",path},{"in_ms",in},{"out_ms",out},{"transition",int(transition)},
                {"transition_ms",transitionMs},{"enter_ms",enterMs},{"exit_ms",exitMs}};
    }
    static bool read(const QJsonValue& value, Cue& cue, bool legacy = false) {
        if (legacy) { if (!value.isString()) return false; cue = Cue{value.toString()}; return cue.error().isEmpty(); }
        if (!value.isObject()) return false;
        auto o = value.toObject();
        if (!o["source"].isString()) return false;
        auto integer = [&](const QString& key, qint64 minimum, qint64 maximum) {
            if (!o[key].isDouble()) return false;
            double n = o[key].toDouble();
            return std::isfinite(n) && std::floor(n) == n && n >= double(minimum) && n <= double(maximum);
        };
        for (const auto& key : {"in_ms","out_ms"}) if (!integer(key,key == QString("out_ms") ? -1 : 0,604800000)) return false;
        for (const auto& key : {"transition_ms","enter_ms","exit_ms"}) if (!integer(key,0,10000)) return false;
        if (!integer("transition",0,2)) return false;
        cue = {o["source"].toString(),o["in_ms"].toInteger(),o["out_ms"].toInteger(),
               Transition(o["transition"].toInt()),o["transition_ms"].toInt(),o["enter_ms"].toInt(),o["exit_ms"].toInt()};
        return cue.error().isEmpty();
    }
};
struct OutputConfiguration {
    int programs=1, displays=1;
    std::array<int,3> sources{0,0,0};
    bool valid() const {
        if(programs<1 || programs>2 || displays<1 || displays>3)return false;
        for(int i=0;i<displays;++i)if(sources[i]<0 || sources[i]>=programs)return false;
        return true;
    }
    QJsonObject json() const {
        QJsonArray routes;for(int i=0;i<displays;++i)routes.append(QJsonObject{{"program",sources[i]}});
        return {{"programs",programs},{"displays",routes}};
    }
    static bool read(const QJsonValue& value,OutputConfiguration& destination){
        if(!value.isObject())return false;const auto o=value.toObject();const auto count=o["programs"];
        if(!count.isDouble() || count.toDouble()!=count.toInt() || !o["displays"].isArray())return false;
        OutputConfiguration result;result.programs=count.toInt();const auto routes=o["displays"].toArray();result.displays=routes.size();
        if(result.displays<1 || result.displays>3)return false;
        for(int i=0;i<routes.size();++i){if(!routes[i].isObject())return false;const auto source=routes[i].toObject()["program"];
            if(!source.isDouble() || source.toDouble()!=source.toInt())return false;result.sources[i]=source.toInt();}
        if(!result.valid())return false;destination=result;return true;
    }
};
struct Show {
    QStringList library, folders;
    QList<Cue> cues;
    OutputConfiguration outputs;
    QJsonObject json() const {
        QJsonArray items; for (const auto& cue : cues) items.append(cue.json());
        return {{"schema",3},{"library",QJsonArray::fromStringList(library)},
                {"folders",QJsonArray::fromStringList(folders)},{"playlist",items},{"outputs",outputs.json()}};
    }
    static bool read(const QJsonObject& o, Show& destination) {
        const int schema = o["schema"].toInt();
        if ((schema != 1 && schema != 2 && schema != 3) || !o["playlist"].isArray() || !o["library"].isArray() || !o["folders"].isArray()) return false;
        Show result;
        if(schema==3 && !OutputConfiguration::read(o["outputs"],result.outputs))return false;
        auto strings = [](const QJsonArray& a, QStringList& out) {
            for (const auto& v : a) { if (!v.isString()) return false; out.append(v.toString()); } return true;
        };
        if (!strings(o["library"].toArray(),result.library) || !strings(o["folders"].toArray(),result.folders)) return false;
        for (const auto& v : o["playlist"].toArray()) { Cue c; if (!Cue::read(v,c,schema == 1)) return false; result.cues.append(c); }
        destination = result; return true;
    }
};
