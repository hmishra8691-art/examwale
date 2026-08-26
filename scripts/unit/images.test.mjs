/**
 * Unit tests for avatar processing.
 *
 * These check the security properties, which is what this pipeline is for. The
 * one that matters most is EXIF: a photo taken on a phone carries GPS
 * coordinates, and a mentor uploading a selfie from home would otherwise publish
 * their address to anybody who ran `exiftool` on their profile picture. Nothing
 * in the interface would show that happening, so it gets a test.
 *
 * Run with `npm run test:unit`.
 */
import sharp from "../../node_modules/sharp/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "../../node_modules/typescript/lib/typescript.js";

const OUT = join(tmpdir(), "examwale-unit-images");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "errors.mjs"), "export class ValidationError extends Error {}\n");

let code = ts.transpileModule(readFileSync("src/modules/documents/images.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
code = code
  .replace('"@/modules/shared/errors"', `"${join(OUT, "errors.mjs")}"`)
  .replace('from "sharp"', `from "${process.cwd()}/node_modules/sharp/dist/index.mjs"`);
writeFileSync(join(OUT, "images.mjs"), code);

const { processAvatar, avatarStorageKey } = await import(join(OUT, "images.mjs"));

console.log("\n── avatar processing ────────────────────────────────────────────");

let pass=0,fail=0;
const t=(n,g,w)=>{const ok=String(g)===String(w);ok?pass++:fail++;console.log(`${ok?'  ok':'FAIL'}  ${n}${ok?'':`  (got ${g}, want ${w})`}`);};

// A photo with GPS EXIF, as a phone would produce.
const withExif = await sharp({create:{width:800,height:1200,channels:3,background:{r:120,g:80,b:60}}})
  .jpeg().withExif({IFD0:{Copyright:'Someone'},GPS:{GPSLatitude:'18/1 55/1 0/1',GPSLongitude:'72/1 52/1 0/1'}}).toBuffer();
const beforeMeta = await sharp(withExif).metadata();
t('fixture really carries EXIF', Boolean(beforeMeta.exif), true);

const out = await processAvatar(withExif);
t('produces two variants', out.variants.length, 2);
const sm = await sharp(out.variants.find(v=>v.size==='sm').buffer).metadata();
const lg = await sharp(out.variants.find(v=>v.size==='lg').buffer).metadata();
t('small is 128x128', `${sm.width}x${sm.height}`, '128x128');
t('large is 512x512', `${lg.width}x${lg.height}`, '512x512');
t('re-encoded as webp', sm.format, 'webp');
// THE ONE THAT MATTERS: a home address must not survive into a public avatar.
t('EXIF is gone from the output', Boolean(sm.exif), false);
t('  ...from the large one too', Boolean(lg.exif), false);
console.log(`  --  1200x800 source ${(withExif.length/1024).toFixed(0)}KB → sm ${(out.variants[0].bytes/1024).toFixed(1)}KB, lg ${(out.variants[1].bytes/1024).toFixed(1)}KB`);

// Same bytes twice must give the same hash, so a re-upload is idempotent.
const again = await processAvatar(withExif);
t('the hash is content-addressed', again.hash, out.hash);
const other = await processAvatar(await sharp({create:{width:300,height:300,channels:3,background:{r:1,g:2,b:3}}}).png().toBuffer());
t('a different image hashes differently', other.hash !== out.hash, true);
t('the key does not contain the user id', avatarStorageKey('user-abc-123', out.hash, 'sm').includes('user-abc'), false);

// SVG is a scripting format, not a picture format.
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script><rect width="200" height="200"/></svg>');
try { await processAvatar(svg); t('SVG is refused','accepted','refused'); }
catch(e){ t('SVG is refused', /SVG files aren't accepted/.test(e.message), true); }

// Not an image at all.
try { await processAvatar(Buffer.from('<html><script>alert(1)</script></html>')); t('HTML is refused','accepted','refused'); }
catch(e){ t('HTML is refused', /doesn't look like an image/.test(e.message), true); }

// A polyglot: real PNG bytes with HTML appended.
const png = await sharp({create:{width:200,height:200,channels:3,background:{r:9,g:9,b:9}}}).png().toBuffer();
const polyglot = Buffer.concat([png, Buffer.from('<script>alert(1)</script>')]);
const poly = await processAvatar(polyglot);
t('a polyglot is accepted but re-encoded', poly.variants.length, 2);
t('  ...and the script bytes are gone',
  poly.variants.some(v=>v.buffer.includes(Buffer.from('<script>'))), false);

// Too small to be useful, and empty.
try { await processAvatar(await sharp({create:{width:32,height:32,channels:3,background:{r:0,g:0,b:0}}}).png().toBuffer()); t('a 32px image is refused','accepted','refused'); }
catch(e){ t('a 32px image is refused', /smaller than 64 pixels/.test(e.message), true); }
try { await processAvatar(Buffer.alloc(0)); t('an empty file is refused','accepted','refused'); }
catch(e){ t('an empty file is refused', /empty/.test(e.message), true); }

// A decompression bomb: tiny file, enormous decoded size.
const bomb = await sharp({create:{width:12000,height:12000,channels:3,background:{r:255,g:255,b:255}}}).png({compressionLevel:9}).toBuffer();
console.log(`  --  bomb fixture: ${(bomb.length/1024).toFixed(0)}KB file, ${(12000*12000/1e6).toFixed(0)}MP decoded`);
try { await processAvatar(bomb); t('a decompression bomb is refused','accepted','refused'); }
catch(e){
  t('a decompression bomb is refused', /enormous/.test(e.message), true);
  console.log(`  --  message: "${e.message}"`);
}
// A large but legitimate photo must still be accepted.
const bigButFine = await sharp({create:{width:4000,height:3000,channels:3,background:{r:40,g:90,b:140}}}).jpeg().toBuffer();
const bigOut = await processAvatar(bigButFine);
t('a 12MP phone photo is fine', bigOut.variants.length, 2);


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
