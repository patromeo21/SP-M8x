import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { inlineProjectModules } from './helpers/inlineProjectModules.mjs';

test('recording stays on the selected track and never spills into adjacent tracks', async () => {
  const store = new Map();
  let writes = 0;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { writes++; store.set(key, value); },
  };
  try {
    const source = inlineProjectModules(ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
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
    controller.setPadVolume('D16', 0.6);
    controller.setPadChokeGroup('D16', 3);
    controller.setTrackVolume(7, 0.25);
    assert.throws(() => controller.setPadTargetTrack('D16', 8), /track/);
    assert.throws(() => controller.setPadChokeGroup('D16', 9), /Choke group/);
    assert.throws(() => controller.setPadVolume('D16', 2), /volume/);
    assert.throws(() => controller.setPadTargetTrack('Z1', 0), /pad/i);
    assert.throws(() => controller.updatePadMetadata('D16', { targetTrack: undefined }), /track/);
    assert.throws(() => controller.setTrackVolume(-1, 0.5), /track/);
    assert.throws(() => controller.setTrackVolume(0, NaN), /volume/);
    assert.throws(() => controller.setTrackVolume(0, 1.01), /volume/);

    controller.setSelectedTrackIndex(2);
    assert.equal(controller.getSelectedTrackIndex(), 2);
    controller.updateStep(0, 4, { fx: 'OFF', fxValue: 0 }, 7);
    const event = { note: 'C-4', instrumentId: 0, subTickOffset: 1, velocity: 50, tableId: 4, fx: 'P12' };
    assert.equal(controller.recordHit(0, 4, 7, event), 2);
    assert.equal(controller.recordHit(0, 4, 7, { ...event, velocity: 91 }), 2);
    assert.deepEqual(state.tracker.patterns[0].tracks[2].steps[4], { ...event, velocity: 91 });
    assert.equal(controller.recordHit(0, 4, 7, { ...event, note: 'D-4' }), 2);
    assert.deepEqual(state.tracker.patterns[0].tracks[2].steps[4], { ...event, note: 'D-4' });
    assert.deepEqual(state.tracker.patterns[0].tracks[3].steps[4], { note: '---', instrumentId: null });
    assert.deepEqual(state.tracker.patterns[0].tracks[7].steps[4], { note: '---', instrumentId: null, fx: 'OFF', fxValue: 0 });
    const snapshot = JSON.stringify(state);
    const oldWrites = writes;
    const oldNotifications = notifications;
    assert.equal(controller.recordHit(0, 4, 7, { ...event, instrumentId: 63 }), 2);
    const recordedSnapshot = JSON.stringify(state);
    assert.notEqual(recordedSnapshot, snapshot);
    assert.equal(writes, oldWrites + 1);
    assert.equal(notifications, oldNotifications + 1);
    assert.equal(state.tracker.patterns[0].tracks[2].steps[4].instrumentId, 63);
    assert.deepEqual(state.tracker.patterns[0].tracks[1].steps[4], { note: '---', instrumentId: null });
    assert.throws(() => controller.recordHit(0, 4, 7, { ...event, instrumentId: 64 }), /instrument ID/);
    assert.equal(JSON.stringify(state), recordedSnapshot);

    assert.throws(() => controller.recordHit(0, 32, 0, event), /step index/);
    assert.throws(() => controller.recordHit(0, 0, 8, event), /track index/);
    assert.throws(() => controller.updateStep(-1, 0, {}, 0), /pattern index/);
    assert.throws(() => controller.clearStepNotes(0, [4, 99], 0), /step index/);
    assert.equal(JSON.stringify(state), recordedSnapshot);
    controller.clearStepNotes(0, [4], 0);
    assert.equal(state.tracker.patterns[0].tracks[7].steps[4].fx, 'OFF');
    controller.setSelectedTrackIndex(3);
    controller.updateStep(0, 6, { note: 'E-4', instrumentId: 5, subTickOffset: 0, fx: 'OFF', tableId: 3 }, 3);
    assert.equal(controller.recordHit(0, 6, 7, { note: 'E-4', instrumentId: 5, velocity: 62 }), 3);
    assert.deepEqual(state.tracker.patterns[0].tracks[3].steps[6], {
      note: 'E-4', instrumentId: 5, subTickOffset: 0, fx: 'OFF', tableId: 3, velocity: 62,
    });
    controller.setSelectedTrackIndex(4);
    controller.updateStep(0, 7, { note: 'F-4', instrumentId: 5, fx: 'P12' }, 4);
    assert.equal(controller.recordHit(0, 7, 0, { note: 'F-4', instrumentId: 5, subTickOffset: 0, velocity: 33 }), 4);
    assert.deepEqual(state.tracker.patterns[0].tracks[4].steps[7], { note: 'F-4', instrumentId: 5, fx: 'P12', velocity: 33 });
    controller.setSelectedTrackIndex(0);
    assert.equal(controller.recordHit(0, 7, 0, { note: 'F-4', instrumentId: 5, subTickOffset: -1 }), 0);
    controller.setSelectedTrackIndex(6);
    assert.equal(controller.recordHit(0, 5, 6, { note: 'C-4', instrumentId: 63 }), 6);
    assert.equal(state.tracker.patterns[0].tracks[6].steps[5].velocity, 127);
    assert.equal(state.sampler.pads.A1.sliActive, false);
    controller.updatePadMetadata('A1', { sliActive: true });
    controller.setSelectedTrackIndex(0);
    assert.equal(controller.recordHit(0, 8, 0, { note: 'C-4', instrumentId: 0, sliceIndex: 1 }), 0);
    assert.equal(controller.recordHit(0, 8, 0, { note: 'C-4', instrumentId: 0, sliceIndex: 2 }), 0);
    assert.equal(state.tracker.patterns[0].tracks[0].steps[8].sliceIndex, 2);
    assert.deepEqual(state.tracker.patterns[0].tracks[1].steps[8], { note: '---', instrumentId: null });
    assert.throws(() => controller.recordHit(0, 9, 0, { note: 'C-4', instrumentId: 0, sliceIndex: 0 }), /slice index/);

    const { projectController: restored } = await import(url('reload'));
    assert.deepEqual(restored.getState(), JSON.parse(JSON.stringify(state)));
    assert.equal(restored.getState().sampler.pads.D16.targetTrack, 7);
    assert.equal(restored.getState().sampler.pads.D16.volume, 0.6);
    assert.equal(restored.getState().sampler.pads.D16.chokeGroup, 3);
    assert.equal(restored.getState().sampler.pads.A1.sliActive, true);
    assert.equal(restored.getState().tracker.patterns[0].tracks[0].steps[8].sliceIndex, 2);
    restored.clearStepNotes(0, [8], 0);
    assert.equal(restored.getState().tracker.patterns[0].tracks[0].steps[8].sliceIndex, undefined);
    restored.setSelectedTrackIndex(1);
    assert.equal(restored.recordHit(0, 8, 1, { note: 'C-4', instrumentId: 0 }), 1);
    assert.equal(restored.getState().settings.trackVolumes[7], 0.25);
    restored.setPatternLength(0, 64);
    restored.updateStep(0, 63, { note: 'C-4', instrumentId: 2 }, 3);
    assert.equal(restored.recordRelease(0, 62, 3, 2, -1), true);
    assert.equal(restored.recordRelease(0, 63, 3, 2, 0), false);
    restored.setPatternLength(0, 16);
    assert.throws(() => restored.updateStep(0, 63, {}, 3), /step index/);
    restored.setPatternLength(0, 64);
    assert.equal(restored.getState().tracker.patterns[0].tracks[3].steps[63].instrumentId, 2);
    assert.deepEqual(restored.getState().tracker.patterns[0].tracks[3].steps[62], { note: 'OFF', instrumentId: 2, subTickOffset: -1 });
    const { projectController: lengthReload } = await import(url('length-reload'));
    assert.equal(lengthReload.getState().tracker.patterns[0].length, 64);
    assert.equal(lengthReload.getState().tracker.patterns[0].tracks[3].steps[63].note, 'C-4');
    const invalid = JSON.parse(JSON.stringify(state));
    invalid.tracker.patterns[0].tracks[0].steps.pop();
    assert.throws(() => restored.importProjectJson(invalid), /phrase track/);
    assert.equal(restored.getState().tracker.patterns[0].tracks[3].steps[63].note, 'C-4');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('polyphonic recording appends events and Euclidean generation populates phrase steps', async () => {
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  try {
    const source = inlineProjectModules(ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText);
    const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { projectController: controller } = await import(url);
    const event = (id, note) => ({
      id, note, instrumentId: 0, padId: 0, velocity: 127, subTickOffset: 0,
      playMode: 'one-shot', sliceStartFrame: 0, sliceEndFrame: 1, isReversed: false,
    });

    assert.equal(controller.recordPolyphonicHit(0, 0, 0, event('first', 'C-4')), 0);
    assert.equal(controller.recordPolyphonicHit(0, 0, 0, event('second', 'E-4')), 0);
    assert.deepEqual(
      controller.getState().tracker.patterns[0].tracks[0].steps[0].events.map(({ id }) => id),
      ['first', 'second'],
    );

    controller.setSelectedTrackIndex(4);
    const liveHits = Array.from({ length: 4 }, (_, index) => event(`live-${index}`, 'C-4'));
    for (const liveHit of liveHits) {
      controller.recordLiveHit(0, 1, {
        note: liveHit.note, instrumentId: liveHit.instrumentId, velocity: liveHit.velocity,
        subTickOffset: liveHit.subTickOffset,
      }, liveHit);
    }
    assert.deepEqual(
      controller.getState().tracker.patterns[0].tracks[4].steps[1].events.map(({ id }) => id),
      ['live-1', 'live-2', 'live-3'],
    );
    assert.deepEqual(controller.getState().tracker.patterns[0].tracks[3].steps[1], { note: '---', instrumentId: null });
    controller.updateStep(0, 1, { note: 'D-4', fx: 'FL', fxValue: 24 }, 4);
    const manuallyEdited = controller.getState().tracker.patterns[0].tracks[4].steps[1];
    assert.equal(manuallyEdited.note, 'D-4');
    assert.equal(manuallyEdited.fx, 'FL');
    assert.equal(manuallyEdited.fxValue, 24);
    assert.equal(manuallyEdited.events, undefined);

    controller.applyEuclideanPattern(0, 1, [true, false, true], 2);
    const steps = controller.getState().tracker.patterns[0].tracks[1].steps;
    assert.deepEqual(steps.slice(0, 3).map(({ note, instrumentId }) => [note, instrumentId]), [
      ['C-4', 2], ['---', null], ['C-4', 2],
    ]);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('control-all offsets, punch replacement, and pad polyphony helpers validate and persist', async () => {
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  try {
    const source = inlineProjectModules(ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText);
    const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { projectController: controller } = await import(url);
    const event = {
      id: 'poly-a1', note: 'E-4', instrumentId: 0, padId: 0, velocity: 90, subTickOffset: 1,
      playMode: 'one-shot', sliceStartFrame: 0, sliceEndFrame: 10, isReversed: false,
    };

    controller.setPadVolume('A1', 0.5);
    controller.setTrackVolume(0, 0.4);
    controller.applyControlAll({ padVolumeOffset: 0.2, trackVolumeOffset: -0.1 });
    assert.ok(Math.abs(controller.getState().sampler.pads.A1.volume - 0.7) < 1e-12);
    assert.ok(Math.abs(controller.getState().settings.trackVolumes[0] - 0.3) < 1e-12);
    assert.throws(() => controller.applyControlAll({ padVolumeOffset: NaN }), /finite/);

    controller.updateStep(0, 0, { note: 'C-4', instrumentId: 0, fx: 'FL', tableId: 2 });
    controller.punchReplaceLane(0, 0, 0, { note: 'D-4', instrumentId: 1, velocity: 80, subTickOffset: -2 });
    assert.deepEqual(controller.getState().tracker.patterns[0].tracks[0].steps[0], {
      note: 'D-4', instrumentId: 1, velocity: 80, subTickOffset: -2,
    });

    controller.setPadPolyphonic('A1', false);
    assert.equal(controller.isPadPolyphonic('A1'), false);
    assert.throws(() => controller.recordPolyphonicHit(0, 1, 0, event), /not configured for polyphonic/);
    assert.equal(controller.recordPadHit(0, 1, 0, event), 0);
    for (let hit = 0; hit < 3; hit++) controller.recordPadHit(0, 1, 0, event);
    assert.equal(controller.getState().tracker.patterns[0].tracks[0].steps[1].events.length, 3);
    controller.setPadPolyphonic('A1', true);
    assert.equal(controller.isPadPolyphonic('A1'), true);
    assert.equal(controller.recordPadHit(0, 2, 0, event), 0);
    assert.deepEqual(controller.getState().tracker.patterns[0].tracks[0].steps[2].events, [event]);
    assert.throws(() => controller.setPadPolyphonic('Z1', true), /pad ID/i);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
