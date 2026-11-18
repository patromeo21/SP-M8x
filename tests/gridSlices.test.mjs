import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['src/sampler/gridSlices.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
});
const { gridSliceRanges } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('grid covers selected region exactly with adjacent frame boundaries', () => {
  const ranges = gridSliceRanges(10, 90, 101, 4);
  const frames = ranges.map(({ startPct, endPct }) => [Math.round(startPct * 101 / 100), Math.round(endPct * 101 / 100)]);
  assert.deepEqual(frames, [[10, 30], [30, 50], [50, 70], [70, 91]]);
  assert.throws(() => gridSliceRanges(0, 3, 100, 4), /fewer frames/);
  const many = gridSliceRanges(0, 100, 101, 32);
  assert.equal(many.length, 32);
  assert.equal(many[0].startPct, 0);
  assert.equal(many[31].endPct, 100);
  for (let i = 1; i < many.length; i++) assert.equal(many[i - 1].endPct, many[i].startPct);
  assert.equal(gridSliceRanges(0, 100, 101, 17).length, 17);
  assert.throws(() => gridSliceRanges(0, 100, 101, 33), /2 to 32/);
});
