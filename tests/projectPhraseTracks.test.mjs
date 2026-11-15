import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('recording spills and wraps, retriggers exactly, and never overwrites occupied cells', async () => {
  const store = new Map();
  let writes = 0;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { writes++; store.set(key, value); },
  };
  try {
    const source = ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const url = (suffix) => `data:text/javascript;base64,${Buffer.from(`${source}\n// ${suffix}`).toString('base64')}`;
    const { projectController: controller } = await import(url('record'));
    let notifications = 0;
    controller.subscribe(() => notifications++);
    const state = controller.getState();
    assert.equal(state.tracker.patterns[0].tracks.length, 8);
    assert.ok(state.tracker.patterns[0].tracks.every((track) => track.steps.length === 32));
    controller.createPattern();
    assert.equal(state.tracker.patterns[1].tracks.length, 8);
    controller.setPadTargetTrack('D16', 7);
    controller.setTrackVolume(7, 0.25);
    assert.throws(() => controller.setPadTargetTrack('D16', 8), /track/);
    assert.throws(() => controller.setPadTargetTrack('Z1', 0), /pad/i);
    assert.throws(() => controller.updatePadMetadata('D16', { targetTrack: undefined }), /track/);
    assert.throws(() => controller.setTrackVolume(-1, 0.5), /track/);
    assert.throws(() => controller.setTrackVolume(0, NaN), /volume/);
    assert.throws(() => controller.setTrackVolume(0, 1.01), /volume/);

    controller.updateStep(0, 4, { fx: 'OFF', fxValue: 0 }, 7);
    const event = { note: 'C-4', instrumentId: 0, subTickOffset: 1, velocity: 50, tableId: 4, fx: 'P12' };
    assert.equal(controller.recordHit(0, 4, 7, event), 0);
    assert.equal(controller.recordHit(0, 4, 7, { ...event, velocity: 91, fx: 'DIFFERENT', tableId: 8 }), 0);
    assert.deepEqual(state.tracker.patterns[0].tracks[0].steps[4], { ...event, velocity: 91 });
    assert.equal(controller.recordHit(0, 4, 7, { ...event, note: 'D-4' }), 1);
    assert.equal(controller.recordHit(0, 4, 7, { ...event, subTickOffset: 2 }), 2);
    for (let track = 3; track <= 6; track++) {
      assert.equal(controller.recordHit(0, 4, 7, { ...event, instrumentId: track }), track);
    }
    const snapshot = JSON.stringify(state);
    const oldWrites = writes;
    const oldNotifications = notifications;
    assert.equal(controller.recordHit(0, 4, 7, { ...event, instrumentId: 63 }), null);
    assert.equal(JSON.stringify(state), snapshot);
    assert.equal(writes, oldWrites);
    assert.equal(notifications, oldNotifications);
    assert.deepEqual(state.tracker.patterns[0].tracks[7].steps[4], { note: '---', instrumentId: null, fx: 'OFF', fxValue: 0 });

    assert.throws(() => controller.recordHit(0, 32, 0, event), /step index/);
    assert.throws(() => controller.recordHit(0, 0, 8, event), /track index/);
    assert.throws(() => controller.updateStep(-1, 0, {}, 0), /pattern index/);
    assert.throws(() => controller.clearStepNotes(0, [4, 99], 0), /step index/);
    assert.equal(JSON.stringify(state), snapshot);
    controller.clearStepNotes(0, [4], 0);
    assert.equal(state.tracker.patterns[0].tracks[0].steps[4].fx, 'P12');
    controller.updateStep(0, 6, { note: 'E-4', instrumentId: 5, subTickOffset: 0, fx: 'OFF', tableId: 3 }, 3);
    assert.equal(controller.recordHit(0, 6, 7, { note: 'E-4', instrumentId: 5, velocity: 62 }), 3);
    assert.deepEqual(state.tracker.patterns[0].tracks[3].steps[6], {
      note: 'E-4', instrumentId: 5, subTickOffset: 0, fx: 'OFF', tableId: 3, velocity: 62,
    });
    controller.updateStep(0, 7, { note: 'F-4', instrumentId: 5, fx: 'P12' }, 4);
    assert.equal(controller.recordHit(0, 7, 0, { note: 'F-4', instrumentId: 5, subTickOffset: 0, velocity: 33 }), 4);
    assert.deepEqual(state.tracker.patterns[0].tracks[4].steps[7], { note: 'F-4', instrumentId: 5, fx: 'P12', velocity: 33 });
    assert.equal(controller.recordHit(0, 7, 0, { note: 'F-4', instrumentId: 5, subTickOffset: -1 }), 0);
    assert.equal(controller.recordHit(0, 5, 6, { note: 'C-4', instrumentId: 63 }), 6);
    assert.equal(state.tracker.patterns[0].tracks[6].steps[5].velocity, 127);

    const { projectController: restored } = await import(url('reload'));
    assert.deepEqual(restored.getState(), JSON.parse(JSON.stringify(state)));
    assert.equal(restored.getState().sampler.pads.D16.targetTrack, 7);
    assert.equal(restored.getState().settings.trackVolumes[7], 0.25);
    const invalid = JSON.parse(JSON.stringify(state));
    invalid.tracker.patterns[0].tracks[0].steps.pop();
    assert.throws(() => restored.importProjectJson(invalid), /phrase track/);
    assert.deepEqual(restored.getState(), JSON.parse(JSON.stringify(state)));
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
