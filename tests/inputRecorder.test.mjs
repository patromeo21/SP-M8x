import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('recording targets the original pad, stops at 60 seconds, and releases input', async () => {
  const statuses = [];
  const samples = [];
  const timers = new Map();
  let nextTimer = 0;
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let input;
  class RecorderMock {
    state = 'inactive';
    mimeType = 'audio/mp4';
    constructor(received) { assert.equal(received, stream); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['sample']) });
      this.onstop?.();
    }
  }
  const globals = {
    window: globalThis.window,
    navigator: globalThis.navigator,
    MediaRecorder: globalThis.MediaRecorder,
  };
  globalThis.window = {
    setTimeout(callback, delay) {
      assert.equal(delay, 60_000);
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: (constraints) => { input = constraints; return Promise.resolve(stream); } } },
  });
  globalThis.MediaRecorder = RecorderMock;
  globalThis.recorderTestAudio = {
    initialize: async () => ({}),
    decodeAudioData: async (bytes) => ({ length: bytes.byteLength }),
  };

  try {
    const source = ts.transpileModule(
      await readFile(new URL('../src/audio/inputRecorder.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText.replace("'./audioEngine'", `'${moduleUrl('export const audioEngine = globalThis.recorderTestAudio;')}'`);
    const { InputRecorder } = await import(moduleUrl(source));
    const recorder = new InputRecorder((status) => statuses.push(status), (...sample) => samples.push(sample));

    await recorder.start('B8');
    assert.deepEqual(input.audio, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    assert.equal(statuses.at(-1).phase, 'recording');
    timers.values().next().value();
    assert.equal(track.stopped, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(samples[0].slice(0, 3), ['B8', { length: 6 }, 'REC B8']);
    assert.equal(await samples[0][3].text(), 'sample');
    assert.equal(statuses.at(-1).phase, 'idle');

    let resolveInput;
    globalThis.navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { resolveInput = resolve; });
    const pending = recorder.start('A1');
    await Promise.resolve();
    recorder.stop();
    track.stopped = false;
    resolveInput(stream);
    await pending;
    assert.equal(track.stopped, true);
    assert.equal(samples.length, 1);

    globalThis.navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); };
    await recorder.start('A2');
    assert.deepEqual(statuses.at(-1), { phase: 'error', message: 'Permission denied' });
    assert.equal(samples.length, 1);

    track.stopped = false;
    globalThis.navigator.mediaDevices.getUserMedia = async () => stream;
    await recorder.start('A3');
    track.onended();
    assert.equal(track.stopped, true);
    assert.match(statuses.at(-1).message, /disconnected/);
    assert.equal(samples.length, 1);
    recorder.dispose();
  } finally {
    globalThis.window = globals.window;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: globals.navigator });
    globalThis.MediaRecorder = globals.MediaRecorder;
    delete globalThis.recorderTestAudio;
  }
});
