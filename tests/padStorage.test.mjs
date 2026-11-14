import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

class DatabaseMock {
  stores = new Map();
  failAudioWrite = false;
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
            store.set(key ?? value.id, value);
          }),
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
    assert.deepEqual(await storage.readStoredPads(), [{ ...pad, pitch: 4, loop: true }]);
    assert.equal(await (await storage.readStoredAudio('B8', 'old')).text(), 'original audio');

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
