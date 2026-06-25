// build.mjs — produce a single, minified + obfuscated client bundle.
//
//   npm run build   →   dist/app.min.js
//
// All of js/*.js is bundled into one ES module. `three` stays external so it
// keeps loading from the CDN via the importmap in index.html. The bundle is
// minified by esbuild, then obfuscated by javascript-obfuscator so the Network
// tab shows one unreadable blob instead of nine clean, commented files.
//
// Note: client code can never be truly hidden (the browser must run it). The
// authoritative game logic lives in server.js, which is never sent to clients.
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { writeFileSync, mkdirSync } from 'node:fs';

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

// 2) Obfuscate — LIGHT preset. The code is minified, identifiers are mangled to
//    hex, and string literals are moved into an indirection array, so the
//    Network tab shows an unreadable blob. But every runtime-heavy transform is
//    OFF, because BlockWings runs a 60 fps physics/render loop and those
//    transforms add per-operation cost that causes exactly the lag you saw:
//      - controlFlowFlattening : straight-line code → while/switch dispatcher
//      - numbersToExpressions  : every number literal → arithmetic at runtime
//      - deadCodeInjection     : extra branches that execute each frame
//      - splitStrings / base64 : string decode work on access
//    Keeping only minify + name-mangle + string-array (no encoding) means the
//    bundle runs at essentially minified speed.
const obfuscated = JavaScriptObfuscator.obfuscate(minified, {
  target: 'browser',
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  simplify: true,
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayEncoding: [],          // plain indirection, no runtime decoding
  splitStrings: false,
  // runtime-heavy transforms — all OFF for game-loop performance:
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  // OFF for correctness: object keys are JSON wire format to the server,
  // and these can break or slow things down:
  transformObjectKeys: false,
  selfDefending: false,
  debugProtection: false,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

writeFileSync('dist/app.min.js', obfuscated);
console.log(`✓ dist/app.min.js  (${(obfuscated.length / 1024).toFixed(0)} KB)  ` +
  `from ${(minified.length / 1024).toFixed(0)} KB minified`);
