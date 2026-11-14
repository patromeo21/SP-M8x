import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('sample frame offsets survive percentage storage and keep an exclusive end', async () => {
  const code = ts.transpileModule(
    await readFile(new URL('../src/sampler/sampleRange.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const { rangeFromPercent, percentFromFrame } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const length = 2_646_000;
  for (const [start, end] of [[0, 1], [1_234_567, 1_234_568], [length - 1, length], [0, length]]) {
    assert.deepEqual(rangeFromPercent(percentFromFrame(start, length), percentFromFrame(end, length), length), { start, end });
  }
  assert.deepEqual(rangeFromPercent(100, 100, length), { start: length - 1, end: length });
  assert.deepEqual(rangeFromPercent(0, 0, 1), { start: 0, end: 1 });
});
