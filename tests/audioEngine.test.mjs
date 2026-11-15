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
  events = [];
  setValueAtTime(value, time) { this.events.push(['set', value, time]); this.value = value; }
  setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]); this.value = value; }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); this.value = value; }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); this.value = value; }
}

class NodeMock {
  connections = [];
  disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class AudioContextMock {
  state = 'suspended';
  currentTime = 10;
  sampleRate = 44100;
  destination = new NodeMock();
  sources = [];
  gains = [];
  delays = [];
  filters = [];
  rejectResume = true;
  async resume() {
    if (this.rejectResume) throw new Error('resume blocked');
    this.state = 'running';
  }
  createGain() {
    const node = Object.assign(new NodeMock(), { gain: new AudioParamMock() });
    this.gains.push(node);
    return node;
  }
  createDelay() {
    const node = Object.assign(new NodeMock(), { delayTime: new AudioParamMock() });
    this.delays.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = Object.assign(new NodeMock(), { frequency: new AudioParamMock() });
    this.filters.push(node);
    return node;
  }
  createWaveShaper() { return new NodeMock(); }
  createChannelSplitter() { return new NodeMock(); }
  createAnalyser() { return Object.assign(new NodeMock(), { getFloatTimeDomainData(data) { data.fill(0); } }); }
  createStereoPanner() { return Object.assign(new NodeMock(), { pan: new AudioParamMock() }); }
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

test('preallocated voices reset FX without stopping dry audio and steal the oldest slot', async () => {
  globalThis.window = { AudioContext: AudioContextMock };
  const cacheUrl = asModuleUrl(await compile('../src/audio/audioCache.ts'));
  const poolUrl = asModuleUrl(await compile('../src/fx/VoiceFxPool.ts'));
  const source = (await compile('../src/audio/audioEngine.ts'))
    .replace("'./audioCache'", `'${cacheUrl}'`)
    .replace("'../fx/VoiceFxPool'", `'${poolUrl}'`);
  const { audioEngine } = await import(asModuleUrl(source));
  await assert.rejects(audioEngine.initialize(), /resume blocked/);
  const context = audioEngine.getContext();
  context.rejectResume = false;
  await Promise.all([audioEngine.initialize(), audioEngine.initialize()]);
  assert.equal(context.delays.length, 32);
  assert.equal(context.filters.length, 32);
  const initialGains = context.gains.length;

  const bytes = new ArrayBuffer(8);
  await audioEngine.decodeAudioData(bytes);
  assert.notEqual(context.decodedInput, bytes);
  const buffer = { duration: 2 };
  audioEngine.setPadBuffer('A1', buffer);
  audioEngine.setPadBuffer('A2', buffer);
  const ids = [];
  for (let i = 0; i < 32; i++) {
    context.currentTime = 10 + i * 0.001;
    ids.push(audioEngine.triggerPad(i === 31 ? 'A2' : 'A1', { loop: true, semitoneOffset: 12, fx: i === 1 ? { code: 'FL', value: 64 } : undefined }));
  }
  assert.equal(audioEngine.getActiveVoiceCount(), 32);
  assert.equal(context.sources[0].playbackRate.value, 2);
  assert.equal(context.gains.length, initialGains);
  assert.equal(context.delays.length, 32);
  const slot = audioEngine.activeVoices.get(ids[0]).slot;
  const filteredSlot = audioEngine.activeVoices.get(ids[1]).slot;
  assert.notEqual(slot, filteredSlot);
  assert.ok(filteredSlot.filter.frequency.events.some((event) => event[0] === 'target' && event[1] < 20000));
  assert.equal(slot.filter.frequency.events.some((event) => event[0] === 'target'), false, 'step FX must not affect other voices');
  const sourceNode = context.sources[0];
  audioEngine.resetPadFxAt('A1', context.currentTime);
  assert.equal(sourceNode.stopTime, undefined);
  assert.deepEqual(slot.wetGain.gain.events.at(-1), ['exponential', 0.0001, context.currentTime + 0.008]);
  assert.deepEqual(slot.feedbackGain.gain.events.at(-1), ['exponential', 0.0001, context.currentTime + 0.008]);
  assert.equal(audioEngine.activeVoices.get(ids[31]).slot.wetGain.gain.events.some((event) => event[0] === 'exponential'), false);
  assert.equal(slot.dryGain.gain.value, 1);
  const next = audioEngine.triggerPad('A1', { loop: true });
  assert.ok(next);
  assert.ok(Math.abs(sourceNode.stopTime - (context.currentTime + 0.006)) < 1e-10);
  assert.equal(context.sources.at(-1).startArgs[0], context.currentTime + 0.006);
  assert.equal(audioEngine.activeVoices.get(next).slot, slot);
  sourceNode.onended();
  assert.equal(audioEngine.slotOwners.get(slot), next, 'stale cleanup must not release a reused slot');
  assert.equal(context.gains.length, initialGains);
  assert.equal(context.delays.length, 32);
});
