import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async () => ts.transpileModule(
  await readFile(new URL('../src/workers/waveformWorker.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('waveform mipmaps cover every sample, including exact full-scale peaks', async () => {
  const previousSelf = globalThis.self;
  const posted = [];
  globalThis.self = {
    postMessage: (message) => posted.push(message),
  };
  try {
    await import(dataUrl(await compile()));
    globalThis.self.onmessage({
      data: { id: 'waveform-1', channelData: new Float32Array([-0.25, 1, 0.5]) },
    });

    assert.equal(posted.length, 1);
    const response = posted[0];
    assert.equal(response.id, 'waveform-1');
    const mipmap = response.mipmaps[64];
    assert.ok(Array.from(mipmap.min).includes(-0.25));
    assert.ok(Array.from(mipmap.max).includes(1));
    assert.ok(Array.from(mipmap.max).includes(0.5));
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});
