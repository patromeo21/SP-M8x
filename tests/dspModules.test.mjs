import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function fakeParam() {
  const events = [];
  // Round times so float drift (10.01 + 0.12 etc.) doesn't break exact comparisons.
  const t = (x) => Math.round(x * 1e6) / 1e6;
  return {
    events,
    value: 0,
    cancelScheduledValues: (time) => { events.push(['cancel', t(time)]); },
    setValueAtTime: (v, time) => { events.push(['set', v, t(time)]); },
    linearRampToValueAtTime: (v, time) => { events.push(['linear', v, t(time)]); },
  };
}

test('DSP curves and math helpers stay within their stated bounds', async () => {
  const { makeTapeSaturationCurve, makeSafetyClampCurve, SAFETY_CLAMP_LIMIT, lerp, clampValue, DSPMath } =
    await import(dataUrl(await compile('../src/fx/dspMath.ts')));
  const a = makeTapeSaturationCurve(3.5);
  const b = makeTapeSaturationCurve(3.5);
  assert.equal(a, b); // cached: same reference, no reallocation
  assert.notEqual(a, makeTapeSaturationCurve(7));
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 1, `curve peak ${peak} must stay <= 1`);
  const mid = Math.floor(a.length / 2);
  assert.ok(a[mid - 1] < 0 && a[mid + 1] > 0);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(clampValue(2), 1);
  assert.equal(clampValue(-2, -0.5), -0.5);
  assert.equal(DSPMath.clamp(2, 0, 1), 1);
  assert.equal(DSPMath.dbToLinear(0), 1);
  assert.equal(DSPMath.linearToDb(1), 0);
  assert.equal(DSPMath.flushSubnormal(1e-16), 0);

  const safetyCurve = makeSafetyClampCurve();
  let safetyPeak = 0;
  for (const value of safetyCurve) safetyPeak = Math.max(safetyPeak, Math.abs(value));
  assert.ok(safetyPeak < SAFETY_CLAMP_LIMIT, `safety curve peak ${safetyPeak} must be below ${SAFETY_CLAMP_LIMIT}`);
});

test('AHDSR schedules attack/hold/decay/sustain and rejects invalid input', async () => {
  const { scheduleAHDSR, validateAHDSR, oscillationValue } = await import(dataUrl(await compile('../src/audio/ahdsr.ts')));
  const param = fakeParam();
  scheduleAHDSR(param, 10, 0.8, { attackTime: 0.01, holdTime: 0.02, decayTime: 0.1, sustainLevel: 0.5, releaseTime: 0.05 });
  assert.deepEqual(param.events, [
    ['cancel', 10],
    ['set', 0.0001, 10],
    ['linear', 0.8, 10.01],
    ['set', 0.8, 10.03],
    ['linear', 0.4, 10.13],
  ]);

  const zero = fakeParam();
  scheduleAHDSR(zero, 5, 1, { attackTime: 0, holdTime: 0, decayTime: 0, sustainLevel: 0, releaseTime: 0 });
  assert.deepEqual(zero.events, [
    ['cancel', 5],
    ['set', 0.0001, 5],
    ['linear', 1, 5.001],
    ['linear', 0.0001, 5.002],
  ]);

  const valid = { attackTime: 0.01, holdTime: 0, decayTime: 0.1, sustainLevel: 0.5, releaseTime: 0.05 };
  assert.doesNotThrow(() => validateAHDSR(valid));
  assert.throws(() => validateAHDSR({ ...valid, sustainLevel: 1.5 }), /Invalid AHDSR/);
  assert.throws(() => validateAHDSR({ ...valid, attackTime: -1 }), /Invalid AHDSR/);
  assert.throws(() => scheduleAHDSR(fakeParam(), 0, 1, { ...valid, releaseTime: NaN }), /Invalid AHDSR/);
  assert.throws(() => scheduleAHDSR(fakeParam(), -1, 1, valid), /start time or peak/);
  assert.throws(() => scheduleAHDSR(fakeParam(), 0, 1.1, valid), /start time or peak/);
  assert.equal(oscillationValue(0, 1), 0);
  assert.equal(oscillationValue(0.25, 1), 1);
  assert.equal(oscillationValue(0, 0, Math.PI / 2), 1);
  assert.throws(() => oscillationValue(-1, 1), /Oscillation/);
  assert.throws(() => oscillationValue(0, Infinity), /Oscillation/);
});
