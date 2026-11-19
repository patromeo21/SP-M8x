import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/sampler/bounceAudio.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { bounceFrameCount, encodeBounceWav } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('calculates exact bar lengths and rejects captures exceeding ring capacity', () => {
  for (const bars of [1, 2, 4, 8]) {
    assert.equal(bounceFrameCount(44100, 120, bars), 88200 * bars);
  }
  assert.throws(() => bounceFrameCount(44100, 40, 8), /30-second/);
  assert.throws(() => bounceFrameCount(44100, 120, 3), /length/);
});

test('encodes an interleaved stereo PCM WAV for persistent pad loading', async () => {
  const channels = [Float32Array.of(-1, 0.5), Float32Array.of(1, -0.5)];
  const blob = encodeBounceWav({ length: 2, sampleRate: 44100, getChannelData: (index) => channels[index] });
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual([44, 46, 48, 50].map((offset) => view.getInt16(offset, true)), [-32768, 32767, 16384, -16384]);
});
