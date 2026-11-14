import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('bridge schedules pad slices and signed microtiming and cancels future voices', async () => {
  const context = { currentTime: 1 };
  const triggered = [];
  const stopped = [];
  globalThis.bridgeTestAudio = {
    getContext: () => context,
    getPadBuffer: (id) => id === 'A1' ? { duration: 2 } : undefined,
    triggerPad: (id, options) => { triggered.push({ id, options }); return `voice${triggered.length}`; },
    stopVoice: (id) => stopped.push(id),
  };
  globalThis.bridgeTestProject = {
    getState: () => ({
      settings: { activePatternIndex: 0 },
      tracker: { patterns: [{ steps: [
        { sampleId: 'A1', note: 'D-4', velocity: 64, tableId: 1, subTickOffset: -2 },
        { sampleId: '--', note: '---' },
      ] }], tables: [{ id: 1, steps: [{ pitch: 12, volume: 64 }, { pitch: null, volume: null }, { pitch: -2, volume: null }] }] },
    }),
  };
  try {
    const source = ts.transpileModule(
      await readFile(new URL('../src/tracker/trackerBridge.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText
      .replace("'../audio/audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.bridgeTestAudio;')}'`)
      .replace("'../project/projectController'", `'${moduleUrl('export const projectController = globalThis.bridgeTestProject;')}'`);
    const { trackerBridge } = await import(moduleUrl(source));
    trackerBridge.setPadSettingsProvider(() => ({ startPct: 25, endPct: 75, pitch: 3 }));
    trackerBridge.scheduleStep(0, 1.2, 0.125);
    trackerBridge.scheduleStep(1, 1.2, 0.125);
    assert.equal(triggered.length, 1);
    assert.equal(triggered[0].options.sliceStart, 0.5);
    assert.equal(triggered[0].options.sliceEnd, 1.5);
    assert.equal(triggered[0].options.semitoneOffset, 5);
    assert.equal(triggered[0].options.volume, 64 / 127);
    assert.deepEqual(triggered[0].options.modulation, [
      { offset: 0, semitoneOffset: 12, volume: 64 / 127 },
      { offset: 0.03125, semitoneOffset: -2 },
    ]);
    assert.ok(Math.abs(triggered[0].options.scheduledTime - 1.16875) < 1e-8);
    trackerBridge.cancelPending();
    assert.deepEqual(stopped, ['voice1']);
    trackerBridge.scheduleStep(0, 0.5, 0.125);
    assert.equal(triggered.length, 1, 'overdue notes must not fire late');
  } finally {
    delete globalThis.bridgeTestAudio;
    delete globalThis.bridgeTestProject;
  }
});
