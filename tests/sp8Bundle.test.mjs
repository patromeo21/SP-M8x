import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async (path) => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('SP8 bundle export includes samples and import hydrates the project vault', async () => {
  const vaultSource = `
    export class SessionVault {
      static samples = new Map();
      static projects = new Map();
      static async getSampleBlob(hash) { return this.samples.get(hash) ?? null; }
      static async storeSampleBlob(hash, blob) { this.samples.set(hash, blob); }
      static async saveProjectSession(id, data) { this.projects.set(id, data); }
    }
  `;
  const vaultUrl = dataUrl(vaultSource);
  const bundleSource = (await compile('../src/project/sp8Bundle.ts'))
    .replace("'./sessionVault'", `'${vaultUrl}'`);
  const { SPM8BundleManager } = await import(dataUrl(bundleSource));
  const { SessionVault } = await import(vaultUrl);
  const originalSample = new Blob([new Uint8Array([0, 1, 2, 255])], { type: 'audio/wav' });
  SessionVault.samples.set('kick-hash', originalSample);

  const bundle = await SPM8BundleManager.exportBundle(
    'project-1',
    JSON.stringify({ meta: { id: 'project-1' }, bpm: 120 }),
    ['kick-hash'],
  );
  const projectId = await SPM8BundleManager.importBundleJson(await bundle.text());

  assert.equal(projectId, 'project-1');
  assert.equal(SessionVault.projects.get(projectId), JSON.stringify({ meta: { id: 'project-1' }, bpm: 120 }));
  const restoredSample = SessionVault.samples.get('kick-hash');
  assert.equal(restoredSample.type, 'audio/wav');
  assert.deepEqual(new Uint8Array(await restoredSample.arrayBuffer()), new Uint8Array([0, 1, 2, 255]));
});

test('SP8 bundle import rejects missing bundled sample data', async () => {
  const vaultUrl = dataUrl(`
    export class SessionVault {
      static async storeSampleBlob() {}
      static async saveProjectSession() {}
    }
  `);
  const source = (await compile('../src/project/sp8Bundle.ts'))
    .replace("'./sessionVault'", `'${vaultUrl}'`);
  const { SPM8BundleManager } = await import(dataUrl(source));

  await assert.rejects(
    SPM8BundleManager.importBundleJson(JSON.stringify({
      version: 1,
    createdAt: new Date().toISOString(),
      projectJson: '{}',
      sampleHashes: ['missing-hash'],
      samples: [],
    })),
    /missing one or more referenced sample blobs/,
  );
});
