import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { inlineProjectModules } from './helpers/inlineProjectModules.mjs';

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

const base = {
  note: 'C-4', instrumentId: 3, padId: 3, velocity: 100, subTickOffset: 0,
  playMode: 'gate', sliceStartFrame: 0, sliceEndFrame: 44100, isReversed: false,
};

test('createRecordedStepEvent stamps pad settings and rejects invalid values', async () => {
  const { createRecordedStepEvent } = await import(dataUrl(await compile('../src/project/stepModel.ts')));
  const event = createRecordedStepEvent(base);
  assert.equal(event.note, 'C-4');
  assert.equal(event.playMode, 'gate');
  assert.equal(event.sliceEndFrame, 44100);
  assert.ok(event.id.length > 0);
  assert.equal(createRecordedStepEvent(base).id === event.id, false);
  assert.throws(() => createRecordedStepEvent({ ...base, velocity: 128 }), /velocity/);
  assert.throws(() => createRecordedStepEvent({ ...base, subTickOffset: 5 }), /microtiming/);
  assert.throws(() => createRecordedStepEvent({ ...base, sliceEndFrame: 0 }), /Slice end/);
  assert.throws(() => createRecordedStepEvent({ ...base, playMode: 'stutter' }), /play mode/);
});

test('polyphonic events persist and round-trip through undo/redo', async () => {
  globalThis.window = {};
  const saved = new Map();
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  try {
    const controller = (await import(dataUrl(inlineProjectModules(await compile('../src/project/projectController.ts'))))).projectController;
    const { createRecordedStepEvent } = await import(dataUrl(await compile('../src/project/stepModel.ts')));
    const events = [createRecordedStepEvent(base), createRecordedStepEvent({ ...base, note: 'E-4', subTickOffset: 2 })];
    controller.updateStep(0, 0, { note: 'C-4', instrumentId: 3, events });
    assert.equal(controller.getState().tracker.patterns[0].tracks[0].steps[0].events.length, 2);

    const savedState = JSON.parse(saved.get('SP_M8X_PROJECT_STATE_V1'));
    assert.equal(savedState.tracker.patterns[0].tracks[0].steps[0].events.length, 2);

    assert.equal(controller.undo(), true);
    assert.equal(controller.getState().tracker.patterns[0].tracks[0].steps[0].events, undefined);
    assert.equal(controller.redo(), true);
    const restored = controller.getState().tracker.patterns[0].tracks[0].steps[0].events;
    assert.equal(restored.length, 2);
    assert.deepEqual(restored[1].note, 'E-4');
    assert.equal(restored[1].playMode, 'gate');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('invalid polyphonic events are rejected by step migration', async () => {
  globalThis.window = {};
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  try {
    const controller = (await import(dataUrl(inlineProjectModules(await compile('../src/project/projectController.ts'))))).projectController;
    assert.throws(() => controller.updateStep(0, 0, {
      note: 'C-4', instrumentId: 3,
      events: [{ ...base, id: 'x', velocity: 500 }],
    }), /velocity/);
    assert.throws(() => controller.updateStep(0, 0, { note: 'C-4', instrumentId: 3, events: 'nope' }), /events/);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
