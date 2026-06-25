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

// 2) Obfuscate. Settings are strong on readability protection but deliberately
//    moderate on the runtime-heavy transforms (controlFlowFlattening,
//    deadCodeInjection) so the 60 fps game loop isn't bogged down. Dial these
//    up for more protection or down if you ever see frame drops.
const obfuscated = JavaScriptObfuscator.obfuscate(minified, {
  target: 'browser',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  // transformObjectKeys is intentionally OFF: BlockWings sends objects like
  // {t:'join'} as JSON to the (non-obfuscated) server, so object keys are wire
  // format and must not be altered. Identifier mangling doesn't touch property
  // names, so the protocol stays intact.
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  // left OFF on purpose — these break easily or hurt perf:
  selfDefending: false,
  debugProtection: false,
}).getObfuscatedCode();

writeFileSync('dist/app.min.js', obfuscated);
console.log(`✓ dist/app.min.js  (${(obfuscated.length / 1024).toFixed(0)} KB)  ` +
  `from ${(minified.length / 1024).toFixed(0)} KB minified`);
