#pragma once
#include <atomic>
#include <cmath>

// Project (output) frame rate, like a composition rate in a media server: digital outputs (NDI, OMT, web monitor)
// deliver a constant cadence at this rate, repeating or skipping decoded frames. 0 = follow each media file.
// Audio/video sync never depends on it: every Program keeps its own clock and audio timeline.
inline std::atomic<double>& projectFrameRate(){static std::atomic<double> rate{0};return rate;}

// Exact rational form used by NDI/OMT metadata (23.976 = 24000/1001, 29.97 = 30000/1001, 59.94 = 60000/1001).
inline void frameRateRatio(double fps,int& numerator,int& denominator){
    for(const double base:{24.0,30.0,48.0,60.0})if(std::abs(fps-base*1000.0/1001.0)<0.01){numerator=int(base*1000);denominator=1001;return;}
    numerator=int(std::lround(fps*1000));denominator=1000;
}

// The web monitor runs at the project rate up to 30 fps; faster projects send every second frame (50 -> 25, 59.94 -> 29.97).
inline double webFrameRate(){const double project=projectFrameRate().load();return project<=0?30.0:project<=30.5?project:project/2;}
