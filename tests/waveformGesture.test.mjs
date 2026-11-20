import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const code = ts.transpileModule(
  await readFile(new URL('../src/sampler/waveformGesture.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { markerRangeAtPointer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('marker taps preserve an offscreen trim point and empty bounds are ignored', () => {
  const range = { start: 100, end: 900 };
  assert.deepEqual(markerRangeAtPointer(range, 'start', 300, 10, 10, 400, 200, 1000), range);
  assert.deepEqual(markerRangeAtPointer(range, 'start', 300, 10, 20, 400, 0, 1000), range);
});

test('marker movement follows the visible zoom and stays within the valid sample range', () => {
  const range = { start: 100, end: 900 };
  assert.deepEqual(markerRangeAtPointer(range, 'start', 300, 10, 60, 400, 200, 1000), { start: 400, end: 900 });
  assert.deepEqual(markerRangeAtPointer(range, 'start', 300, 10, 1000, 400, 200, 1000), { start: 899, end: 900 });
  assert.deepEqual(markerRangeAtPointer(range, 'end', 900, 10, -1000, 400, 200, 1000), { start: 100, end: 101 });
});
