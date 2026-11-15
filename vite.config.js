import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Friends can only play together on exactly the same build (NETV in src/sim/config.js), and a running game
// offers a reload when the website has a newer one (it compares the cg-build tag in index.html). Both use a
// fingerprint of the code, stamped in here when you run `npm run build`. `npm run dev` leaves '__BUILD__',
// which the game treats as an unbundled dev copy.
function fingerprint(root) {
  const files = ['index.html'];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else files.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(join(root, 'src'));
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(f + '\0').update(readFileSync(join(root, f))).update('\0');
  return h.digest('hex').slice(0, 10);
}

function stampBuild() {
  let root = process.cwd(), build = '';
  return {
    name: 'cranguys-build-stamp',
    apply: 'build',
    configResolved(config) { root = config.root; },
    buildStart() { build = fingerprint(root); },
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/sim/config.js')) return null;
      const out = code.replace("const BUILD = '__BUILD__';", `const BUILD = '${build}';`);
      if (out === code) this.error("src/sim/config.js no longer has const BUILD = '__BUILD__';");
      return { code: out, map: null };
    },
    transformIndexHtml(html) {
      const out = html.replace('<meta name="cg-build" content="__BUILD__">', `<meta name="cg-build" content="${build}">`);
      if (out === html) throw new Error('index.html no longer has <meta name="cg-build" content="__BUILD__">');
      return out;
    },
  };
}

// Relative base so the build works at https://<user>.github.io/<repo>/ without hard-coding the repository name.
export default defineConfig({
  base: './',
  plugins: [stampBuild()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
