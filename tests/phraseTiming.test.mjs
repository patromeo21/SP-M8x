import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('64-cell timing pages retain eighth-step offsets and wrap across phrase boundaries', async () => {
  const source = ts.transpileModule(await readFile(new URL('../src/tracker/phraseTiming.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { phraseTimingMarkers } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const steps = Array.from({ length: 32 }, () => ({ sampleId: '--', note: '---' }));
  steps[0] = { sampleId: 'A1', note: 'C-4', subTickOffset: -1 };
  steps[1] = { sampleId: 'A2', note: 'C-4', subTickOffset: 1 };
  steps[16] = { sampleId: 'A3', note: 'C-4', subTickOffset: -2 };
  assert.deepEqual(phraseTimingMarkers(steps, 0), [{ index: 1, tick: 9 }, { index: 16, tick: 126 }]);
  assert.deepEqual(phraseTimingMarkers(steps, 1), [{ index: 0, tick: 127 }]);
});
