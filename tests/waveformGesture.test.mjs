import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const code = ts.transpileModule(
  await readFile(new URL('../src/sampler/waveformGesture.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { markerRangeAtPointer, intermediateMarkerFrameAtPointer } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

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

test('intermediate slice markers move across the zoomed view within neighboring frames', () => {
  const neighbors = { start: 200, end: 600 };
  const move = (startX, clientX) =>
    intermediateMarkerFrameAtPointer(neighbors, 400, startX, clientX, 300, 700, 400, 200, 1000);
  assert.equal(move(10, 10), 400);
  assert.equal(move(10, 60), 500);
  assert.equal(move(10, 1000), 599);
  assert.equal(move(10, -1000), 201);
  assert.equal(intermediateMarkerFrameAtPointer({ start: 10, end: 12 }, 11, 0, 10, 0, 16, 16, 200, 1000), 11);
  assert.equal(intermediateMarkerFrameAtPointer(neighbors, 400, 0, 20, 300, 700, 400, 0, 1000), 400);
  assert.equal(intermediateMarkerFrameAtPointer(neighbors, 400, 0, 20, 300, 700, 400, 200, 0), 400);
  assert.equal(intermediateMarkerFrameAtPointer(neighbors, 400, 10, 110, 300, 700, 400, 200, 1000), 599);
});
