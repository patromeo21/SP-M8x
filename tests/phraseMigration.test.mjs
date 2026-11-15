import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('legacy 64-step phrases split without losing notes, tables, or active selection', async () => {
  const steps = Array.from({ length: 64 }, (_, index) => ({
    note: index === 63 ? 'D-4' : '---', sampleId: index === 63 ? 'D16' : '--',
    ...(index === 63 ? { fx: 'P12', fxValue: 0, subTickOffset: -3, velocity: 37, tableId: 7 } :
      index === 4 ? { fx: 'OFF', fxValue: 9, tableId: 5 } : {}),
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
    assert.ok(state.tracker.patterns.every((pattern) => pattern.tracks.length === 8 && pattern.tracks.every((track) => track.steps.length === 32)));
    const last = { note: 'D-4', instrumentId: 63, fx: 'P12', fxValue: 0, subTickOffset: -3, velocity: 37, tableId: 7 };
    assert.deepEqual(state.tracker.patterns[2].tracks[0].steps[31], last);
    assert.deepEqual(state.tracker.patterns[3].tracks[0].steps[31], last);
    assert.deepEqual(state.tracker.patterns[0].tracks[0].steps[4], { note: '---', instrumentId: null, fx: 'OFF', fxValue: 9, tableId: 5 });
    assert.equal(state.tracker.tables[0].id, 7);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS'), initial);
    assert.equal(JSON.parse(store.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns.length, 4);
    const { projectController: restored } = await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// reload`).toString('base64')}`);
    assert.deepEqual(restored.getState(), state);
    assert.deepEqual(state.settings.trackVolumes, Array(8).fill(1));
    assert.equal(Object.keys(state.sampler.pads).length, 64);
    assert.equal(state.sampler.pads.D16.targetTrack, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('different existing backups survive and each migrated original gets a separate backup', async () => {
  const legacy = {
    settings: { activePatternIndex: 0, bpm: 120, masterVolume: 0.8, trackVolumes: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1] },
    sampler: { pads: {} },
    tracker: { patterns: [{ id: 1, name: 'Old', steps: [{ note: 'C-4', sampleId: 'A1' }] }] },
  };
  const initial = JSON.stringify(legacy);
  const store = new Map([
    ['SP_M8X_PROJECT_STATE_V1', initial],
    ['SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS', 'earlier backup'],
    ['SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_1', 'another backup'],
    ['SP_M8X_PROJECT_STATE_BEFORE_32_STEPS', 'old backup'],
  ]);
  globalThis.window = {};
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  try {
    const source = ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const url = (suffix) => `data:text/javascript;base64,${Buffer.from(`${source}\n// ${suffix}`).toString('base64')}`;
    const { projectController } = await import(url('existing backup'));
    assert.deepEqual(projectController.getState().settings.trackVolumes, legacy.settings.trackVolumes);
    assert.equal(projectController.hasSaveError(), false);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS'), 'earlier backup');
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_1'), 'another backup');
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_2'), initial);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_32_STEPS'), 'old backup');
    store.set('SP_M8X_PROJECT_STATE_V1', initial);
    await import(url('repeat migration'));
    assert.equal(store.has('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_3'), false);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('load failures keep a frozen read-only default and never overwrite storage', async () => {
  const legacy = JSON.stringify({
    settings: { activePatternIndex: 0, bpm: 120, masterVolume: 0.8 },
    sampler: { pads: {} },
    tracker: { patterns: [{ id: 1, name: 'Old', steps: [{ note: 'C-4', sampleId: 'X99' }] }] },
  });
  const source = ts.transpileModule(await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = (suffix) => `data:text/javascript;base64,${Buffer.from(`${source}\n// ${suffix}`).toString('base64')}`;
  const log = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  globalThis.window = {};
  try {
    for (const [label, original] of [['bad json', '{'], ['empty json', ''], ['invalid phrase', legacy]]) {
      const store = new Map([['SP_M8X_PROJECT_STATE_V1', original]]);
      let writes = 0;
      globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { writes++; store.set(key, value); } };
      const { projectController } = await import(url(label));
      assert.equal(projectController.hasSaveError(), true);
      assert.equal(projectController.isReadOnly(), true);
      assert.equal(projectController.getState().settings.bpm, 120);
      assert.equal(Object.isFrozen(projectController.getState().tracker.patterns[0].tracks[0].steps[0]), true);
      assert.throws(() => projectController.setBpm(140), /read-only/);
      assert.throws(() => projectController.recordHit(0, 0, 0, { note: 'C-4', instrumentId: 0 }), /read-only/);
      assert.throws(() => projectController.importProjectJson(projectController.getState()), /read-only/);
      assert.equal(store.get('SP_M8X_PROJECT_STATE_V1'), original);
      assert.equal(writes, 0);
      assert.ok(errors.at(-1)[1] instanceof Error);
    }
    let writes = 0;
    let blocked = true;
    const stored = new Map([['SP_M8X_PROJECT_STATE_V1', legacy]]);
    const failure = new Error('Storage access denied');
    globalThis.localStorage = {
      getItem: (key) => { if (blocked) throw failure; return stored.get(key) ?? null; },
      setItem: (key, value) => { writes++; stored.set(key, value); },
    };
    const { projectController } = await import(url('storage denied'));
    assert.equal(projectController.isReadOnly(), true);
    assert.equal(projectController.hasSaveError(), true);
    assert.equal(errors.at(-1)[1], failure);
    blocked = false;
    assert.throws(() => projectController.createPattern(), /read-only/);
    assert.equal(writes, 0);
    assert.equal(stored.get('SP_M8X_PROJECT_STATE_V1'), legacy);
  } finally {
    console.error = log;
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
  const store = new Map([['SP_M8X_PROJECT_STATE_V1', original], ['SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS', 'earlier']]);
  let blocked = true;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      if (key === 'SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_1' && blocked) throw new Error('Storage unavailable');
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
    const differentImport = JSON.parse(original);
    differentImport.tracker.patterns[0].name = 'Another original';
    assert.throws(() => projectController.importProjectJson(differentImport), /Pending migration backup/);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_V1'), original);
    blocked = false;
    projectController.setBpm(125);
    assert.equal(projectController.hasSaveError(), false);
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS'), 'earlier');
    assert.equal(store.get('SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS_1'), original);
    assert.equal(JSON.parse(store.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns.length, 2);
  } finally {
    console.error = log;
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
