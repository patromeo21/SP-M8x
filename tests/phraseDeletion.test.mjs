import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('batch deletion persists once, preserving effects and unselected notes', async () => {
  const saved = new Map();
  let writes = 0;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => { writes++; saved.set(key, value); },
  };
  try {
    const source = ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const { projectController } = await import(url);
    projectController.updateStep(0, 0, { note: 'C-4', sampleId: 'A1', fx: 'V01', subTickOffset: -2 });
    projectController.updateStep(0, 1, { note: 'C-4', sampleId: 'A2' });
    projectController.updateStep(0, 2, { note: 'C-4', sampleId: 'A3' });
    writes = 0;
    let updates = 0;
    const unsubscribe = projectController.subscribe(() => updates++);
    projectController.clearStepNotes(0, [0, 1, 1, 99]);
    assert.equal(writes, 1);
    assert.equal(updates, 1);
    const steps = JSON.parse(saved.get('SP_M8X_PROJECT_STATE_V1')).tracker.patterns[0].steps;
    assert.deepEqual(steps[0], { note: '---', sampleId: '--', fx: 'V01', subTickOffset: 0 });
    assert.equal(steps[1].sampleId, '--');
    assert.equal(steps[2].sampleId, 'A3');
    projectController.clearStepNotes(0, [0, 1]);
    assert.equal(writes, 1);
    unsubscribe();
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
