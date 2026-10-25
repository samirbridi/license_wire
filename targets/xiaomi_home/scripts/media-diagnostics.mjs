export function parseCentralAV(diagnostics, exit) {
  // FourCC strings such as 0x31637661 are not frame dimensions.
  const video = /Video: (h264)[^\r\n]*? (\d{3,5})x(\d{3,5})(?=[,\s]|$)/.exec(diagnostics);
  const audio = /Audio: (aac)[^\r\n]*? (\d+) Hz/.exec(diagnostics);
  const audioData = /audio:(\d+)KiB/.exec(diagnostics);
  const result = { exit, videoCodec: video?.[1], width: Number(video?.[2]), height: Number(video?.[3]), audioCodec: audio?.[1], sampleRate: Number(audio?.[2]), decodedAudioKiB: Number(audioData?.[1]) };
  result.pass = exit === 0 && !!video && !!audio && result.width >= 160 && result.width <= 8192 && result.height >= 90 && result.height <= 8192 && result.decodedAudioKiB > 0;
  return result;
}
