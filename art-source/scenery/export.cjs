const { chromium } = require('playwright'); const fs = require('node:fs');
require('esbuild').buildSync({ entryPoints: ['src/export.ts'], bundle: true, outfile: 'dist/export.js', format: 'iife', alias: { '@': './src' }, logLevel: 'warning' });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('pageerror', e.message));
  await p.setContent('<html><body></body></html>');
  await p.addScriptTag({ content: fs.readFileSync('dist/export.js','utf8') });
  await p.waitForFunction('window.done === true', null, { timeout: 120000 });
  const glbs = await p.evaluate('window.glbs');
  for (const [n, b64] of Object.entries(glbs)) { const buf = Buffer.from(b64, 'base64'); fs.writeFileSync(`dist/${n}.glb`, buf); console.log(n, (buf.length/1024).toFixed(0)+' KB'); }
  await b.close();
})();
