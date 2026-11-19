import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/tracker/barTiming.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { nextBarTime } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('quantizes to the transport bar grid, including the first future bar', () => {
  assert.equal(nextBarTime(5, 120, 4), 5);
  assert.equal(nextBarTime(5, 120, 5), 5);
  assert.equal(nextBarTime(5, 120, 5.1), 7);
  assert.equal(nextBarTime(5, 120, 7), 7);
  assert.equal(nextBarTime(5, 120, 7.01), 9);
});
