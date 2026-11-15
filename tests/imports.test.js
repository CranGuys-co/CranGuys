import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every name a module imports must be exported by the file it comes from. (The old single-file bundle let a
// missing name quietly become undefined: that's how Wall Rush's LOW and DUCK walls went missing for bots.)
// This reads the source as text, so it also covers the browser-only modules Node can't load.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(ROOT, 'src'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f.split('\\').join('/'));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const exportsOf = (f) => new Set([...read(f).matchAll(/^export \{([^}]*)\};?$/gm)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())).filter(Boolean));

test('every import points at a file that exists and exports that name', () => {
  let checked = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/^import \{([^}]*)\} from '([^']+)';$/gm)) {
      const target = posix.join(posix.dirname(f), m[2]);
      assert.ok(existsSync(join(ROOT, target)), `${f}: ${m[2]} does not exist`);
      const have = exportsOf(target);
      for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(have.has(name), `${f} imports ${name} from ${m[2]}, which doesn't export it`);
        checked++;
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} imports checked`);
});

test('every module is reachable from src/main.js', () => {
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of read(f).matchAll(/^import .* from '([^']+)';$/gm)) visit(posix.join(posix.dirname(f), m[1]));
  };
  visit('src/main.js');
  assert.deepEqual(files.filter((f) => !seen.has(f)), []);
});

test('index.html loads the stylesheet and entry module and keeps the build placeholder', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="\.\/src\/styles\.css">/);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.match(html, /<meta name="cg-build" content="__BUILD__">/);
  assert.match(read('src/sim/config.js'), /^const BUILD = '__BUILD__';$/m);
});
