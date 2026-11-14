import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('lookahead schedules on the audio clock, records microtiming and cancels future notes', async () => {
  const calls = [];
  const context = { currentTime: 12.5, state: 'running' };
  let interval;
  let cancelled = 0;
  let resolveStart;
  globalThis.window = {
    setInterval(callback, delay) { interval = { callback, delay }; return 1; },
    clearInterval() { interval = undefined; },
  };
  globalThis.trackerTestAudio = {
    initialize: () => Promise.resolve(context),
    getContext: () => context,
  };
  globalThis.trackerTestBridge = {
    scheduleStep: (...args) => calls.push(args),
    getStepCount: () => 2,
    cancelPending: () => { cancelled++; },
  };

  try {
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerEngine.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'./trackerBridge'", `'${moduleUrl('export const trackerBridge = globalThis.trackerTestBridge;')}'`)
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.trackerTestAudio;')}'`);
    const { TrackerEngine } = await import(moduleUrl(source));
    const tracker = new TrackerEngine(120);
    const steps = [];
    tracker.setCallbacks((step) => steps.push(step), () => {});
    await tracker.start();
    assert.equal(interval.delay, 25);
    assert.deepEqual(calls.map(([step]) => step), [0]);
    assert.ok(Math.abs(calls[0][1] - 12.58) < 1e-8);
    assert.equal(calls[0][2], 0.125);
    assert.equal(tracker.recordPosition(12.55), null);
    assert.deepEqual(tracker.recordPosition(12.58 + 0.125 * 0.7), { step: 1, subTickOffset: -2 });
    context.currentTime = 12.56;
    interval.callback();
    assert.deepEqual(calls.map(([step]) => step), [0, 1]);
    context.currentTime = 12.71;
    interval.callback();
    assert.equal(steps.at(-1), 1);
    assert.deepEqual(calls.map(([step]) => step), [0, 1, 0]);
    context.currentTime = 20;
    interval.callback();
    assert.ok(calls.length < 8, 'missed steps must not be replayed as a burst');
    tracker.stop();
    assert.equal(interval, undefined);
    assert.equal(cancelled, 1);
    assert.equal(tracker.recordPosition(20), null);

    globalThis.trackerTestAudio.initialize = () => new Promise((resolve) => { resolveStart = resolve; });
    const pending = tracker.start();
    tracker.stop();
    resolveStart(context);
    await pending;
    assert.equal(interval, undefined);
  } finally {
    delete globalThis.trackerTestAudio;
    delete globalThis.trackerTestBridge;
    delete globalThis.window;
  }
});
