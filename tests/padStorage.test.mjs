import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

class DatabaseMock {
  stores = new Map();
  failAudioWrite = false;
  failPadId = null;
  createObjectStore(name) { this.stores.set(name, new Map()); }
  transaction(names) {
    const db = this;
    const local = new Map([].concat(names).map((name) => [name, new Map(db.stores.get(name))]));
    let pending = 0;
    let aborted = false;
    const tx = {
      abort() {
        aborted = true;
        queueMicrotask(() => tx.onabort?.());
      },
      objectStore(name) {
        const store = local.get(name);
        const request = (work) => {
          const result = {};
          pending++;
          queueMicrotask(() => {
            if (aborted) return;
            try {
              result.result = work();
              result.onsuccess?.();
            } catch (error) {
              tx.error = error;
              tx.abort();
            }
            pending--;
            queueMicrotask(() => {
              if (!aborted && pending === 0) {
                for (const [key, values] of local) db.stores.set(key, values);
                tx.oncomplete?.();
              }
            });
          });
          return result;
        };
        return {
          get: (key) => request(() => store.get(key)),
          getAll: () => request(() => [...store.values()]),
          put: (value, key) => request(() => {
            if (name === 'audio' && db.failAudioWrite) throw new Error('Storage full');
            if (name === 'pads' && value.id === db.failPadId) throw new Error('Storage full');
            store.set(key ?? value.id, value);
          }),
          delete: (key) => request(() => store.delete(key)),
        };
      },
    };
    return tx;
  }
}

test('samples and settings restore atomically and failed replacements preserve old audio', async () => {
  const db = new DatabaseMock();
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded();
        request.onsuccess();
      });

      return request;
    },
  };
  try {
    const code = ts.transpileModule(
      await readFile(new URL('../src/sampler/padStorage.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const storage = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const pad = { id: 'B8', sampleKey: 'old', name: 'original', startPct: 0, endPct: 100, pitch: 0, loop: false };
    await storage.saveSample(pad, new Blob(['original audio']));
    await storage.savePadSettings({ ...pad, pitch: 4, loop: true });
    assert.deepEqual(await storage.readStoredPads(), [{ ...pad, pitch: 4, loop: true, audioKey: 'source:old' }]);
    assert.equal(await (await storage.readStoredAudio('B8', 'old')).text(), 'original audio');
    await storage.savePadSettings({ ...pad, playbackMode: 'gate' });
    assert.equal((await storage.readStoredPads())[0].playbackMode, 'gate');
    await storage.savePadSettings({ ...pad, playbackMode: 'invalid' });
    await assert.rejects(storage.readStoredPads(), /metadata is invalid/);
    await storage.savePadSettings(pad);

    db.failAudioWrite = true;
    const replacement = { ...pad, sampleKey: 'new', name: 'replacement' };
    await assert.rejects(storage.saveSample(replacement, new Blob(['new audio'])), /Storage full/);
    await assert.rejects(storage.savePadSettings(replacement), /not saved/);
    assert.equal((await storage.readStoredPads())[0].name, 'original');
    assert.equal(await (await storage.readStoredAudio('B8', 'old')).text(), 'original audio');
    await assert.rejects(storage.readStoredAudio('B8', 'new'), /changed/);
  } finally {
    delete globalThis.indexedDB;
  }
});

test('legacy slices migrate atomically, protect occupied pads, and retain shared audio through replacements', async () => {
  const db = new DatabaseMock();
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    const code = ts.transpileModule(
      await readFile(new URL('../src/sampler/padStorage.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const storage = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#legacy`);
    const source = { id: 'A1', sampleKey: 'legacy', name: 'legacy', startPct: 0, endPct: 100, pitch: 0, loop: true };
    const slice = (id, startPct, endPct) => ({ ...source, id, startPct, endPct, playbackMode: 'gate' });
    await storage.readStoredPads();
    db.stores.get('pads').set(source.id, source);
    db.stores.get('audio').set(source.id, new Blob(['legacy audio']));
    assert.equal(await (await storage.readStoredAudio('A1', 'legacy')).text(), 'legacy audio');

    db.failPadId = 'A3';
    await assert.rejects(storage.saveSlices('A1', 'legacy', [slice('A2', 0, 50), slice('A3', 50, 100)]), /Storage full/);
    assert.equal(db.stores.get('audio').has('A1'), true);
    assert.equal(db.stores.get('pads').size, 1);
    db.failPadId = null;
    await storage.saveSlices('A1', 'legacy', [slice('A2', 0, 50), slice('A3', 50, 100)]);
    const pads = await storage.readStoredPads();
    assert.equal(pads.every((pad) => pad.audioKey === 'source:legacy'), true);
    assert.equal(db.stores.get('audio').size, 1);
    assert.equal(pads.find((pad) => pad.id === 'A2').playbackMode, 'gate');
    await assert.rejects(storage.saveSlices('A1', 'legacy', [slice('A3', 0, 50), slice('A4', 50, 100)]), /occupied/);
    assert.equal(db.stores.get('pads').has('A4'), false);

    await storage.savePadSettings({ ...source, pitch: 3 });
    await storage.saveSample({ ...source, sampleKey: 'replacement' }, new Blob(['new audio']));
    assert.equal(await (await storage.readStoredAudio('A2', 'legacy')).text(), 'legacy audio');
    assert.equal(await (await storage.readStoredAudio('A1', 'replacement')).text(), 'new audio');
    await storage.saveSample({ ...slice('A2', 0, 50), sampleKey: 'r2' }, new Blob(['r2']));
    assert.equal(await (await storage.readStoredAudio('A3', 'legacy')).text(), 'legacy audio');
    await storage.saveSample({ ...slice('A3', 50, 100), sampleKey: 'r3' }, new Blob(['r3']));
    assert.equal(db.stores.get('audio').has('source:legacy'), false);
  } finally {
    delete globalThis.indexedDB;
  }
});
