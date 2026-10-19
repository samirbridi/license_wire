# Development dependencies and distribution status

This target contains original application code. No Azimuth implementation or artwork is included. Product name is provisional.

- Qt 6.10.2 open-source SDK from official Qt archives via aqtinstall 3.3.0. Review the selected Qt module licenses and notices before distributing a package; preserve corresponding source/build information and relinking rights as applicable.
- Qt Multimedia ships a native FFmpeg build. Its exact binaries/configuration/notices must be included in the distribution inventory; do not infer terms only from the framework name.
- BtbN FFmpeg GPL shared build is a **QA-only tool**, downloaded into ignored binaries/qa to generate synthetic fixtures. It is not copied to the application package.
- The bundled Python runtime is used for build orchestration and validation, not required by the compiled application at runtime.

This is a local development package, not a published/signed installer. Production distribution requires the complete dependency/source notice set and packaging validation. No commercial subscription was purchased.
