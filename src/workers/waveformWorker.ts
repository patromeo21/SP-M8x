/* ==========================================================================
   SP-M8x Waveform Mipmap Worker (Off-main-thread DSP)
   Computes multi-resolution peak mipmaps from raw PCM float data.
   ========================================================================== */

interface WaveformWorkerRequest {
  id: string;
  channels: Float32Array[];
}

interface WaveformWorkerResponse {
  id: string;
  mipmaps: {
    [resolution: number]: {
      min: Float32Array;
      max: Float32Array;
    };
  };
}

self.onmessage = (e: MessageEvent<WaveformWorkerRequest>) => {
  const { id, channels } = e.data;
  if (!channels?.length || channels[0].length === 0) return;

  const resolutions = [64, 512, 4096];
  const sampleLength = channels[0].length;
  const mipmaps: WaveformWorkerResponse['mipmaps'] = {};

  for (const res of resolutions) {
    const minArr = new Float32Array(res);
    const maxArr = new Float32Array(res);

    for (let i = 0; i < res; i++) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const start = Math.floor(i * sampleLength / res);
      const end = Math.floor((i + 1) * sampleLength / res);

      for (const channelData of channels) {
        for (let j = start; j < Math.min(end, channelData.length); j++) {
          const val = channelData[j];
          if (Number.isFinite(val)) {
            if (val < min) min = val;
            if (val > max) max = val;
          }
        }
      }

      minArr[i] = Number.isFinite(min) ? min : 0;
      maxArr[i] = Number.isFinite(max) ? max : 0;
    }

    mipmaps[res] = { min: minArr, max: maxArr };
  }

  // Post mipmaps back to main thread (data is copied, no manual transfer needed)
  self.postMessage({ id, mipmaps } as WaveformWorkerResponse);
};
