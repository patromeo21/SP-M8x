import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Controller tests import projectController.ts as a data: URL, so its relative
// undoStack import must be rewritten to an inlined data: URL before loading.
export function inlineUndoStack(source) {
  const stack = ts.transpileModule(
    readFileSync(new URL('../../src/project/undoStack.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(stack).toString('base64')}`;
  return source.replace("'./undoStack'", `'${url}'`);
}
