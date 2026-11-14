import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('waveform uses signed extrema from every channel without losing narrow peaks across chunks', async () => {
  const code = ts.transpileModule(await readFile(new URL('../src/sampler/waveformPeaks.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { createWaveformPeakBuilder } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const left = Float32Array.from([0.1, 0.2, 0.9, 0.1, 0.3, 0.4, 0.2, 0.1]);
  const right = Float32Array.from([0.1, -0.8, 0.1, 0.1, 0.3, 0.4, -0.7, 0.1]);
  const buffer = { length: 8, numberOfChannels: 2, getChannelData: (i) => [left, right][i] };
  const builder = createWaveformPeakBuilder(buffer, 2);
  let iterations = 0;
  while (!builder.process(2)) iterations++;
  assert.ok(iterations > 1);
  assert.ok(Math.abs(builder.peaks.min[0] + 0.8) < 1e-6);
  assert.ok(Math.abs(builder.peaks.max[0] - 0.9) < 1e-6);
  assert.ok(Math.abs(builder.peaks.min[1] + 0.7) < 1e-6);
  assert.ok(Math.abs(builder.peaks.max[1] - 0.4) < 1e-6);
});
