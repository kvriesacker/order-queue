import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NL } from '../src/app/i18n/nl';

// Every text the app translates (written in English in the code, as t('…') or '…' | t) must
// have its Dutch in src/app/i18n/nl, or Dutch screens would show English bits.
const SRC = join(__dirname, '..', 'src', 'app');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [join(dir, e.name)] : [],
  );
}

const LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

/** The texts passed to t() or the t pipe in one source file. */
function keysIn(source: string): string[] {
  const keys: string[] = [];
  for (const m of source.matchAll(/\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
    keys.push(unescape(m[1].slice(1, -1)));
  }
  for (const m of source.matchAll(/\|\s*t\b(?!\w)/g)) {
    // The expression before the pipe: a literal, or a (…) group holding literals.
    let end = m.index! - 1;
    while (end >= 0 && /\s/.test(source[end])) end--;
    let start = end;
    if (source[end] === ')') {
      let depth = 0;
      for (; start >= 0; start--) {
        if (source[start] === ')') depth++;
        else if (source[start] === '(' && --depth === 0) break;
      }
    } else if (source[end] === "'" || source[end] === '"') {
      start = source.lastIndexOf(source[end], end - 1);
      while (start > 0 && source[start - 1] === '\\') start = source.lastIndexOf(source[end], start - 2);
    } else continue;
    for (const lit of source.slice(start, end + 1).matchAll(LITERAL)) {
      keys.push(unescape(lit[1] ?? lit[2]));
    }
  }
  return keys;
}

test('every translated text has its Dutch', ({}, info) => {
  test.skip(info.project.name === 'phone', 'Runs once');
  const missing = new Set<string>();
  let found = 0;
  for (const file of files(SRC)) {
    for (const key of keysIn(readFileSync(file, 'utf8'))) {
      found++;
      if (!(key in NL)) missing.add(`${file.slice(SRC.length + 1)}: ${key}`);
    }
  }
  expect(found).toBeGreaterThan(100);
  expect([...missing]).toEqual([]);
});
