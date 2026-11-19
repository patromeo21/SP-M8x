import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function fakeParam(events, name) {
  return {
    value: 0,
    cancelAndHoldAtTime: (time) => events.push([name, 'hold', time]),
    setValueAtTime: (value, time) => events.push([name, 'set', value, time]),
    setTargetAtTime: (value, time, constant) => events.push([name, 'target', value, time, constant]),
    exponentialRampToValueAtTime: (value, time) => events.push([name, 'ramp', value, time]),
  };
}

test('table opcodes apply voice effects without allocating Web Audio nodes', async () => {
  const source = await compile('../src/fx/VoiceFxPool.ts');
  const { VoiceFxPool } = await import(dataUrl(source));
  const events = [];
  const slot = {
    wetGain: { gain: fakeParam(events, 'wet') },
    filter: { frequency: fakeParam(events, 'frequency') },
    drive: { gain: fakeParam(events, 'drive') },
    delay: { delayTime: fakeParam(events, 'delay') },
    feedbackGain: { gain: fakeParam(events, 'feedback') },
  };
  const pool = Object.create(VoiceFxPool.prototype);

  pool.applyTableOpcode(slot, { code: 'FL', value: 127 }, 2);
  assert.deepEqual(events.find((event) => event[0] === 'frequency' && event[1] === 'target'), [
    'frequency', 'target', 180, 2, 0.005,
  ]);
  assert.deepEqual(events.find((event) => event[0] === 'wet' && event[1] === 'target'), [
    'wet', 'target', 1, 2, 0.005,
  ]);
  assert.throws(() => pool.applyTableOpcode(slot, { code: 'OFF' }, -1), /time/);

  pool.applyTableOpcode(slot, { code: 'OFF' }, 3);
  assert.deepEqual(events.find((event) => event[0] === 'wet' && event[1] === 'ramp'), [
    'wet', 'ramp', 0.0001, 3.008,
  ]);
  assert.deepEqual(events.find((event) => event[0] === 'feedback' && event[1] === 'ramp'), [
    'feedback', 'ramp', 0.0001, 3.008,
  ]);
});
