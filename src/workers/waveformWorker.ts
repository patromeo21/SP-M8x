/* ==========================================================================
   SP-M8x Waveform Mipmap Worker (Off-main-thread DSP)
   Computes multi-resolution peak mipmaps from raw PCM float data.
   ========================================================================== */

interface WaveformWorkerRequest {
  id: string;
  channelData: Float32Array;
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
  const { id, channelData } = e.data;
  if (!channelData || channelData.length === 0) return;

  const resolutions = [64, 512, 4096];
  const mipmaps: WaveformWorkerResponse['mipmaps'] = {};

  for (const res of resolutions) {
    const blockSize = Math.max(1, Math.floor(channelData.length / res));
    const minArr = new Float32Array(res);
    const maxArr = new Float32Array(res);

    for (let i = 0; i < res; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);

      for (let j = start; j < end; j++) {
        const val = channelData[j];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Replace absolute-zero sentinel with 0
      minArr[i] = min === 1.0 ? 0 : min;
      maxArr[i] = max === -1.0 ? 0 : max;
    }

    mipmaps[res] = { min: minArr, max: maxArr };
  }

  // Post mipmaps back to main thread (data is copied, no manual transfer needed)
  self.postMessage({ id, mipmaps } as WaveformWorkerResponse);
};
