import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/sampler/waveformCanvasRendering.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  createWaveformCanvasLayer,
  drawStaticWaveform,
  drawWaveformOverlay,
  normalizedToCanvasX,
  pointerXToNormalized,
  releaseWaveformResources,
  selectWaveformResolution,
  startDemandGatedRender,
} =
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
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
};

const replaceGlobal = (name, value) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
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

test('falls back to the DOM canvas when OffscreenCanvas is unavailable or unsupported', () => {
  const visibleContext = createContext();
  const canvas = { width: 600, height: 96, getContext: () => visibleContext };
  const restoreUnavailable = replaceGlobal('OffscreenCanvas', undefined);
  try {
    const layer = createWaveformCanvasLayer(canvas, false);
    layer.render((context) => assert.equal(context, visibleContext));
  } finally {
    restoreUnavailable();
  }

  class UnsupportedOffscreenCanvas {
    constructor() {
      throw new TypeError('OffscreenCanvas is unsupported');
    }
  }
  const restoreUnsupported = replaceGlobal('OffscreenCanvas', UnsupportedOffscreenCanvas);
  try {
    const layer = createWaveformCanvasLayer(canvas, false);
    layer.render((context) => assert.equal(context, visibleContext));
  } finally {
    restoreUnsupported();
  }

  let unsupportedCanvas;
  class MissingOffscreenContext {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      unsupportedCanvas = this;
    }
    getContext() {
      return null;
    }
  }
  const restoreMissingContext = replaceGlobal('OffscreenCanvas', MissingOffscreenContext);
  try {
    const layer = createWaveformCanvasLayer(canvas, false);
    layer.render((context) => assert.equal(context, visibleContext));
    assert.equal(unsupportedCanvas.width, 0);
    assert.equal(unsupportedCanvas.height, 0);
  } finally {
    restoreMissingContext();
  }
});

test('uses and releases an OffscreenCanvas backing store when available', () => {
  class MockOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.context = createContext();
      this.context.canvas = this;
    }
    getContext() {
      return this.context;
    }
  }

  const restore = replaceGlobal('OffscreenCanvas', MockOffscreenCanvas);
  try {
    const visibleContext = createContext();
    const canvas = { width: 600, height: 96, getContext: () => visibleContext };
    const layer = createWaveformCanvasLayer(canvas, true);
    let offscreen;
    const render = (context) => {
      offscreen = context.canvas;
      context.fillRect(0, 0, 20, 20);
    };
    layer.render(render);
    assert.deepEqual(visibleContext.calls[0], ['clearRect', 0, 0, 600, 96]);
    const drawCall = visibleContext.calls.find(([name]) => name === 'drawImage');
    assert.equal(drawCall[1], offscreen);

    canvas.width = 300;
    canvas.height = 48;
    layer.render(render);
    assert.equal(offscreen.width, 300);
    assert.equal(offscreen.height, 48);

    let terminated = 0;
    releaseWaveformResources([canvas], [layer], { terminate: () => { terminated++; } });
    assert.equal(terminated, 1);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
    assert.equal(offscreen.width, 0);
    assert.equal(offscreen.height, 0);
    layer.render((context) => assert.equal(context, visibleContext));
  } finally {
    restore();
  }
});

test('falls back if the browser cannot present an OffscreenCanvas', () => {
  class MockOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.context = createContext();
      this.context.canvas = this;
    }
    getContext() {
      return this.context;
    }
  }

  const restore = replaceGlobal('OffscreenCanvas', MockOffscreenCanvas);
  try {
    const visibleContext = createContext();
    visibleContext.drawImage = () => { throw new TypeError('OffscreenCanvas presentation is unsupported'); };
    const canvas = { width: 600, height: 96, getContext: () => visibleContext };
    const layer = createWaveformCanvasLayer(canvas, true);
    const usedContexts = [];
    layer.render((context) => {
      usedContexts.push(context);
      context.fillRect(0, 0, 10, 10);
    });

    assert.equal(usedContexts.length, 2);
    assert.notEqual(usedContexts[0], visibleContext);
    assert.equal(usedContexts[1], visibleContext);
    assert.equal(usedContexts[0].canvas.width, 0);
  } finally {
    restore();
  }
});

test('draws once without RAF while idle and cancels the playback loop on cleanup', () => {
  const callbacks = new Map();
  const cancelled = [];
  let nextId = 0;
  const restoreRequest = replaceGlobal('requestAnimationFrame', (callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const restoreCancel = replaceGlobal('cancelAnimationFrame', (id) => cancelled.push(id));
  try {
    let draws = 0;
    const stopIdle = startDemandGatedRender(() => { draws++; }, false);
    assert.equal(draws, 1);
    assert.equal(nextId, 0);
    stopIdle();

    const stopPlayback = startDemandGatedRender(() => { draws++; }, true);
    assert.equal(nextId, 1);
    callbacks.get(1)();
    assert.equal(draws, 2);
    assert.equal(nextId, 2);
    stopPlayback();
    assert.deepEqual(cancelled, [2]);
    callbacks.get(2)();
    assert.equal(draws, 2);
  } finally {
    restoreRequest();
    restoreCancel();
  }
});
