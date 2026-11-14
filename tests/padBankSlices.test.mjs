import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

test('restored slices share a single decode and each receives the buffer', async () => {
  const states = [];
  let cursor = 0;
  const effects = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: value };
      return states[index];
    },
    useCallback(value) { cursor++; return value; },
    useEffect(effect) {
      const index = cursor++;
      if (!(index in states)) { states[index] = true; effects.push(effect); }
    },
  };
  const pad = (id) => ({ id, sampleKey: 'shared', name: id, startPct: 0, endPct: 100, pitch: 0, loop: false });
  let decodeCount = 0;
  let releaseDecode;
  const buffer = { length: 100, sampleRate: 100, duration: 1 };
  const registered = new Map();
  let failAssignment = false;
  let failDeletion = false;
  let holdDeletion = false;
  let finishDeletion;
  let holdAssignment = false;
  let finishAssignment;
  const stopped = [];
  let nextVoice = 0;
  const triggered = [];
  const engine = {
    initialize: async () => {},
    decodeAudioData: () => { decodeCount++; return new Promise((resolve) => { releaseDecode = () => resolve(buffer); }); },
    setPadBuffer: (id, value) => registered.set(id, value), clearPadBuffer: (id) => registered.delete(id),
    triggerPad: (id, options) => { const voice = `voice${++nextVoice}`; triggered.push({ id, options, voice }); return voice; },
    stopVoice: (id) => stopped.push(id), stopAllVoices: () => {},
  };
  const storage = {
    readStoredPads: async () => [pad('A1'), pad('A2'), pad('A3')],
    readStoredAudio: async () => new Blob(['audio']),
    savePadSettings: async () => {}, saveSample: async () => {},
    deletePads: async () => {
      if (failDeletion) throw new Error('Deletion failed');
      if (holdDeletion) await new Promise((resolve) => { finishDeletion = resolve; });
    },
    saveSlices: async () => {
      if (failAssignment) throw new Error('Storage full');
      if (holdAssignment) await new Promise((resolve) => { finishAssignment = resolve; });
    },
  };
  globalThis.__padTest = { react, engine, storage };
  try {
    const result = await build({
      entryPoints: ['src/sampler/usePadBank.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
      plugins: [{
        name: 'hook-mocks',
        setup(build) {
          build.onResolve({ filter: /^(react|\.\.\/audio\/audioEngine|\.\/padStorage)$/ }, (args) => ({ path: args.path, namespace: 'mock' }));
          build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: args.path === 'react'
              ? 'export const {useState,useRef,useCallback,useEffect} = globalThis.__padTest.react;'
              : args.path.endsWith('audioEngine')
                ? 'export const audioEngine = globalThis.__padTest.engine;'
                : 'export const {readStoredPads,readStoredAudio,savePadSettings,saveSample,saveSlices,deletePads} = globalThis.__padTest.storage;',
            loader: 'js',
          }));
        },
      }],
    });
    const { usePadBank } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const render = () => { cursor = 0; return usePadBank(); };
    const flush = async () => { for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve)); };
    render();
    effects.forEach((effect) => effect());
    await flush();
    let api = render();
    api.triggerPad('A1');
    api.triggerPad('A2');
    await flush();
    assert.equal(decodeCount, 1);
    releaseDecode();
    await flush();
    api = render();
    api.updatePad('A1', { playbackMode: 'gate' });
    assert.deepEqual(stopped, [], 'changing to gate must not stop existing one-shot voices');
    const releaseGate = api.triggerPad('A1');
    await flush();
    const gateVoice = triggered.at(-1).voice;
    releaseGate();
    assert.deepEqual(stopped, [gateVoice], 'only the newly triggered gate voice stops on release');
    api.updatePad('A1', { playbackMode: 'one-shot' });
    assert.equal(api.slots.A1.buffer, buffer);
    assert.equal(api.slots.A2.buffer, buffer);
    assert.equal(registered.get('A1'), buffer);
    holdAssignment = false;
    const many = await render().chopToBank('A1', 'C', 32);
    assert.deepEqual(many.slice(0, 3), ['C1', 'C2', 'C3']);
    assert.deepEqual(many.slice(15, 18), ['C16', 'D1', 'D2']);
    assert.equal(many.at(-1), 'D16');
    assert.equal(registered.get('A2'), buffer);
    api.triggerPad('A3');
    await flush();
    assert.equal(decodeCount, 1);
    assert.equal(registered.get('A3'), buffer);

    api = render();
    await assert.rejects(api.chopToBank('A1', 'A', 16), /13 available/);
    failAssignment = true;
    await assert.rejects(api.chopToBank('A1', 'A', 2), /Storage full/);
    assert.equal(render().slots.A4.sampleKey, null);
    failAssignment = false;
    const ids = await api.chopToBank('A1', 'A', 2);
    assert.deepEqual(ids, ['A4', 'A5']);
    api = render();
    assert.equal(api.slots.A1.endPct, 100);
    assert.equal(api.slots.A2.name, 'A2');
    assert.equal(api.slots.A4.buffer, buffer);
    assert.equal(api.slots.A5.buffer, buffer);
    api.updatePad('A4', { endPct: 20, playbackMode: 'loop' });
    api = render();
    assert.equal(api.slots.A5.startPct, 50);
    assert.equal(api.slots.A5.playbackMode, 'one-shot');
    holdAssignment = true;
    const assignment = api.chopToBank('A1', 'B', 2);
    await flush();
    api.loadSample('B1', buffer, 'replacement', new Blob(['replacement']));
    finishAssignment();
    await assignment;
    assert.equal(render().slots.B1.sampleKey, 'shared');
    failDeletion = true;
    await assert.rejects(render().deletePads(['A4', 'A5']), /Deletion failed/);
    assert.equal(render().slots.A4.sampleKey, 'shared');
    assert.equal(registered.get('A4'), buffer);
    failDeletion = false;
    holdDeletion = true;
    const deletion = render().deletePads(['A4', 'A5']);
    await flush();
    render().loadSample('A4', buffer, 'conflicting', new Blob(['conflict']));
    finishDeletion();
    await deletion;
    assert.equal(render().slots.A4.sampleKey, null);
    assert.equal(render().slots.A5.sampleKey, null);
    assert.equal(render().slots.A1.sampleKey, 'shared');
    assert.equal(registered.has('A4'), false);
    assert.equal(registered.get('A1'), buffer);
    holdAssignment = false;
    await render().copyPad('A1', 'A4');
    assert.equal(render().slots.A4.buffer, buffer);
    await assert.rejects(render().copyPad('A1', 'A4'), /occupied/);
    assert.equal(render().slots.A1.sampleKey, 'shared');
  } finally {
    delete globalThis.__padTest;
  }
});
