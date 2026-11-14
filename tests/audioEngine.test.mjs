import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const asModuleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

class AudioParamMock {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
  linearRampToValueAtTime(value) { this.value = value; }
}

class NodeMock {
  connections = [];
  disconnected = false;
  connect(node) { this.connections.push(node); }
  disconnect() { this.disconnected = true; }
}

class AudioContextMock {
  static instances = [];
  state = 'suspended';
  currentTime = 10;
  sampleRate = 44100;
  destination = new NodeMock();
  sources = [];
  panners = [];
  analysers = [];
  rejectResume = true;

  constructor() { AudioContextMock.instances.push(this); }
  async resume() {
    if (this.rejectResume) throw new Error('resume blocked');
    this.state = 'running';
  }
  createGain() { return Object.assign(new NodeMock(), { gain: new AudioParamMock() }); }
  createChannelSplitter() { return new NodeMock(); }
  createAnalyser() {
    const node = Object.assign(new NodeMock(), {
      level: 0,
      getFloatTimeDomainData(data) { data.fill(this.level); },
    });
    this.analysers.push(node);
    return node;
  }
  createStereoPanner() {
    const node = Object.assign(new NodeMock(), { pan: new AudioParamMock() });
    this.panners.push(node);
    return node;
  }
  createBufferSource() {
    const node = Object.assign(new NodeMock(), {
      playbackRate: new AudioParamMock(),
      start(...args) { this.startArgs = args; },
      stop(time) { this.stopTime = time; },
    });
    this.sources.push(node);
    return node;
  }
  async decodeAudioData(data) { this.decodedInput = data; return { duration: 2 }; }
}

test('one engine resumes, decodes, schedules voices, and cleans up', async () => {
  globalThis.window = { AudioContext: AudioContextMock };
  const cacheUrl = asModuleUrl(await compile('../src/audio/audioCache.ts'));
  const source = (await compile('../src/audio/audioEngine.ts')).replace("'./audioCache'", `'${cacheUrl}'`);
  const { audioEngine } = await import(asModuleUrl(source));

  assert.equal(audioEngine.getContext(), null);
  await assert.rejects(audioEngine.initialize(), /resume blocked/);
  const context = audioEngine.getContext();
  context.rejectResume = false;
  const [first, second] = await Promise.all([audioEngine.initialize(), audioEngine.initialize()]);
  assert.equal(first, context);
  assert.equal(second, context);
  assert.equal(AudioContextMock.instances.length, 1);
  context.state = 'interrupted';
  context.rejectResume = true;
  await assert.rejects(audioEngine.initialize(), /resume blocked/);
  assert.equal(audioEngine.getContext(), context);
  context.rejectResume = false;
  assert.equal(await audioEngine.initialize(), context);
  assert.equal(context.state, 'running');
  context.analysers[1].level = -1.25;
  assert.equal(audioEngine.getOutputPeak(), 1.25);
  context.analysers[1].level = 0;

  const input = new ArrayBuffer(8);
  await audioEngine.decodeAudioData(input);
  assert.notEqual(context.decodedInput, input);
  assert.equal(context.decodedInput.byteLength, input.byteLength);

  const buffer = { duration: 2 };
  audioEngine.setPadBuffer('A1', buffer);
  let notifications = 0;
  const unsubscribe = audioEngine.subscribeVoiceChanges(() => notifications++);
  const voiceId = audioEngine.triggerPad('A1', { scheduledTime: 11, sliceStart: 0.25, sliceEnd: 1 });
  assert.ok(voiceId);
  assert.equal(audioEngine.hasPadVoices('A1', buffer), true);
  assert.equal(notifications, 1);
  const sourceNode = context.sources[0];
  assert.deepEqual(sourceNode.startArgs, [11, 0.25, 0.75]);
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), null);
  context.currentTime = 11.25;
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), 0.5);
  assert.equal(audioEngine.getPadPlaybackPosition('A1', { duration: 2 }), null);
  context.currentTime = 11.75;
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), null);
  context.currentTime = 10;
  audioEngine.stopVoice(voiceId);
  assert.equal(notifications, 2);
  assert.equal(audioEngine.hasPadVoices('A1', buffer), false);
  assert.equal(sourceNode.stopTime, 10);
  assert.equal(sourceNode.disconnected, false);
  sourceNode.onended();
  assert.equal(notifications, 2);
  assert.equal(sourceNode.disconnected, true);

  const loopId = audioEngine.triggerPad('A1', { sliceStart: 0.25, sliceEnd: 1.25, semitoneOffset: 12, loop: true });
  context.currentTime = 10.75;
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), 0.75);
  const newer = audioEngine.triggerPad('A1', { sliceStart: 0.5, sliceEnd: 1.5 });
  context.currentTime = 10.85;
  assert.ok(Math.abs(audioEngine.getPadPlaybackPosition('A1', buffer) - 0.6) < 1e-10);
  context.state = 'suspended';
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), null);
  context.state = 'running';
  context.currentTime = 11;
  audioEngine.stopVoice(newer);
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), 0.25);
  audioEngine.stopVoice(loopId);
  assert.equal(audioEngine.getPadPlaybackPosition('A1', buffer), null);
  unsubscribe();

  await audioEngine.triggerVoice('A1');
  const pannedSource = context.sources[3];
  pannedSource.onended();
  assert.equal(context.panners[0].disconnected, true);
});
