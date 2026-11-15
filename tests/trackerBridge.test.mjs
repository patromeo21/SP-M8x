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
  const voices = new Set();
  const sounding = new Set();
  const steps = Array.from({ length: 32 }, () => ({ instrumentId: null, note: '---' }));
  steps[0] = { instrumentId: 0, note: 'D-4', velocity: 64, tableId: 1, subTickOffset: -2 };
  steps[1] = { instrumentId: 0, note: '---', fx: 'OFF' };
  steps[17] = { instrumentId: 0, note: 'C-4', tableId: 1 };
  steps[18] = { instrumentId: 0, note: 'C-4', fx: 'DL', fxValue: 80 };
  const otherSteps = Array.from({ length: 32 }, () => ({ instrumentId: null, note: '---' }));
  otherSteps[0] = { instrumentId: 0, note: 'C-4' };
  const tableSteps = Array.from({ length: 256 }, () => ({ pitch: null, volume: null }));
  tableSteps[0] = { pitch: 12, volume: 64 };
  tableSteps[2] = { pitch: -2, volume: null };
  tableSteps[136] = { pitch: 5, volume: 50 };
  tableSteps[137] = { pitch: null, volume: null, reset: true };
  globalThis.bridgeTestAudio = {
    getContext: () => context,
    getPadBuffer: (id) => id === 'A1' ? { duration: 2 } : undefined,
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
    stopPadVoicesAt: () => {},
  };
  globalThis.bridgeTestProject = {
    getState: () => ({
      settings: { activePatternIndex: 0 },
      tracker: { patterns: [{ tracks: [{ id: 0, steps }, { id: 1, steps: otherSteps }] }], tables: [{ id: 1, steps: tableSteps }] },
    }),
  };
  try {
    const padIds = ts.transpileModule(await readFile(new URL('../src/sampler/padIds.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerBridge.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.bridgeTestAudio;')}'`)
      .replace("'../project/projectController'", `'${moduleUrl('export const projectController = globalThis.bridgeTestProject;')}'`)
      .replace("'../sampler/padIds'", `'${moduleUrl(padIds)}'`);
    const { trackerBridge } = await import(moduleUrl(source));
    trackerBridge.setPadSettingsProvider(() => ({ startPct: 25, endPct: 75, pitch: 3 }));
    trackerBridge.scheduleStep(0, 1.2, 0.125);
    trackerBridge.scheduleStep(1, 1.2, 0.125);
    trackerBridge.scheduleStep(17, 1.5, 0.125);
    trackerBridge.scheduleStep(18, 1.6, 0.125);
    assert.equal(triggered.length, 4);
    assert.equal(triggered[0].options.trackIndex, 0);
    assert.equal(triggered[1].options.trackIndex, 1, 'parallel track uses its own mixer channel');
    assert.deepEqual(stoppedPads, [['A1', 1.2]], 'phrase FX OFF targets prior voices on its pad');
    assert.equal(triggered[0].options.sliceStart, 0.5);
    assert.equal(triggered[0].options.sliceEnd, 1.5);
    assert.equal(triggered[0].options.semitoneOffset, 5);
    assert.equal(triggered[0].options.volume, 64 / 127);
    assert.deepEqual(triggered[0].options.modulation, [
      { offset: 0, semitoneOffset: 12, volume: 64 / 127 },
      { offset: 0.03125, semitoneOffset: -2 },
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
  } finally {
    delete globalThis.bridgeTestAudio;
    delete globalThis.bridgeTestProject;
  }
});
