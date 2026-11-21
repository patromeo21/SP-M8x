import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function loadChopHelper() {
  const result = await build({
    entryPoints: ['src/sampler/chopToBank.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [{
      name: 'pad-bank-constants',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/usePadBank$/ }, () => ({ path: 'usePadBank', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents: 'export const BANKS = ["A", "B", "C", "D"]; export const PADS_PER_BANK = 16;',
          loader: 'js',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

function createPadBank({ failChop = false } = {}) {
  const slots = {};
  for (const bank of ['A', 'B', 'C', 'D']) {
    for (let index = 1; index <= 16; index++) {
      const id = `${bank}${index}`;
      slots[id] = { id, sampleKey: null, startPct: 0, endPct: 100 };
    }
  }
  slots.A1 = { ...slots.A1, sampleKey: 'source', startPct: 20, endPct: 80 };
  return {
    slots,
    async copyPad(sourceId, destinationId) {
      slots[destinationId] = { ...slots[sourceId], id: destinationId };
    },
    async deletePads(ids) {
      for (const id of ids) slots[id] = { id, sampleKey: null, startPct: 0, endPct: 100 };
    },
    async chopToBank(sourceId, bank, count) {
      if (failChop) throw new Error('Storage full');
      const ids = Array.from({ length: count }, (_, index) => `${bank}${index + 1}`);
      for (const [index, id] of ids.entries()) {
        slots[id] = { id, sampleKey: slots[sourceId].sampleKey, startPct: index, endPct: index + 1 };
      }
      return ids;
    },
  };
}

test('a sole source pad is replaced by sixteen slice destinations', async () => {
  const { chopToBankReplacingSingleSource } = await loadChopHelper();
  const padBank = createPadBank();
  const ids = await chopToBankReplacingSingleSource(padBank, 'A1', 'A', 16);

  assert.deepEqual(ids, Array.from({ length: 16 }, (_, index) => `A${index + 1}`));
  assert.equal(padBank.slots.A1.sampleKey, 'source');
  assert.equal(padBank.slots.A16.sampleKey, 'source');
  assert.equal(padBank.slots.B1.sampleKey, null);
});

test('a failed replacement restores the original source pad', async () => {
  const { chopToBankReplacingSingleSource } = await loadChopHelper();
  const padBank = createPadBank({ failChop: true });

  await assert.rejects(chopToBankReplacingSingleSource(padBank, 'A1', 'A', 16), /Storage full/);
  assert.equal(padBank.slots.A1.sampleKey, 'source');
  assert.equal(padBank.slots.B1.sampleKey, null);
});
