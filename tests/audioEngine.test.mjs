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
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
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
  oscillators = [];
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
  createOscillator() {
    const oscillator = Object.assign(new NodeMock(), { frequency: new AudioParamMock(), start() {} });
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createDynamicsCompressor() {
    return Object.assign(new NodeMock(), {
      threshold: new AudioParamMock(), knee: new AudioParamMock(), ratio: new AudioParamMock(),
      attack: new AudioParamMock(), release: new AudioParamMock(),
    });
  }
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
  const deckUrl = asModuleUrl((await compile('../src/fx/PerformanceDeck.ts')).replace("'./VoiceFxPool'", `'${poolUrl}'`));
  const fxUrl = asModuleUrl((await compile('../src/fx/fxEngine.ts')).replace("'./VoiceFxPool'", `'${poolUrl}'`));
  const dspUrl = asModuleUrl(await compile('../src/fx/dspMath.ts'));
  const ahdsrUrl = asModuleUrl(await compile('../src/audio/ahdsr.ts'));
  const source = (await compile('../src/audio/audioEngine.ts'))
    .replace("'./audioCache'", `'${cacheUrl}'`)
    .replace("'./ahdsr'", `'${ahdsrUrl}'`)
    .replace("'../fx/VoiceFxPool'", `'${poolUrl}'`)
    .replace("'../fx/PerformanceDeck'", `'${deckUrl}'`)
    .replace("'../fx/fxEngine'", `'${fxUrl}'`)
    .replace("'../fx/dspMath'", `'${dspUrl}'`);
  const { audioEngine } = await import(asModuleUrl(source));
  await assert.rejects(audioEngine.initialize(), /resume blocked/);
  const context = audioEngine.getContext();
  context.rejectResume = false;
  await Promise.all([audioEngine.initialize(), audioEngine.initialize()]);
  assert.equal(context.delays.length, 37);
  assert.equal(context.filters.length, 37);
  const initialGains = context.gains.length;

  const clickTime = context.currentTime + 1;
  audioEngine.scheduleMetronomeClick(clickTime, 0.8, true);
  assert.deepEqual(context.oscillators[0].frequency.events.at(-1), ['set', 1200, clickTime]);
  assert.deepEqual(context.gains[1].gain.events.slice(-3), [
    ['set', 0, clickTime],
    ['set', 0.2, clickTime + 0.001],
    ['linear', 0, clickTime + 0.02],
  ]);
  audioEngine.scheduleMetronomeClick(clickTime + 1, 0.4);
  assert.deepEqual(context.oscillators[0].frequency.events.at(-1), ['set', 880, clickTime + 1]);
  assert.equal(context.gains[1].gain.events.at(-2)[1], 0.1);
  audioEngine.cancelMetronomeClicks();
  assert.deepEqual(context.gains[1].gain.events.slice(-2), [
    ['cancel', context.currentTime],
    ['set', 0, context.currentTime],
  ]);

  const bytes = new ArrayBuffer(8);
  await audioEngine.decodeAudioData(bytes);
  assert.notEqual(context.decodedInput, bytes);
  const buffer = { duration: 2 };
  audioEngine.setPadBuffer('A1', buffer);
  audioEngine.setPadBuffer('A2', buffer);
  const ids = [];
  for (let i = 0; i < 32; i++) {
    context.currentTime = 10 + i * 0.001;
    ids.push(audioEngine.triggerPad(i === 31 ? 'A2' : 'A1', {
      loop: true, semitoneOffset: 12, trackIndex: i === 31 ? 4 : i === 1 ? 1 : 0,
      fx: i === 1 ? { code: 'FL', value: 64 } : undefined,
    }));
  }
  assert.equal(audioEngine.getActiveVoiceCount(), 32);
  assert.deepEqual(audioEngine.activeVoices.get(ids[0]).slot.deckGains.map((gain) => gain.gain.value), [1, 0]);
  assert.deepEqual(audioEngine.activeVoices.get(ids[31]).slot.deckGains.map((gain) => gain.gain.value), [0, 1]);
  assert.equal(context.sources[0].playbackRate.value, 2);
  assert.equal(context.gains.length, initialGains);
  assert.equal(context.delays.length, 37);
  const slot = audioEngine.activeVoices.get(ids[0]).slot;
  const filteredSlot = audioEngine.activeVoices.get(ids[1]).slot;
  assert.notEqual(slot, filteredSlot);
  audioEngine.setTrackVolume(1, 0.25);
  assert.equal(filteredSlot.trackGain.gain.value, 0.25);
  assert.equal(slot.trackGain.gain.value, 1, 'track gain must not change another track');
  audioEngine.setVoiceTrack(ids[0], 1);
  assert.equal(slot.trackGain.gain.value, 0.25, 'a spilled live hit uses its destination channel');
  assert.ok(filteredSlot.filter.frequency.events.some((event) => event[0] === 'target' && event[1] < 20000));
  assert.equal(slot.filter.frequency.events.some((event) => event[0] === 'target'), false, 'step FX must not affect other voices');
  const sourceNode = context.sources[0];
  const overloads = [];
  const unsubscribe = audioEngine.subscribeOverload((message) => overloads.push(message));
  const pendingCount = context.sources.length;
  assert.equal(audioEngine.triggerPad('A1', { scheduledTime: context.currentTime + 0.1 }), null);
  assert.equal(audioEngine.triggerPad('A1', { scheduledTime: context.currentTime - 0.001 }), null,
    'a slightly overdue scheduled note must not steal a live slot');
  assert.equal(context.sources.length, pendingCount, 'full pool must not allocate or steal for a scheduled note');
  assert.match(overloads.at(-1), /scheduled note dropped/);
  assert.equal(sourceNode.stopTime, undefined);
  audioEngine.resetPadFxAt('A1', context.currentTime);
  assert.equal(sourceNode.stopTime, undefined);
  assert.deepEqual(slot.wetGain.gain.events.at(-1), ['exponential', 0.0001, context.currentTime + 0.008]);
  assert.deepEqual(slot.feedbackGain.gain.events.at(-1), ['exponential', 0.0001, context.currentTime + 0.008]);
  assert.equal(audioEngine.activeVoices.get(ids[31]).slot.wetGain.gain.events.some((event) => event[0] === 'exponential'), false);
  assert.equal(slot.dryGain.gain.value, 1);
  audioEngine.setPadVolume('A1', 0.4);
  assert.equal(slot.padGain.gain.value, 0.4);
  audioEngine.setPerformanceFx(0, 'filter');
  assert.ok(audioEngine.performanceDecks[0].filter.frequency.events.some((event) => event[0] === 'target' && event[1] === 350));
  audioEngine.setPerformanceFx(1, 'delay');
  assert.ok(audioEngine.performanceDecks[1].delayWet.gain.events.some((event) => event[0] === 'target' && event[1] === 0.4));
  const next = audioEngine.triggerPad('A1', { loop: true });
  assert.ok(next);
  assert.ok(Math.abs(sourceNode.stopTime - (context.currentTime + 0.006)) < 1e-10);
  assert.equal(context.sources.at(-1).startArgs[0], context.currentTime + 0.006);
  assert.equal(audioEngine.activeVoices.get(next).slot, slot);
  sourceNode.onended();
  assert.equal(audioEngine.slotOwners.get(slot), next, 'stale cleanup must not release a reused slot');
  assert.equal(context.gains.length, initialGains);
  assert.equal(context.delays.length, 37);
  audioEngine.stopAllVoices();
  for (const source of context.sources) source.onended();
  context.currentTime = 50;
  for (let i = 0; i < 32; i++) {
    assert.ok(audioEngine.triggerPad('A1', { scheduledTime: 51, loop: true }));
  }
  const futureSources = context.sources.slice(-32);
  assert.equal(audioEngine.triggerPad('A1'), null, 'a live hit must not steal an unstarted reservation');
  assert.match(overloads.at(-1), /live note dropped/);
  assert.ok(futureSources.every((source) => source.stopTime === undefined));
  audioEngine.stopAllVoices();
  for (const source of futureSources) source.onended();
  context.currentTime = 100;
  const gate = audioEngine.triggerPad('A1', { gated: true, trackIndex: 0 });
  const otherTrack = audioEngine.triggerPad('A1', { gated: true, trackIndex: 1 });
  const oneShot = audioEngine.triggerPad('A1', { trackIndex: 0 });
  const future = audioEngine.triggerPad('A1', { gated: true, trackIndex: 0, scheduledTime: 101 });
  const gateVoice = audioEngine.activeVoices.get(gate);
  audioEngine.releaseTrackGatedVoicesAt('A1', 0, 100.2);
  assert.deepEqual(gateVoice.gainNode.gain.events.slice(-2), [
    ['hold', 100.2], ['exponential', 0.0001, 100.2 + 0.004],
  ]);
  assert.equal(gateVoice.source.stopTime, 100.2 + 0.004);
  assert.equal(audioEngine.activeVoices.get(otherTrack).source.stopTime, undefined);
  assert.equal(audioEngine.activeVoices.get(oneShot).source.stopTime, undefined);
  assert.equal(audioEngine.activeVoices.get(future).source.stopTime, undefined);
  audioEngine.releaseTrackGatedVoicesAt('A1', 0, 100.3);
  assert.equal(gateVoice.source.stopTime, 100.2 + 0.004, 'later release does not postpone an existing stop');
  audioEngine.stopGatedVoices();
  assert.equal(audioEngine.activeVoices.get(otherTrack).source.stopTime, 100.004);
  assert.equal(audioEngine.activeVoices.get(oneShot).source.stopTime, undefined);
  assert.equal(audioEngine.activeVoices.get(future).source.stopTime, 100, 'STOP cancels queued gated notes immediately');

  const sameTrackGate = audioEngine.triggerPad('A1', { gated: true, trackIndex: 2 });
  const differentTrackGate = audioEngine.triggerPad('A2', { gated: true, trackIndex: 3 });
  const replacementGate = audioEngine.triggerPad('A2', { gated: true, trackIndex: 2 });
  assert.equal(audioEngine.activeVoices.get(sameTrackGate).source.stopTime, 100.004,
    'a gate on another pad replaces the previous gate on the same track');
  assert.equal(audioEngine.activeVoices.get(differentTrackGate).source.stopTime, undefined,
    'gate replacement never bleeds across tracks');
  assert.equal(audioEngine.activeVoices.get(replacementGate).source.stopTime, undefined);

  const chokeOld = audioEngine.triggerPad('A1', { chokeGroup: 3 });
  const chokeFuture = audioEngine.triggerPad('A2', { chokeGroup: 3, scheduledTime: 101 });
  const chokeNew = audioEngine.triggerPad('A1', { chokeGroup: 3, scheduledTime: 100.5 });
  assert.equal(audioEngine.activeVoices.get(chokeOld).source.stopTime, 100.504);
  assert.equal(audioEngine.activeVoices.get(chokeFuture).source.stopTime, undefined, 'future lookahead voice is not choked early');
  assert.equal(audioEngine.activeVoices.get(chokeNew).source.stopTime, undefined);
  unsubscribe();
});
