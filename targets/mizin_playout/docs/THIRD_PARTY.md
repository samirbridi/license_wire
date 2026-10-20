# Development dependencies and distribution status

This target contains original application code. No Azimuth implementation or artwork is included. Product name is provisional.

- Qt 6.10.2 open-source SDK from official Qt archives via aqtinstall 3.3.0. Review the selected Qt module licenses and notices before distributing a package; preserve corresponding source/build information and relinking rights as applicable.
- Qt Multimedia logs identify its native backend as FFmpeg 7.1.2, LGPL 2.1 or later. Exact binaries/configuration/notices must be included in the distribution inventory; do not infer all dependency terms only from the framework name.
- Optional CPU Lanczos uses public functions from the already deployed swscale-8.dll and avutil-59.dll. ABI majors are checked before use. The runtime's own swscale_license result is LGPL version 2.1 or later; its hash and version are recorded in evidence/scaler-runtime.json. No QA-only GPL FFmpeg library is loaded for this feature.
- GPU Lanczos uses original GLSL and Qt OpenGL/OpenGLWidgets modules. Their dynamically deployed Qt libraries follow the corresponding Qt open-source licensing obligations. No third-party shader code or AI model is bundled.
- BtbN FFmpeg GPL shared build is a **QA-only tool**, downloaded into ignored binaries/qa to generate synthetic fixtures. It is not copied to the application package.
- The bundled Python runtime is used for build orchestration and validation, not required by the compiled application at runtime.

This is a local development package, not a published/signed installer. Production distribution requires the complete dependency/source notice set and packaging validation. No commercial subscription was purchased.
