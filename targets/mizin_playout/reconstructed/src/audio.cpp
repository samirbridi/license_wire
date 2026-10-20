#include "audio.hpp"
#include <cmath>

QByteArray planarAudio(const AudioPacket& p){
    QByteArray result(p.samples.size(),Qt::Uninitialized);const auto* in=reinterpret_cast<const float*>(p.samples.constData());auto* out=reinterpret_cast<float*>(result.data());const int n=p.frames();
    for(int i=0;i<n;++i){out[i]=in[2*i];out[n+i]=in[2*i+1];}return result;
}
float AudioEnvelope::gain(qint64 t)const{
    if(t<startUs || t>=cutoffUs)return 0;
    double g=fadeInUs>0?qBound(0.0,double(t-startUs)/fadeInUs,1.0):1;
    if(fadeBlackIn)g=qMax(0.0,2*g-1);
    if(fadeOutStartUs>=0 && t>=fadeOutStartUs)g*=fadeOutUs>0?qBound(0.0,1.0-double(t-fadeOutStartUs)/fadeOutUs,1.0):0;
    return float(g);
}
void AudioEnvelope::shift(qint64 delta){startUs+=delta;if(fadeOutStartUs>=0)fadeOutStartUs+=delta;if(cutoffUs!=std::numeric_limits<qint64>::max())cutoffUs+=delta;}
AudioMixRing::AudioMixRing(){for(auto& d:decks_){d.pcm.resize(capacity*channels);d.tags.fill(-1,capacity);}}
void AudioMixRing::clear(int deck){for(int i=0;i<2;++i)if(deck<0 || deck==i)decks_[i].tags.fill(-1);}
void AudioMixRing::push(int deck,const float* pcm,int frames,qint64 first){
    if(deck<0 || deck>1 || !pcm || frames<=0 || frames>capacity)return;auto& d=decks_[deck];
    for(int i=0;i<frames;++i){const qint64 sample=first+i;if(sample<0)continue;const int slot=int(sample%capacity);d.tags[slot]=sample;for(int c=0;c<channels;++c){const float v=pcm[i*channels+c];d.pcm[slot*channels+c]=std::isfinite(v)?v:0;}}
}
AudioPacket AudioMixRing::mix(qint64 first,int frames,float master,bool muted)const{
    AudioPacket result;result.timestampUs=first*1000000/rate;if(frames<=0 || frames>capacity)return result;result.samples.resize(frames*channels*sizeof(float));auto* out=reinterpret_cast<float*>(result.samples.data());
    for(int i=0;i<frames;++i){const qint64 sample=first+i;const int slot=int((sample%capacity+capacity)%capacity);float value[2]={};
        for(int deck=0;deck<2;++deck)if(decks_[deck].tags[slot]==sample){const float g=envelope[deck].gain(sample*1000000/rate);for(int c=0;c<channels;++c)value[c]+=decks_[deck].pcm[slot*channels+c]*g;}
        for(int c=0;c<channels;++c)out[i*channels+c]=muted?0:qBound(-1.0f,value[c]*qBound(0.0f,master,1.0f),1.0f);
    }return result;
}
