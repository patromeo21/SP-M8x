import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('phrases and reusable tables persist, and table deletion preserves other ticks', async () => {
  const saved = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  try {
    const source = ts.transpileModule(
      await readFile(new URL('../src/project/projectController.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const moduleUrl = (suffix) => `data:text/javascript;base64,${Buffer.from(`${source}\n// ${suffix}`).toString('base64')}`;
    const { projectController: controller } = await import(moduleUrl('first'));
    assert.deepEqual(controller.getTables(), []);
    const id = controller.createTable();
    controller.updateTableStep(id, 0, { pitch: 12, volume: 64 });
    controller.updateTableStep(id, 1, { pitch: -5 });
    controller.updateTableStep(id, 2, { volume: 0 });
    assert.throws(() => controller.updateTableStep(id, 0, { pitch: 25 }), /pitch/);
    assert.throws(() => controller.updateTableStep(id, 0, { volume: -1 }), /volume/);
    controller.createPattern();
    controller.updateStep(1, 0, { note: 'D-4', instrumentId: 17, velocity: 80, tableId: id });
    controller.clearTableSteps(id, [0, 1, 1, 999]);
    const { projectController: restored } = await import(moduleUrl('restored'));
    const state = restored.getState();
    assert.equal(state.settings.activePatternIndex, 1);
    assert.deepEqual(state.tracker.patterns[1].tracks[0].steps[0], { note: 'D-4', instrumentId: 17, velocity: 80, tableId: id });
    assert.deepEqual(restored.getTables()[0].steps.slice(0, 3), [
      { pitch: null, volume: null }, { pitch: null, volume: null }, { pitch: null, volume: 0 },
    ]);
    restored.setActivePattern(0);
    assert.equal(restored.getState().settings.activePatternIndex, 0);
    assert.equal(restored.getTables()[0].steps.length, 256);

    const legacy = restored.getState();
    legacy.tracker.tables = [{
      id: 9, name: 'Legacy', steps: Array.from({ length: 16 }, (_, index) => ({ pitch: index - 8, volume: 64 })),
    }];
    saved.set('SP_M8X_PROJECT_STATE_V1', JSON.stringify(legacy));
    const migratedModule = `${source}\n// migrated`;
    const { projectController: migrated } = await import(`data:text/javascript;base64,${Buffer.from(migratedModule).toString('base64')}`);
    const migratedTicks = migrated.getTables()[0].steps;
    assert.equal(migratedTicks.length, 256);
    assert.deepEqual(migratedTicks.slice(0, 16), migratedTicks.slice(128, 144));
    assert.equal(migratedTicks[127].pitch, null);
    assert.equal(migratedTicks[255].volume, null);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
