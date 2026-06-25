// build.mjs — produce a single, minified client bundle.
//
//   npm run build                 →  dist/app.min.js   (minify only, FAST)
//   OBFUSCATE=1 npm run build      →  dist/app.min.js   (+ light obfuscation)
//
// All of js/*.js is bundled into one ES module. `three` stays external so it
// keeps loading from the CDN via the importmap in index.html.
//
// Minification alone strips all comments, whitespace and meaningful names and
// fuses 9 files into 1 — so the Network tab no longer shows your readable
// source. It has ZERO runtime cost, which matters because this game runs a
// 60 fps physics/render loop. Obfuscation (opt-in) adds string-array
// indirection that scrambles the code further but slows that loop, so it is
// OFF by default.
//
// Note: client code can never be truly hidden (the browser must run it). The
// authoritative game logic lives in server.js, which is never sent to clients.
import * as esbuild from 'esbuild';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

mkdirSync('dist', { recursive: true });

// 1) Bundle + minify. `three` is external → resolved by the importmap at runtime.
const result = await esbuild.build({
  entryPoints: ['js/main.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  external: ['three'],
  minify: true,
  legalComments: 'none',
  write: false,
});
const minified = result.outputFiles[0].text;

// 2) Optional light obfuscation (OBFUSCATE=1). Even the light preset adds
//    string-array indirection (a function call per string reference) which has
//    a measurable cost in a tight game loop — so it stays OFF unless explicitly
//    requested. Heavy transforms (controlFlowFlattening, numbersToExpressions,
//    deadCodeInjection) are never enabled here; they make a 60 fps loop crawl.
let output = minified;
if (process.env.OBFUSCATE) {
  const { default: JavaScriptObfuscator } = await import('javascript-obfuscator');
  output = JavaScriptObfuscator.obfuscate(minified, {
    target: 'browser',
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    simplify: true,
    stringArray: true,
    stringArrayThreshold: 0.5,
    stringArrayEncoding: [],         // plain indirection, no runtime decoding
    splitStrings: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    numbersToExpressions: false,
    transformObjectKeys: false,      // object keys are JSON wire format — never alter
    selfDefending: false,
    debugProtection: false,
    unicodeEscapeSequence: false,
  }).getObfuscatedCode();
}

// 3) Content-hashed filename for cache-busting. The bundle's URL changes
//    whenever its contents change, so browsers and Cloudflare are FORCED to
//    fetch the new version — no more stale bundles after a deploy. index.html
//    (served no-cache) is rewritten to point at the new file each build.
const hash = createHash('sha256').update(output).digest('hex').slice(0, 8);
const filename = `app.${hash}.min.js`;

// remove previous bundles so dist/ only ever holds the current one
for (const f of readdirSync('dist')) {
  if (/^app\.[0-9a-f.]*min\.js$/.test(f)) rmSync(`dist/${f}`);
}
writeFileSync(`dist/${filename}`, output);

// repoint index.html's module script at the hashed filename
const html = readFileSync('index.html', 'utf8');
const updated = html.replace(/dist\/app(\.[0-9a-f]+)?\.min\.js/g, `dist/${filename}`);
if (updated === html && !html.includes(`dist/${filename}`)) {
  console.warn('⚠ could not find the app bundle <script src> in index.html to update');
} else {
  writeFileSync('index.html', updated);
}

console.log(`✓ dist/${filename}  (${(output.length / 1024).toFixed(0)} KB)  ` +
  `${process.env.OBFUSCATE ? 'minified + light-obfuscated' : 'minified only'}  ` +
  `→ index.html updated`);
