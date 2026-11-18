import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async () => ts.transpileModule(
  await readFile(new URL('../src/sampler/resamplingBuffer.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('bounce extracts only captured samples and handles wrapped ring-buffer data', async () => {
  const { ResamplingCaptureEngine } = await import(dataUrl(await compile()));
  const engine = new ResamplingCaptureEngine(10);
  engine.startCapture();
  engine.pushFrame(0.1, -0.1);
  engine.pushFrame(0.2, -0.2);
  engine.pushFrame(0.3, -0.3);

  const audioContext = {
    createBuffer: (channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      channels: Array.from({ length: channels }, () => new Float32Array(length)),
      getChannelData(channel) { return this.channels[channel]; },
    }),
  };
  const shortBounce = engine.stopAndExtractBounce(audioContext, 60, 1);
  assert.equal(shortBounce.length, 3);
  assert.deepEqual(
    Array.from(shortBounce.getChannelData(0), (value) => Math.round(value * 10) / 10),
    [0.1, 0.2, 0.3],
  );

  engine.startCapture();
  for (let i = 0; i < 305; i++) engine.pushFrame(i, -i);
  const wrappedBounce = engine.stopAndExtractBounce(audioContext, 60, 1);
  assert.equal(wrappedBounce.length, 40);
  assert.equal(wrappedBounce.getChannelData(0)[0], 265);
  assert.equal(wrappedBounce.getChannelData(0)[39], 304);
});

test('bounce and capture reject invalid lifecycle parameters', async () => {
  const { ResamplingCaptureEngine } = await import(dataUrl(await compile()));
  const engine = new ResamplingCaptureEngine(10);
  const audioContext = { createBuffer() { throw new Error('must not allocate'); } };
  assert.throws(() => engine.stopAndExtractBounce(audioContext, 0, 1), /BPM/);
  assert.throws(() => engine.stopAndExtractBounce(audioContext, 120, 3), /Bounce length/);
  assert.throws(() => engine.stopAndExtractBounce(audioContext, 120, 1), /before any samples/);
  engine.release();
  assert.throws(() => engine.startCapture(), /released/);
});
