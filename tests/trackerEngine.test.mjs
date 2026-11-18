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
  globalThis.trackerTestProject = {
    getState: () => ({ settings: { activePatternIndex: 0 }, tracker: { patterns: [{ length: 2 }, { length: 16 }] } }),
  };

  try {
    const poolSource = ts.transpileModule(
      await readFile(new URL('../src/fx/VoiceFxPool.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const fxSource = ts.transpileModule(
      await readFile(new URL('../src/fx/fxEngine.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText.replace("'./VoiceFxPool'", `'${moduleUrl(poolSource)}'`);
    const { rmxStepIndex } = await import(moduleUrl(fxSource));
    assert.deepEqual([15, 16, 17, 18, 19].map((step) => rmxStepIndex(step, 15, 16, 4)), [15, 0, 1, 2, 15]);
    assert.deepEqual([31, 32, 33].map((step) => rmxStepIndex(step, 31, 32, 2)), [31, 0, 31]);
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerEngine.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'./trackerBridge'", `'${moduleUrl('export const trackerBridge = globalThis.trackerTestBridge;')}'`)
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.trackerTestAudio;')}'`)
      .replace("'../fx/fxEngine'", `'${moduleUrl(fxSource)}'`)
      .replace("'../project/projectController'", `'${moduleUrl('export const projectController = globalThis.trackerTestProject;')}'`);
    const { TrackerEngine } = await import(moduleUrl(source));
    const tracker = new TrackerEngine(120);
    const steps = [];
    const patterns = [];
    tracker.setCallbacks((step) => steps.push(step), () => {}, (index) => patterns.push(index));
    await tracker.start();
    assert.equal(interval.delay, 25);
    assert.deepEqual(calls.map(([step]) => step), [0]);
    assert.ok(Math.abs(calls[0][1] - 12.58) < 1e-8);
    assert.equal(calls[0][2], 0.125);
    assert.equal(tracker.recordPosition(12.55), null);
    assert.deepEqual(tracker.recordPosition(12.58 + 0.125 * 0.7), { step: 1, subTickOffset: -2, patternIndex: 0 });
    context.currentTime = 12.56;
    interval.callback();
    assert.deepEqual(calls.map(([step]) => step), [0, 1]);
    context.currentTime = 12.71;
    interval.callback();
    assert.equal(steps.at(-1), 1);
    assert.deepEqual(calls.map(([step]) => step), [0, 1, 0]);
    assert.equal(tracker.startRmx('B', 1), true);
    context.currentTime = 12.84;
    interval.callback();
    assert.deepEqual(calls.at(-1)[3], { stepIndex: 1, firstTrack: 4, lastTrack: 7 });
    tracker.stopRmx();
    context.currentTime = 12.96;
    interval.callback();
    assert.equal(calls.at(-1)[3], undefined, 'release resumes the unscheduled forward playhead');
    tracker.queuePattern(1);
    context.currentTime = 14.45;
    interval.callback();
    const boundary = calls.find((call) => call[4] === 1);
    assert.equal(boundary[0], 0);
    assert.ok(Math.abs(boundary[1] - 14.58) < 1e-8);
    assert.equal(boundary[5], true);
    assert.deepEqual(patterns, [], 'project changes only when the boundary is heard');
    context.currentTime = 14.581;
    interval.callback();
    assert.deepEqual(patterns, [1]);
    assert.deepEqual(tracker.recordPosition(14.581), { step: 0, subTickOffset: 0, patternIndex: 1 });
    const beforeJump = calls.length;
    context.currentTime = 20;
    interval.callback();
    assert.ok(calls.length - beforeJump < 4, 'missed steps must not be replayed as a burst');
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
    delete globalThis.trackerTestProject;
    delete globalThis.window;
  }
});
