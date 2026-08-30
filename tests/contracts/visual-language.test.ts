import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cssFiles = [
  new URL("../../app/globals.css", import.meta.url),
  new URL("../../app/features/documents/documents.css", import.meta.url),
  new URL("../../app/styles/responsive-focus.css", import.meta.url),
];

function sourceLine(source: string, index: number) {
  const start = source.lastIndexOf("\n", index) + 1;
  const end = source.indexOf("\n", index);
  return source.slice(start, end === -1 ? source.length : end).trim();
}

test("keeps product UI text at 12 px or larger", () => {
  const exceptions = [".paper-brand", ".rx-frame"];

  for (const file of cssFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
      const value = Number(match[1]);
      const pixels = match[2] === "rem" ? value * 16 : value;
      if (pixels >= 12) continue;

      const line = sourceLine(source, match.index);
      assert.ok(
        exceptions.some((selector) => line.includes(selector)),
        `Product UI text must be at least 12 px: ${line}`,
      );
    }
  }
});

test("defines compact desktop controls and accessible touch targets", () => {
  const globals = readFileSync(cssFiles[0], "utf8");

  assert.match(globals, /--control-height:\s*40px/);
  assert.match(globals, /--touch-height:\s*44px/);
  assert.match(globals, /input, select\s*\{[^}]*font-size:\s*var\(--fs-control\)/);
  assert.match(globals, /\.mobile-nav a\s*\{[^}]*min-height:\s*44px/);
});

test("keeps secondary file actions quiet without hiding them on touch", () => {
  const globals = readFileSync(cssFiles[0], "utf8");

  assert.match(globals, /\.files-grid \.file-actions\s*\{[^}]*opacity:\s*\.45/);
  assert.match(globals, /\(pointer:\s*coarse\)[^{]*\{[^}]*\.files-grid \.file-actions\s*\{\s*opacity:\s*1/);
});

test("keeps the document toolbar readable without sacrificing mobile space", () => {
  const documents = readFileSync(cssFiles[1], "utf8");

  assert.match(documents, /\.template-menu button\s*\{[^}]*min-height:\s*40px/);
  assert.match(documents, /\.paper-toolbar-actions \.typography-control-icon\s*\{\s*display:\s*none !important;/);
  assert.match(documents, /\.paper-toolbar-actions \.document-type-control button\s*\{[^}]*width:\s*36px/);
});

test("presents AI generation before advanced template management", () => {
  const form = readFileSync(new URL("../../app/features/ai/AiImportForm.tsx", import.meta.url), "utf8");
  const composer = form.indexOf('className="ai-composer"');
  const templateSettings = form.indexOf('className="tpl-prompt ai-template-settings"');

  assert.ok(composer > -1);
  assert.ok(templateSettings > composer);
  assert.match(form, /className="ai-composer-frame"[\s\S]*className="ai-composer-context"[\s\S]*className="ai-composer"/);
});
