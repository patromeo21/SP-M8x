import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

test('held DEL/OP selects several rows, confirms once, and cancels on interruption', async () => {
  const states = [];
  let cursor = 0;
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
  };
  globalThis.gestureReact = react;
  try {
    const result = await build({
      entryPoints: ['src/tracker/useStepDeletion.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'transform',
      plugins: [{
        name: 'react-mock',
        setup(builder) {
          builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, (args) => ({ path: args.path, namespace: 'mock' }));
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: args.path === 'react'
              ? 'export default globalThis.gestureReact; export const { useState, useRef } = globalThis.gestureReact;'
              : 'export const jsx = (type, props) => ({type, props: {...props, children: [props.children].flat()}}); export const jsxs = jsx;',
            loader: 'js',
          }));
        },
      }],
    });
    const { useStepDeletion } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const cleared = [];
    const render = () => { cursor = 0; return useStepDeletion((indices) => cleared.push(indices)); };
    const event = (id) => ({
      pointerId: id, pointerType: 'touch', isPrimary: id === 1,
      preventDefault() {}, currentTarget: { setPointerCapture() {} },
    });
    let api = render();
    api.controls.props.onPointerDown(event(1));
    api = render();
    api.onPointerDown(event(2), 3, true);
    api.onPointerDown(event(3), 5, true);
    api = render();
    assert.deepEqual([...api.selected], [3, 5]);
    assert.equal(api.consumeClick(3), true);
    api.controls.props.onPointerUp(event(1));
    api = render();
    const deleteButton = api.controls.props.children.find((child) => child?.type === 'button' && child.props.children[0] === 'DELETE');
    assert.deepEqual(cleared, []);
    deleteButton.props.onClick();
    assert.deepEqual(cleared, [[3, 5]]);

    api = render();
    api.controls.props.onPointerDown(event(1));
    api = render();
    api.onPointerDown(event(2), 1, true);
    api = render();
    api.controls.props.onPointerCancel(event(1));
    api = render();
    assert.equal(api.selected.size, 0);
    assert.equal(api.controls.type, 'button');
    assert.deepEqual(cleared, [[3, 5]]);
  } finally {
    delete globalThis.gestureReact;
  }
});
