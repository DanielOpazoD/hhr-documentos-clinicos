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
  const exceptions = [".paper-brand", ".prescription-warning"];

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
  assert.match(globals, /\.mobile-nav a\s*\{[^}]*min-height:\s*44px/s);
});

test("keeps the document toolbar readable without sacrificing mobile space", () => {
  const documents = readFileSync(cssFiles[1], "utf8");

  assert.match(documents, /\.template-menu button\s*\{[^}]*min-height:\s*40px/s);
  assert.match(documents, /\.paper-toolbar-actions \.typography-control-icon\s*\{\s*display:\s*none !important;/s);
  assert.match(documents, /\.paper-toolbar-actions \.document-type-control button\s*\{[^}]*width:\s*36px/s);
});
