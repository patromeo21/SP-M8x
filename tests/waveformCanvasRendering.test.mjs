import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/sampler/waveformCanvasRendering.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { drawStaticWaveform, drawWaveformOverlay, normalizedToCanvasX, pointerXToNormalized, selectWaveformResolution } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const createContext = () => {
  const calls = [];
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    stroke: () => calls.push(['stroke']),
  };
};

test('clears the static canvas when mipmaps are unavailable', () => {
  const ctx = createContext();
  drawStaticWaveform(ctx, 600, 96, null, 0, 1);
  assert.deepEqual(ctx.calls[0], ['fillRect', 0, 0, 600, 96]);
  assert.equal(ctx.calls.some(([name]) => name === 'moveTo'), false);
});

test('selects higher-detail mipmaps when zoom exposes fewer source bins', () => {
  assert.equal(selectWaveformResolution(600, 0, 1), 512);
  assert.equal(selectWaveformResolution(600, 0.5, 1), 4096);
});

test('maps waveform bins, slice positions, and pointer input to the same zoomed coordinates', () => {
  const viewStart = 0.5;
  const viewEnd = 1;
  const marker = 0.75;
  const width = 600;
  assert.equal(normalizedToCanvasX(marker, viewStart, viewEnd, width), 300);
  assert.equal(pointerXToNormalized(150, 100, 100, viewStart, viewEnd), 0.75);

  const levels = Object.fromEntries([64, 512, 4096].map((resolution) => {
    const min = new Float32Array(resolution);
    const max = new Float32Array(resolution);
    return [resolution, { min, max }];
  }));
  levels[4096].min[3072] = -1;
  levels[4096].max[3072] = 1;
  const ctx = createContext();
  drawStaticWaveform(ctx, width, 96, levels, viewStart, viewEnd);

  const peakMove = ctx.calls.find(([name, , y]) => name === 'moveTo' && y < 48);
  assert.ok(peakMove);
  const waveformX = peakMove[1];
  assert.ok(Math.abs(waveformX - normalizedToCanvasX((3072.5 / 4096), viewStart, viewEnd, width)) < 1e-9);
});

test('draws interior slice markers on the aligned overlay canvas', () => {
  const ctx = createContext();
  drawWaveformOverlay(ctx, 600, 96, 0.5, 1, undefined, undefined, [0.75], null);
  assert.deepEqual(ctx.calls[0], ['clearRect', 0, 0, 600, 96]);
  assert.ok(ctx.calls.some(([name, x, y]) => name === 'moveTo' && x === 300 && y === 0));
});
