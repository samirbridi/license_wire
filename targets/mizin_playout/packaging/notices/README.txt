Dependency notice/source provenance for the Windows private preview

The LGPL/GPL/Qt exception texts are unmodified originals from Qt qtbase v6.10.2
LICENSES/. FFmpeg-LGPL-2.1.txt is from FFmpeg n7.1.2 COPYING.LGPLv2.1.
https://github.com/qt/qtbase/tree/v6.10.2/LICENSES
https://github.com/FFmpeg/FFmpeg/tree/n7.1.2

The package also retains the supplied Qt SDK SPDX SBOMs, including third-party
copyrights/license expressions, OMT MIT notice, NDI runtime vendor/third-party and header notices,
NSIS notices and exact deployed FFmpeg runtime configuration/license.

The webrtc-monitor folder holds the license texts and SOURCES.json (repositories and exact
commits) of libdatachannel and its submodules, Mbed TLS and Opus used by the local web monitor.

Sources:
https://download.qt.io/archive/qt/6.10/6.10.2/submodules/
https://ffmpeg.org/releases/ffmpeg-7.1.2.tar.xz
https://github.com/openmediatransport/libomtnet/tree/v1.0.0.19
https://sourceforge.net/projects/nsis/files/NSIS%203/3.13/

SDK SBOMs describe SDK modules, not an assertion that every listed component is
loaded by this app. Exact payload binaries are listed in package-manifest.json.
The app dynamically links Qt/FFmpeg; compatible modified libraries can be relinked
or replaced. No restriction on debugging such modifications is imposed here.

Matching Qt 6.10.2/FFmpeg 7.1.2 upstream archives, SDK build configuration and
source SPDX are indexed with SHA-256 in dependency-sources.json and made available
alongside the preview at https://playoutmizin.pages.dev/updates/sources/qt-6.10.2-ffmpeg-7.1.2/.
Original third-party license/notice and attribution files from those archives are
retained in licenses/upstream/. A bit-identical rebuild is not asserted. The
original application source for the recorded commit is bundled in source/.
