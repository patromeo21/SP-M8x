import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async () => ts.transpileModule(
  await readFile(new URL('../src/fx/VoiceFxPool.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('bipolar voice filter clamps valid controls and rejects non-finite values', async () => {
  const { applyVoiceFilter } = await import(dataUrl(await compile()));
  const filter = {
    type: 'lowpass',
    frequency: { events: [], setTargetAtTime(value, time, constant) { this.events.push([value, time, constant]); } },
    Q: { events: [], setTargetAtTime(value, time, constant) { this.events.push([value, time, constant]); } },
  };
  applyVoiceFilter(filter, { currentTime: 1 }, 2, 30, 1);
  assert.equal(filter.type, 'highpass');
  assert.equal(filter.frequency.events[0][0], 10000);
  assert.equal(filter.Q.events[0][0], 20);
  assert.throws(() => applyVoiceFilter(filter, { currentTime: 1 }, NaN), /must be finite/);
});
