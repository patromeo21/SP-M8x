import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function setup(startFrame, frameCount, sampleRate = 10) {
  const messages = [];
  const messageTransfers = [];
  let Processor;
  const scope = {
    sampleRate,
    currentFrame: 0,
    Float32Array: class {
      constructor() { throw new Error('Audio worklet must not allocate sample arrays.'); }
    },
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (message, transfers) => { messages.push(message); messageTransfers.push(transfers); } };
      }
    },
    registerProcessor: (_name, constructor) => { Processor = constructor; },
  };
  vm.runInNewContext(await readFile(new URL('../src/sampler/resamplingWorklet.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  assert.equal(processor.left, null);
  assert.equal(processor.right, null);
  assert.equal(processor.process([[]], [[new Float32Array(4)]]), true);
  assert.equal(messages.length, 0);
  const left = new Float32Array(sampleRate * 30);
  const right = new Float32Array(sampleRate * 30);
  const result = { type: 'complete', left, right, length: frameCount };
  const missed = { type: 'error', message: 'Bounce missed the bar boundary. Try again.' };
  const pending = { type: 'pending' };
  const transfers = [left.buffer, right.buffer];
  processor.port.onmessage({ data: {
    type: 'capture', startFrame, length: frameCount, left, right, result, missed, pending, transfers,
  } });
  return { scope, processor, messages, messageTransfers, result, missed, pending, transfers };
}

test('accepts a 30-second stereo ring allocated outside the worklet', async () => {
  const { processor } = await setup(0, 1, 44100);
  assert.equal(processor.left.byteLength + processor.right.byteLength, 10_584_000);
  processor.port.onmessage({ data: { type: 'cancel' } });
});

test('capture begins at the exact bar frame and sends the prebuilt result', async () => {
  const { scope, processor, messages, messageTransfers, result, transfers } = await setup(3, 5);
  const output = [[new Float32Array(4), new Float32Array(4)]];
  assert.equal(processor.left.length, 300);
  assert.equal(processor.right.length, 300);
  assert.equal(processor.process([[Float32Array.of(0, 1, 2, 3), Float32Array.of(0, -1, -2, -3)]], output), true);
  assert.equal(messages.length, 0);
  scope.currentFrame = 4;
  assert.equal(processor.process([[Float32Array.of(4, 5, 6, 7), Float32Array.of(-4, -5, -6, -7)]], output), true);
  assert.equal(messages.length, 0);
  processor.port.onmessage({ data: { type: 'poll' } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0], result);
  assert.equal(messageTransfers[0], transfers);
  assert.equal(messages[0].length, 5);
  assert.deepEqual(Array.from(messages[0].left.slice(0, 5)), [3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from(messages[0].right.slice(0, 5)), [-3, -4, -5, -6, -7]);
});

test('duplicates mono input and rejects a missed start rather than producing a late bounce', async () => {
  const { scope, processor, messages } = await setup(0, 3);
  assert.equal(processor.process([[Float32Array.of(1, 2, 3, 4)]], [[new Float32Array(4)]]), true);
  processor.port.onmessage({ data: { type: 'poll' } });
  assert.deepEqual(Array.from(messages[0].right.slice(0, 3)), [1, 2, 3]);
  const missed = await setup(3, 3);
  missed.scope.currentFrame = 4;
  assert.equal(missed.processor.process([[]], [[new Float32Array(4)]]), true);
  assert.equal(missed.messages.length, 0);
  missed.processor.port.onmessage({ data: { type: 'poll' } });
  assert.equal(missed.messages[0], missed.missed);
  assert.match(missed.messages[0].message, /missed/);
  assert.equal(scope.currentFrame, 0);
});

test('cancellation releases ring arrays and stops processing', async () => {
  const { processor, messages } = await setup(8, 4);
  processor.port.onmessage({ data: { type: 'cancel' } });
  assert.equal(processor.left, null);
  assert.equal(processor.right, null);
  assert.equal(processor.process([[]], [[new Float32Array(4)]]), false);
  assert.equal(messages.length, 0);
});

test('captures an exact full-capacity ring without dropping the final frame', async () => {
  const { scope, processor, messages } = await setup(0, 300);
  const left = new Float32Array(4);
  const right = new Float32Array(4);
  const input = [[left, right]];
  const output = [[new Float32Array(4)]];
  for (let block = 0; block < 75; block++) {
    scope.currentFrame = block * 4;
    for (let i = 0; i < 4; i++) {
      left[i] = scope.currentFrame + i;
      right[i] = -left[i];
    }
    assert.equal(processor.process(input, output), true);
  }
  assert.equal(messages.length, 0);
  processor.port.onmessage({ data: { type: 'poll' } });
  assert.equal(messages[0].length, 300);
  assert.equal(messages[0].left[0], 0);
  assert.equal(messages[0].left[299], 299);
  assert.equal(messages[0].right[299], -299);
});

test('transfers ring ownership to the worklet and back without copying sample buffers', async () => {
  const { processor, messages, result, transfers } = await setup(0, 3);
  const payload = structuredClone({
    type: 'capture', startFrame: 0, length: 3,
    left: result.left, right: result.right, result,
    missed: { type: 'error', message: 'missed' }, pending: { type: 'pending' }, transfers,
  }, { transfer: transfers });
  assert.equal(result.left.byteLength, 0);
  assert.equal(result.right.byteLength, 0);
  processor.port.onmessage({ data: payload });
  processor.process([[Float32Array.of(1, 2, 3, 4), Float32Array.of(-1, -2, -3, -4)]], [[new Float32Array(4)]]);
  assert.equal(messages.length, 0);
  processor.port.onmessage({ data: { type: 'poll' } });
  const delivered = structuredClone(messages[0], { transfer: payload.transfers });
  assert.equal(payload.left.byteLength, 0);
  assert.deepEqual(Array.from(delivered.left.slice(0, 3)), [1, 2, 3]);
  assert.deepEqual(Array.from(delivered.right.slice(0, 3)), [-1, -2, -3]);
});

test('polling an active capture returns a prebuilt pending message without interrupting capture', async () => {
  const { processor, messages, pending } = await setup(8, 3);
  processor.port.onmessage({ data: { type: 'poll' } });
  assert.equal(messages[0], pending);
  assert.equal(processor.finished, false);
});
