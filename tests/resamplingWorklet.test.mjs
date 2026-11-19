import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function setup(startFrame, frameCount, sampleRate = 10) {
  const messages = [];
  let Processor;
  const scope = {
    sampleRate,
    currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (message) => messages.push(message) };
      }
    },
    registerProcessor: (_name, constructor) => { Processor = constructor; },
  };
  vm.runInNewContext(await readFile(new URL('../src/sampler/resamplingWorklet.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor({ processorOptions: { startFrame, frameCount } });
  return { scope, processor, messages };
}

test('preallocates exactly 30 seconds for both channels', async () => {
  const { processor } = await setup(0, 1, 44100);
  assert.equal(processor.left.byteLength + processor.right.byteLength, 10_584_000);
  processor.port.onmessage({ data: { type: 'cancel' } });
});

test('capture begins at the exact bar frame and ends after the requested stereo frames', async () => {
  const { scope, processor, messages } = await setup(3, 5);
  const output = [[new Float32Array(4), new Float32Array(4)]];
  assert.equal(processor.left.length, 300);
  assert.equal(processor.right.length, 300);
  assert.equal(processor.process([[Float32Array.of(0, 1, 2, 3), Float32Array.of(0, -1, -2, -3)]], output), true);
  assert.equal(messages.length, 0);
  scope.currentFrame = 4;
  assert.equal(processor.process([[Float32Array.of(4, 5, 6, 7), Float32Array.of(-4, -5, -6, -7)]], output), false);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].length, 5);
  assert.deepEqual(Array.from(messages[0].left.slice(0, 5)), [3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from(messages[0].right.slice(0, 5)), [-3, -4, -5, -6, -7]);
});

test('duplicates mono input and rejects a missed start rather than producing a late bounce', async () => {
  const { scope, processor, messages } = await setup(0, 3);
  assert.equal(processor.process([[Float32Array.of(1, 2, 3, 4)]], [[new Float32Array(4)]]), false);
  assert.deepEqual(Array.from(messages[0].right.slice(0, 3)), [1, 2, 3]);
  const missed = await setup(3, 3);
  missed.scope.currentFrame = 4;
  assert.equal(missed.processor.process([[]], [[new Float32Array(4)]]), false);
  assert.match(missed.messages[0].error, /missed/);
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
    assert.equal(processor.process(input, output), block !== 74);
  }
  assert.equal(messages[0].length, 300);
  assert.equal(messages[0].left[0], 0);
  assert.equal(messages[0].left[299], 299);
  assert.equal(messages[0].right[299], -299);
});
