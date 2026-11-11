/**
 * SP-M8x Hybrid Music Production Suite
 * sampleLoader.ts — Audio File Import & Decoding Service
 */

export class SampleLoader {
  /**
   * Read and decode an uploaded File object into a playable AudioBuffer
   */
  public static async loadAudioFile(file: File, ctx: AudioContext): Promise<AudioBuffer | null> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log(`[SampleLoader] Successfully decoded audio file: ${file.name} (${audioBuffer.duration.toFixed(2)}s)`);
      return audioBuffer;
    } catch (err) {
      console.error(`[SampleLoader] Failed to decode audio file "${file.name}":`, err);
      return null;
    }
  }
}