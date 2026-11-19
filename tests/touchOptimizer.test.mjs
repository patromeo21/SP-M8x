import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('allows pitch slider touch movement while preventing pad and pinch gestures', async () => {
  const source = await readFile(new URL('../src/styles/touchOptimizer.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { applyTouchOptimizations } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const listeners = new Map();
  class TestElement {
    constructor(pitch, performance) {
      this.pitch = pitch;
      this.performance = performance;
    }
    closest(selector) {
      return selector === '.pad-pitch-control' ? this.pitch : this.performance;
    }
  }
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  globalThis.Element = TestElement;
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const makeEvent = (type, target) => ({
    type, target, cancelable: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  });
  try {
    applyTouchOptimizations();
    const pitch = makeEvent('touchmove', new TestElement(true, true));
    const pad = makeEvent('touchmove', new TestElement(false, true));
    const pinch = makeEvent('gesturestart', new TestElement(false, false));
    listeners.get('touchmove')(pitch);
    listeners.get('touchmove')(pad);
    listeners.get('gesturestart')(pinch);
    assert.equal(pitch.defaultPrevented, false);
    assert.equal(pad.defaultPrevented, true);
    assert.equal(pinch.defaultPrevented, true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});
