import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('legacy 64-step phrases split without losing notes, tables, or active selection', async () => {
  const steps = Array.from({ length: 64 }, (_, index) => ({
    note: index === 63 ? 'D-4' : '---', sampleId: index === 63 ? 'D16' : '--',
    ...(index === 63 ? { fx: 'P12', subTickOffset: -3, tableId: 7 } : {}),
  }));
  const original = {
    settings: { activePatternIndex: 1, bpm: 120, masterVolume: 0.8 },
    sampler: { pads: {} },
    tracker: { patterns: [
      { id: 2, name: 'First', steps },
      { id: 8, name: 'Second', steps: steps.map((step) => ({ ...step })) },
    ], tables: [{ id: 7, name: 'Table', steps: [] }] },
  };
  const initial = JSON.stringify(original);
  const store = new Map([['SP_M8X_PROJECT_STATE_V1', initial]]);
  globalThis.window = {};
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  try {
    const source = ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { projectController } = await import(url);
    const state = projectController.getState();
    assert.equal(state.settings.activePatternIndex, 1);
    assert.deepEqual(state.tracker.patterns.map((pattern) => pattern.id), [2, 8, 9, 10]);
    assert.ok(state.tracker.patterns.every((pattern) => pattern.steps.length === 32));
    assert.deepEqual(state.tracker.patterns[2].steps[31], original.tracker.patterns[0].steps[63]);
    assert.deepEqual(state.tracker.patterns[3].steps[31], original.tracker.patterns[1].steps[63]);
    assert.equal(state.tracker.tables[0].id, 7);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_32_STEPS'), initial);
    assert.equal(JSON.parse(store.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns.length, 4);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('a failed migration backup prevents overwriting the original project and retries safely', async () => {
  const original = JSON.stringify({
    settings: { activePatternIndex: 0, bpm: 120, masterVolume: 0.8 },
    sampler: { pads: {} },
    tracker: { patterns: [{ id: 1, name: 'Old', steps: Array.from({ length: 64 }, () => ({ note: '---', sampleId: '--' })) }] },
  });
  const store = new Map([['SP_M8X_PROJECT_STATE_V1', original]]);
  let blocked = true;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'SP_M8X_PROJECT_STATE_BEFORE_32_STEPS' && blocked) throw new Error('Storage unavailable');
      store.set(key, value);
    },
  };
  const log = console.error;
  console.error = () => {};
  try {
    const source = ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const url = `data:text/javascript;base64,${Buffer.from(`${source}\n// backup failure`).toString('base64')}`;
    const { projectController } = await import(url);
    assert.equal(projectController.hasSaveError(), true);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_V1'), original);
    blocked = false;
    projectController.setBpm(125);
    assert.equal(projectController.hasSaveError(), false);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_32_STEPS'), original);
    assert.equal(JSON.parse(store.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns.length, 2);
  } finally {
    console.error = log;
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
