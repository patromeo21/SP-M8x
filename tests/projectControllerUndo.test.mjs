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

async function loadController(saved = new Map()) {
  globalThis.window = {};
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const source = inlineProjectModules(await compile('../src/project/projectController.ts'));
  return (await import(dataUrl(`${source}\n// ${Math.random()}`))).projectController;
}

test('undo/redo restores phrases, tables, and BPM without touching pads', async () => {
  try {
    const controller = await loadController();
    assert.equal(controller.canUndo(), false);
    controller.updatePadMetadata('A1', { name: 'KICK' });
    controller.setBpm(140);
    const tableId = controller.createTable();
    controller.updateTableStep(tableId, 0, { pitch: 5 });
    controller.updateStep(0, 0, { note: 'C-4', instrumentId: 3 });

    assert.equal(controller.undo(), true);
    assert.equal(controller.getState().tracker.patterns[0].tracks[0].steps[0].note, '---');
    assert.equal(controller.undo(), true);
    assert.equal(controller.getTables()[0].steps[0].pitch, null);
    assert.equal(controller.getState().sampler.pads.A1.name, 'KICK');
    assert.equal(controller.redo(), true);
    assert.equal(controller.getTables()[0].steps[0].pitch, 5);
    assert.equal(controller.redo(), true);
    assert.equal(controller.getState().tracker.patterns[0].tracks[0].steps[0].note, 'C-4');
    assert.equal(controller.canRedo(), false);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('new edits drop redo history, history is capped at 16 states, and active pattern is clamped', async () => {
  try {
    const controller = await loadController();
    for (let bpm = 121; bpm <= 150; bpm++) controller.setBpm(bpm);
    let undone = 0;
    while (controller.undo()) undone++;
    assert.equal(undone, 15);
    assert.equal(controller.getState().settings.bpm, 135);

    controller.setBpm(100);
    assert.equal(controller.canRedo(), false);

    controller.createPattern();
    controller.undo();
    assert.equal(controller.getState().tracker.patterns.length, 1);
    assert.equal(controller.getState().settings.activePatternIndex, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
