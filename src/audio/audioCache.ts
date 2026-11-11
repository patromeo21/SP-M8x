/**
 * SP-M8x Hybrid Music Production Suite
 * audioCache.ts — Runtime AudioBuffer Cache Manager
 * 
 * Separates binary audio data from serialized project state.
 */

class AudioCache {
  private buffers: Map<string, AudioBuffer> = new Map();

  public set(assetId: string, buffer: AudioBuffer): void {
    if (!assetId) return;
    this.buffers.set(assetId, buffer);
  }

  public get(assetId: string): AudioBuffer | undefined {
    if (!assetId) return undefined;
    return this.buffers.get(assetId);
  }

  public has(assetId: string): boolean {
    return this.buffers.has(assetId);
  }

  public remove(assetId: string): boolean {
    return this.buffers.delete(assetId);
  }

  public clear(): void {
    this.buffers.clear();
  }

  public size(): number {
    return this.buffers.size;
  }
}

export const audioCache = new AudioCache();