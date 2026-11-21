import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('bridge schedules pad slices and signed microtiming and cancels future voices', async () => {
  const context = { currentTime: 1, state: 'running' };
  const triggered = [];
  const stopped = [];
  const stoppedPads = [];
  const releases = [];
  const voices = new Set();
  const sounding = new Set();
  const steps = Array.from({ length: 64 }, () => ({ instrumentId: null, note: '---' }));
  steps[0] = { instrumentId: 0, note: 'D-4', velocity: 64, tableId: 1, subTickOffset: -2 };
  steps[1] = { instrumentId: 0, note: '---', fx: 'OFF' };
  steps[17] = { instrumentId: 0, note: 'C-4', tableId: 1 };
  steps[18] = { instrumentId: 0, note: 'C-4', fx: 'DL', fxValue: 80 };
  steps[32] = { instrumentId: 0, note: 'C-4', tableId: 1 };
  steps[63] = { instrumentId: 0, note: 'C-4', tableId: 1 };
  steps[62] = { instrumentId: 0, note: 'OFF' };
  const otherSteps = Array.from({ length: 32 }, () => ({ instrumentId: null, note: '---' }));
  otherSteps[0] = { instrumentId: 0, note: 'C-4' };
  const tableSteps = Array.from({ length: 512 }, () => ({ pitch: null, volume: null }));
  tableSteps[0] = { pitch: 12, volume: 64 };
  tableSteps[2] = { pitch: -2, volume: null, subTickOffset: 4 };
  tableSteps[3] = { pitch: null, volume: null, subTickOffset: 8, fx: 'PS', fxValue: -12 };
  tableSteps[136] = { pitch: 5, volume: 50 };
  tableSteps[137] = { pitch: null, volume: null, reset: true };
  tableSteps[256] = { pitch: 7, volume: null };
  tableSteps[504] = { pitch: null, volume: 100 };
  globalThis.bridgeTestAudio = {
    getContext: () => context,
    getPadBuffer: (id) => id === 'A1' ? { duration: 2, length: 200, sampleRate: 100 } : undefined,
    triggerPad: (id, options) => {
      triggered.push({ id, options });
      const voice = `voice${triggered.length}`;
      voices.add(voice);
      return voice;
    },
    hasVoice: (id) => voices.has(id),
    isVoiceSounding: (id) => sounding.has(id),
    stopVoice: (id) => stopped.push(id),
    resetPadFxAt: (...args) => stoppedPads.push(args),
    releaseTrackGatedVoicesAt: (...args) => releases.push(args),
  };
  let length = 32;
  globalThis.bridgeTestProject = {
    getState: () => ({
      settings: { activePatternIndex: 0 },
      sampler: { pads: { A1: { volume: 0.7, chokeGroup: 2 } } },
      tracker: { patterns: [{ length, tracks: [{ id: 0, steps }, { id: 1, steps: otherSteps }] }], tables: [{ id: 1, steps: tableSteps }] },
    }),
  };
  try {
    const padIds = ts.transpileModule(await readFile(new URL('../src/sampler/padIds.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const sampleRange = ts.transpileModule(await readFile(new URL('../src/sampler/sampleRange.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const gridSlices = ts.transpileModule(await readFile(new URL('../src/sampler/gridSlices.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace("'./sampleRange'", `'${moduleUrl(sampleRange)}'`);
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerBridge.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.bridgeTestAudio;')}'`)
      .replace("'../project/projectController'", `'${moduleUrl('export const projectController = globalThis.bridgeTestProject;')}'`)
      .replace("'../sampler/padIds'", `'${moduleUrl(padIds)}'`)
      .replace("'../sampler/gridSlices'", `'${moduleUrl(gridSlices)}'`);
    const { trackerBridge } = await import(moduleUrl(source));
    trackerBridge.setPadSettingsProvider(() => ({ startPct: 25, endPct: 75, pitch: 3, playbackMode: 'gate' }));
    trackerBridge.scheduleStep(0, 1.2, 0.125);
    trackerBridge.scheduleStep(1, 1.2, 0.125);
    trackerBridge.scheduleStep(17, 1.5, 0.125);
    trackerBridge.scheduleStep(18, 1.6, 0.125);
    assert.equal(triggered.length, 4);
    assert.equal(triggered[0].options.trackIndex, 0);
    assert.equal(triggered[0].options.gated, true);
    assert.equal(triggered[0].options.padVolume, 0.7);
    assert.equal(triggered[0].options.chokeGroup, 2);
    assert.equal(triggered[1].options.trackIndex, 1, 'parallel track uses its own mixer channel');
    assert.deepEqual(stoppedPads, [['A1', 1.2]], 'phrase FX OFF targets prior voices on its pad');
    assert.equal(triggered[0].options.sliceStart, 0.5);
    assert.equal(triggered[0].options.sliceEnd, 1.5);
    assert.equal(triggered[0].options.semitoneOffset, 5);
    assert.equal(triggered[0].options.volume, 64 / 127);
    assert.deepEqual(triggered[0].options.modulation, [
      { offset: 0, semitoneOffset: 12, volume: 64 / 127 },
      { offset: 0.0390625, semitoneOffset: -2 },
      { offset: 0.0625, fx: { code: 'PS', value: -12 } },
    ]);
    assert.ok(Math.abs(triggered[0].options.scheduledTime - 1.16875) < 1e-8);
    assert.deepEqual(triggered[2].options.modulation, [
      { offset: 0, semitoneOffset: 5, volume: 50 / 127 },
      { offset: 0.015625, fx: { code: 'OFF' } },
    ]);
    assert.deepEqual(triggered[3].options.fx, { code: 'DL', value: 80 });
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 0), [], 'future voices are not displayed');
    context.currentTime = triggered[0].options.scheduledTime + 0.02;
    sounding.add('voice1');
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 0), [1]);
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 1), [], 'the other phrase page is isolated');
    assert.deepEqual(trackerBridge.getPlayingTableTicks(2, 0), [], 'other tables do not show this voice');
    context.currentTime = triggered[2].options.scheduledTime + 0.0001;
    sounding.add('voice3');
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 1), [8], 'page two starts at its phrase-step tick');
    context.currentTime += 1;
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 1), [72], 'page two ticks advance on the audio clock');
    sounding.delete('voice3');
    sounding.delete('voice1');
    assert.deepEqual(trackerBridge.getPlayingTableTicks(1, 0), [], 'ended voice does not show a tick');
    context.currentTime = 1;
    trackerBridge.cancelPending();
    assert.deepEqual(stopped, ['voice1', 'voice2', 'voice3', 'voice4']);
    trackerBridge.scheduleStep(0, 0.5, 0.125);
    assert.equal(triggered.length, 4, 'overdue notes must not fire late');
    length = 64;
    assert.equal(trackerBridge.getStepCount(), 64);
    trackerBridge.scheduleStep(32, 2, 0.125);
    trackerBridge.scheduleStep(62, 2.1, 0.125);
    trackerBridge.scheduleStep(63, 2.2, 0.125);
    assert.deepEqual(releases, [['A1', 0, 2.1]]);
    assert.deepEqual(triggered[4].options.modulation, [{ offset: 0, semitoneOffset: 7 }]);
    assert.deepEqual(triggered[5].options.modulation, [{ offset: 0, volume: 100 / 127 }]);
    length = 16;
    assert.equal(trackerBridge.getStepCount(), 16);
    trackerBridge.setPadSettingsProvider(() => ({ startPct: 0, endPct: 100, pitch: 0, playbackMode: 'one-shot', sliceMarkers: [10, 30, 60] }));
    steps[2] = { instrumentId: 0, note: 'C-4', sliceIndex: 9 };
    trackerBridge.scheduleStep(2, 2.5, 0.125);
    assert.equal(triggered.at(-1).options.sliceStart, 0.3);
    assert.equal(triggered.at(-1).options.sliceEnd, 0.6);
    otherSteps[2] = { instrumentId: 0, note: 'D-4' };
    steps[3] = { instrumentId: 0, note: 'E-4' };
    otherSteps[3] = { instrumentId: 0, note: 'E-4' };
    trackerBridge.scheduleStep(3, 3, 0.125, { stepIndex: 2, firstTrack: 0, lastTrack: 0 });
    assert.equal(triggered.at(-2).options.sliceStart, 0.3);
    assert.deepEqual(triggered.at(-2).options.chokeTrackRange, { stepIndex: 2, firstTrack: 0, lastTrack: 0 });
    assert.equal(triggered.at(-1).options.semitoneOffset, 4, 'unselected tracks continue forward');
  } finally {
    delete globalThis.bridgeTestAudio;
    delete globalThis.bridgeTestProject;
  }
});
