import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(
  readFileSync(new URL(`../../src/project/${path}`, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Controller tests import projectController.ts as a data: URL, so its relative
// imports must be rewritten to inlined data: URLs before loading.
export function inlineProjectModules(controllerSource) {
  return controllerSource
    .replace("'./undoStack'", `'${dataUrl(compile('undoStack.ts'))}'`)
    .replace("'./stepModel'", `'${dataUrl(compile('stepModel.ts'))}'`);
}
