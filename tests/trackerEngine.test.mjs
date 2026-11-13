import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('tracker initializes audio and triggers steps against the audio clock', async () => {
  const calls = [];
  const context = { currentTime: 12.5, state: 'running' };
  let interval;
  let resolveStart;
  globalThis.window = {
    setInterval(callback, delay) {
      interval = { callback, delay };
      return 1;
    },
  };
  const originalClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = () => { interval = undefined; };
  globalThis.trackerTestAudio = {
    initialize: () => Promise.resolve(context),
    getContext: () => context,
  };
  globalThis.trackerTestBridge = {
    scheduleStep: (...args) => calls.push(args),
    getStepCount: () => 2,
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
    tracker.start();
    await Promise.resolve();
    assert.equal(interval.delay, 125);
    interval.callback();
    context.currentTime = 13;
    interval.callback();
    interval.callback();
    assert.deepEqual(calls, [[0, 12.5], [1, 13], [0, 13]]);
    tracker.stop();
    assert.equal(interval, undefined);

    globalThis.trackerTestAudio.initialize = () => new Promise((resolve) => { resolveStart = resolve; });
    tracker.start();
    tracker.stop();
    resolveStart(context);
    await Promise.resolve();
    assert.equal(interval, undefined);
  } finally {
    globalThis.clearInterval = originalClearInterval;
    delete globalThis.trackerTestAudio;
    delete globalThis.trackerTestBridge;
    delete globalThis.window;
  }
});
