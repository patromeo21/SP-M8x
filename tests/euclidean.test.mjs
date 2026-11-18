import test from 'node:test';
import assert from 'node:assert';
import { generateEuclideanSteps } from '../src/tracker/euclideanGenerator.js';

test('Euclidean Generator: locks down exact starting phase and even spacing (8 steps, 3 pulses)', () => {
  const pattern = generateEuclideanSteps(8, 3, 0);
  
  assert.strictEqual(pattern.length, 8);
  assert.strictEqual(pattern.filter(Boolean).length, 3);
  
  assert.deepStrictEqual(pattern, [
    false,
    false,
    true,   // Pulse 1
    false,
    false,
    true,   // Pulse 2
    false,
    true    // Pulse 3
  ]);
});

test('Euclidean Generator: validates rightward rotation direction and wrapping', () => {
  const rotated = generateEuclideanSteps(8, 3, 1);
  
  assert.deepStrictEqual(rotated, [
    true,   // Wrapped from index 7
    false,
    false,
    true,
    false,
    false,
    true,
    false
  ]);
});

test('Euclidean Generator: throws on out-of-bounds or unsafe inputs', () => {
  assert.throws(() => generateEuclideanSteps(0, 1), RangeError);
  assert.throws(() => generateEuclideanSteps(300, 1), RangeError);
  assert.throws(() => generateEuclideanSteps(8, 9), RangeError);
  assert.throws(() => generateEuclideanSteps(8, 2, Number.MAX_SAFE_INTEGER + 1), TypeError);
});