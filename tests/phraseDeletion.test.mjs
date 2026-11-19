import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { inlineProjectModules } from './helpers/inlineProjectModules.mjs';

test('batch deletion persists once, preserving effects and unselected notes', async () => {
  const saved = new Map();
  let writes = 0;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => { writes++; saved.set(key, value); },
  };
  try {
    const source = inlineProjectModules(ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText);
    const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { projectController } = await import(url);
    projectController.updateStep(0, 0, { note: 'C-4', instrumentId: 0, fx: 'V01', subTickOffset: -2 });
    projectController.updateStep(0, 1, { note: 'C-4', instrumentId: 1 });
    projectController.updateStep(0, 2, { note: 'C-4', instrumentId: 2 });
    writes = 0;
    let updates = 0;
    const unsubscribe = projectController.subscribe(() => updates++);
    projectController.clearStepNotes(0, [0, 1, 1]);
    assert.equal(writes, 1);
    assert.equal(updates, 1);
    const steps = JSON.parse(saved.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns[0].tracks[0].steps;
    assert.deepEqual(steps[0], { note: '---', instrumentId: null, fx: 'V01', subTickOffset: 0, tableId: null });
    assert.equal(steps[1].instrumentId, null);
    assert.equal(steps[2].instrumentId, 2);
    projectController.clearStepNotes(0, [0, 1]);
    assert.equal(writes, 1);
    unsubscribe();
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('clearing polyphonic steps removes all events and allows clean recording', async () => {
  const saved = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  try {
    const source = inlineProjectModules(ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText);
    const url = `data:text/javascript;base64,${Buffer.from(`${source}\n// polyphonic deletion`).toString('base64')}`;
    const { projectController } = await import(url);
    const event = (id, note) => ({
      id, note, instrumentId: 0, padId: 0, velocity: 127, subTickOffset: 0,
      playMode: 'one-shot', sliceStartFrame: 0, sliceEndFrame: 1, isReversed: false,
    });
    const first = event('first', 'C-4');
    const second = event('second', 'E-4');
    const replacement = event('replacement', 'G-4');
    assert.equal(projectController.recordPolyphonicHit(0, 0, 0, first), 0);
    assert.equal(projectController.recordPolyphonicHit(0, 0, 0, second), 0);
    projectController.updateStep(0, 1, { events: [first] });
    projectController.updateStep(0, 2, { events: [] });
    projectController.clearStepNotes(0, [0, 1, 2]);

    const steps = projectController.getState().tracker.patterns[0].tracks[0].steps;
    for (const step of steps.slice(0, 3)) {
      assert.equal(step.note, '---');
      assert.equal(step.instrumentId, null);
      assert.equal(step.events, undefined);
    }
    const stored = JSON.parse(saved.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns[0].tracks[0].steps;
    assert.ok(stored.slice(0, 3).every((step) => !('events' in step)));
    assert.equal(projectController.recordPolyphonicHit(0, 0, 0, replacement), 0);
    assert.deepEqual(steps[0].events, [replacement]);
    assert.equal(steps[0].note, 'G-4');
    assert.equal(projectController.recordPolyphonicHit(0, 1, 0, replacement), 0);
    assert.equal(projectController.recordPolyphonicHit(0, 2, 0, replacement), 0);
    assert.deepEqual(steps[1].events, [replacement]);
    assert.deepEqual(steps[2].events, [replacement]);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
