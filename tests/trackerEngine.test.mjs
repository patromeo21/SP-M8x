import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

const grooveSource = ts.transpileModule(
  await readFile(new URL('../src/tracker/groovePresets.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

test('groove presets produce the expected slots without overwriting the target tail', async () => {
  const { GROOVE_PRESETS, isGroovePreset, getGrooveSlots, getGrooveDelayedSteps, getGrooveMetronomePulses, writeGrooveSlots } =
    await import(moduleUrl(grooveSource));
  const patterns = [[8, 8, 8, 8], [9, 7, 9, 7], [10, 6, 10, 6], [11, 5, 11, 5], [12, 4, 12, 4], [9, 9, 7, 7]];
  assert.equal(isGroovePreset('9-8'), false);
  for (const [index, preset] of GROOVE_PRESETS.entries()) {
    assert.equal(isGroovePreset(preset), true);
    assert.deepEqual([...getGrooveSlots(preset)], Array.from({ length: 16 }, (_, step) => patterns[index][step % 4]));
    const target = new Uint8Array(8).fill(99);
    writeGrooveSlots(preset, target, 5);
    assert.deepEqual([...target], [...patterns[index], patterns[index][0], 99, 99, 99]);
    assert.deepEqual([...getGrooveSlots(preset, 3)], patterns[index].slice(0, 3));
    assert.deepEqual(getGrooveMetronomePulses(preset), [
      { step: 0, downbeat: true },
      { step: 4, downbeat: false },
      { step: 8, downbeat: false },
      { step: 12, downbeat: false },
    ]);
    assert.deepEqual(getGrooveDelayedSteps(preset).slice(0, 4),
      index === 0 ? [false, false, false, false] :
        index === 5 ? [false, true, true, true] : [false, true, false, true]);
  }
});

test('lookahead schedules on the audio clock, records microtiming and cancels future notes', async () => {
  const calls = [];
  const metronomeCalls = [];
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
    stopAllVoices() {},
    scheduleMetronomeClick: (...args) => metronomeCalls.push(args),
    cancelMetronomeClicks() {},
  };
  globalThis.trackerTestBridge = {
    scheduleStep: (...args) => calls.push(args),
    getStepCount: () => 2,
    cancelPending: () => { cancelled++; },
  };
  globalThis.trackerTestProject = {
    getState: () => ({
      settings: { activePatternIndex: 0 },
      tracker: {
        patterns: [2, 16].map((length) => ({
          length,
          tracks: Array.from({ length: 8 }, (_, id) => ({
            id,
            steps: Array.from({ length }, () => ({})),
          })),
        })),
      },
    }),
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
    const stepTypesSource = ts.transpileModule(
      await readFile(new URL('../src/tracker/stepTypes.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const trigSource = ts.transpileModule(
      await readFile(new URL('../src/tracker/trigEvaluator.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText.replace("'./stepTypes'", `'${moduleUrl(stepTypesSource)}'`);
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerEngine.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'./trackerBridge'", `'${moduleUrl('export const trackerBridge = globalThis.trackerTestBridge;')}'`)
      .replace("'./groovePresets'", `'${moduleUrl(grooveSource)}'`)
      .replace("'./trigEvaluator'", `'${moduleUrl(trigSource)}'`)
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.trackerTestAudio;')}'`)
      .replace("'../fx/fxEngine'", `'${moduleUrl(fxSource)}'`)
      .replace("'../project/projectController'", `'${moduleUrl('export const projectController = globalThis.trackerTestProject;')}'`);
    const { TrackerEngine } = await import(moduleUrl(source));
    const tracker = new TrackerEngine(120);
    const steps = [];
    const patterns = [];
    tracker.setMetronome(true);
    tracker.setCallbacks((step) => steps.push(step), () => {}, (index) => patterns.push(index));
    await tracker.start();
    assert.equal(interval.delay, 25);
    assert.deepEqual(calls.map(([step]) => step), [0]);
    assert.ok(Math.abs(calls[0][1] - 12.58) < 1e-8);
    assert.equal(calls[0][2], 0.125);
    assert.deepEqual(metronomeCalls, [[12.58, 0.15, true]]);
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

    const grooveTracker = new TrackerEngine(120);
    await grooveTracker.start();
    grooveTracker.setGroovePreset('9-7');
    const longStepDuration = 9 * 60 / 120 / 32;
    assert.deepEqual(
      grooveTracker.recordPosition(grooveTracker.startTime + longStepDuration * 0.7),
      { step: 1, subTickOffset: -3, patternIndex: 0 },
    );
    grooveTracker.setMetronome(true);
    context.currentTime = grooveTracker.startTime + 0.36;
    grooveTracker.tick();
    assert.deepEqual(metronomeCalls.at(-1), [grooveTracker.startTime + 0.5, 0.15, false]);
    grooveTracker.stop();

    globalThis.trackerTestProject.getState = () => ({
      settings: { activePatternIndex: 0 },
      tracker: { patterns: [{ length: 64, tracks: Array.from({ length: 8 }, (_, id) => ({
        id, steps: Array.from({ length: 64 }, () => ({})),
      })) }] },
    });
    const { GROOVE_PRESETS, getGrooveSlots } = await import(moduleUrl(grooveSource));
    for (const preset of GROOVE_PRESETS) {
      const positions = [];
      const clock = new TrackerEngine(120);
      clock.setGroovePreset(preset);
      clock.setCallbacks(() => {}, () => {}, undefined, (step, subtick) => positions.push([step, subtick]));
      context.currentTime = 100;
      await clock.start();
      const start = clock.startTime;
      const slots = getGrooveSlots(preset);
      let elapsed = 0;
      for (let step = 0; step < 64; step++) {
        const duration = slots[step % 16] / 32 * 0.5;
        context.currentTime = start + elapsed + duration * 0.3;
        clock.tick();
        assert.deepEqual(positions.at(-1), [step, 2], `${preset} step ${step}`);
        if (step % 16 === 0) assert.ok(Math.abs(elapsed - step / 16 * 2) < 1e-8);
        elapsed += duration;
      }
      assert.ok(Math.abs(elapsed - 8) < 1e-8, `${preset} four bars`);
      context.currentTime = start + elapsed + 0.001;
      clock.tick();
      assert.deepEqual(positions.at(-1), [0, 0], `${preset} phrase wrap`);
      clock.pause();
      await clock.resume();
      clock.stop();
    }

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
