#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QStringList>
#include <cmath>
#include <vector>
#include <QSet>

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
    // Import/allocation guards, not a promise of concurrent playback capacity.
    static constexpr int MaxPrograms=64,MaxDisplays=128;
    int programs=1, displays=1;
    std::vector<int> sources{0};
    bool valid() const {
        if(programs<1 || programs>MaxPrograms || displays<1 || displays>MaxDisplays || sources.size()!=size_t(displays))return false;
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
        if(result.displays<1 || result.displays>MaxDisplays)return false;
        result.sources.resize(result.displays);
        for(int i=0;i<routes.size();++i){if(!routes[i].isObject())return false;const auto source=routes[i].toObject()["program"];
            if(!source.isDouble() || source.toDouble()!=source.toInt())return false;result.sources[i]=source.toInt();}
        if(!result.valid())return false;destination=result;return true;
    }
};
struct ProgramDefinition {
    int id=1;
    QString name="Program A";
    QList<Cue> cues;
    QJsonObject json()const{QJsonArray items;for(const auto& cue:cues)items.append(cue.json());return {{"id",id},{"name",name},{"playlist",items}};}
};
struct Show {
    QStringList library, folders;
    QList<Cue> cues;
    OutputConfiguration outputs;
    QList<ProgramDefinition> programs;
    QList<ProgramDefinition> definitions()const{
        if(!programs.isEmpty())return programs;QList<ProgramDefinition> result;
        for(int i=0;i<outputs.programs;++i)result.append({i+1,QString("Program %1").arg(i<26?QString(QChar('A'+i)):QString::number(i+1)),cues});return result;
    }
    QJsonObject json() const {
        QJsonArray items;for(const auto& program:definitions())items.append(program.json());
        return {{"schema",4},{"library",QJsonArray::fromStringList(library)},
                {"folders",QJsonArray::fromStringList(folders)},{"programs",items},{"outputs",outputs.json()}};
    }
    static bool read(const QJsonObject& o, Show& destination) {
        const int schema = o["schema"].toInt();
        if (schema<1 || schema>4 || o["schema"].toDouble()!=schema || !o["library"].isArray() || !o["folders"].isArray()) return false;
        Show result;
        if(schema>=3 && !OutputConfiguration::read(o["outputs"],result.outputs))return false;
        auto strings = [](const QJsonArray& a, QStringList& out) {
            for (const auto& v : a) { if (!v.isString()) return false; out.append(v.toString()); } return true;
        };
        if (!strings(o["library"].toArray(),result.library) || !strings(o["folders"].toArray(),result.folders)) return false;
        if(schema==4){
            if(!o["programs"].isArray() || o["programs"].toArray().size()!=result.outputs.programs)return false;
            QSet<int> ids;
            for(const auto& value:o["programs"].toArray()){
                if(!value.isObject())return false;const auto p=value.toObject();const auto id=p["id"];
                if(!id.isDouble() || id.toDouble()!=id.toInt() || id.toInt()<1 || id.toInt()>1000000 || ids.contains(id.toInt()) || !p["name"].isString() || p["name"].toString().trimmed().isEmpty() || p["name"].toString().size()>120 || !p["playlist"].isArray())return false;
                ProgramDefinition program{id.toInt(),p["name"].toString(),{}};ids.insert(program.id);
                for(const auto& v:p["playlist"].toArray()){Cue c;if(!Cue::read(v,c))return false;program.cues.append(c);}result.programs.append(program);
            }
            if(result.programs.first().id!=1)return false;result.cues=result.programs.first().cues;
        }else{
            if(!o["playlist"].isArray())return false;
            for(const auto& v:o["playlist"].toArray()){Cue c;if(!Cue::read(v,c,schema==1))return false;result.cues.append(c);}
            result.programs=result.definitions();
        }
        destination = result; return true;
    }
};
