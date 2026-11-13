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
  rejectResume = true;

  constructor() { AudioContextMock.instances.push(this); }
  async resume() {
    if (this.rejectResume) throw new Error('resume blocked');
    this.state = 'running';
  }
  createGain() { return Object.assign(new NodeMock(), { gain: new AudioParamMock() }); }
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

  const input = new ArrayBuffer(8);
  await audioEngine.decodeAudioData(input);
  assert.notEqual(context.decodedInput, input);
  assert.equal(context.decodedInput.byteLength, input.byteLength);

  const buffer = { duration: 2 };
  audioEngine.setPadBuffer('A1', buffer);
  const voiceId = audioEngine.triggerPad('A1', { scheduledTime: 11, sliceStart: 0.25, sliceEnd: 1 });
  assert.ok(voiceId);
  const sourceNode = context.sources[0];
  assert.deepEqual(sourceNode.startArgs, [11, 0.25, 0.75]);
  audioEngine.stopVoice(voiceId);
  assert.equal(sourceNode.stopTime, 10.01);
  assert.equal(sourceNode.disconnected, false);
  sourceNode.onended();
  assert.equal(sourceNode.disconnected, true);

  await audioEngine.triggerVoice('A1');
  const pannedSource = context.sources[1];
  pannedSource.onended();
  assert.equal(context.panners[0].disconnected, true);
});
