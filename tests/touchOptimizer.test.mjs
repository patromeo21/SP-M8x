import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('suppresses callouts on pads and tracker controls while preserving editing and waveform gestures', async () => {
  const source = await readFile(new URL('../src/styles/touchOptimizer.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { applyTouchOptimizations } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const listeners = new Map();
  class TestElement {
    constructor(pitch, performance, editable = false, inApp = true) {
      this.pitch = pitch;
      this.performance = performance;
      this.editable = editable;
      this.inApp = inApp;
    }
    closest(selector) {
      if (selector === '.pad-pitch-control') return this.pitch;
      if (selector === '.app-shell') return this.inApp;
      if (selector.startsWith('input:not')) return this.editable;
      return this.performance;
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
    const waveform = makeEvent('touchmove', new TestElement(false, true));
    const trackerCallout = makeEvent('contextmenu', new TestElement(false, false));
    const controlSelection = makeEvent('selectstart', new TestElement(false, false));
    const editableSelection = makeEvent('selectstart', new TestElement(false, false, true));
    const externalMenu = makeEvent('contextmenu', new TestElement(false, false, false, false));
    listeners.get('touchmove')(pitch);
    listeners.get('touchmove')(pad);
    listeners.get('touchmove')(waveform);
    listeners.get('gesturestart')(pinch);
    listeners.get('contextmenu')(trackerCallout);
    listeners.get('selectstart')(controlSelection);
    listeners.get('selectstart')(editableSelection);
    listeners.get('contextmenu')(externalMenu);
    assert.equal(pitch.defaultPrevented, false);
    assert.equal(pad.defaultPrevented, true);
    assert.equal(waveform.defaultPrevented, true);
    assert.equal(pinch.defaultPrevented, true);
    assert.equal(trackerCallout.defaultPrevented, true);
    assert.equal(controlSelection.defaultPrevented, true);
    assert.equal(editableSelection.defaultPrevented, false);
    assert.equal(externalMenu.defaultPrevented, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});
