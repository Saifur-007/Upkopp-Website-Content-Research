const fs = require('node:fs');
const path = require('node:path');
const {
  spawnSync
} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function files(folder) {
  return fs.readdirSync(folder, {
    withFileTypes: true
  }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
for (const file of files(path.join(root, 'src')).filter(file => file.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });
  assert.equal(check.status, 0, check.stderr);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(manifest.name, 'Upkopp — Website Content Research');
assert(manifest.description.length <= 132, 'Store summary exceeds 132 characters');
assert.equal(manifest.manifest_version, 3);
assert(!manifest.host_permissions?.length, 'Use optional site access, not blanket install access');
assert(!manifest.content_scripts, 'Page readers must remain on demand');
assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
assert.deepEqual(manifest.permissions.slice().sort(), ['activeTab', 'scripting', 'sidePanel', 'storage', 'downloads', 'webNavigation', 'offscreen'].sort());
const popup = path.join(root, manifest.action.default_popup.split('?')[0]);
for (const file of [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons)]) {
  assert(fs.existsSync(path.join(root, file)), 'Missing manifest file: ' + file);
}
const html = fs.readFileSync(popup, 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert(fs.existsSync(path.resolve(path.dirname(popup), match[1].split('#')[0])), 'Missing popup asset: ' + match[1]);
}
for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
  assert(!match[1].trim(), 'Popup scripts must be external for extension CSP.');
}
const offscreen = path.join(root, 'src/offscreen/images.html');
const fontsCSS = fs.readFileSync(path.join(root, 'src/popup/fonts.css'), 'utf8');
for (const match of fontsCSS.matchAll(/url\('([^']+)'\)/g)) {
  const font = fs.readFileSync(path.resolve(path.dirname(popup), match[1]));
  assert.equal(font.readUInt32BE(0), 0x00010000, 'Bundled font must be a valid TrueType file');
}
assert(fs.readFileSync(path.join(root, 'assets/fonts/OFL.txt'), 'utf8').includes('SIL OPEN FONT LICENSE'));
const archiveHTML = fs.readFileSync(offscreen, 'utf8');
for (const match of archiveHTML.matchAll(/src="([^"]+)"/g)) {
  assert(fs.existsSync(path.resolve(path.dirname(offscreen), match[1])), 'Missing archive script: ' + match[1]);
}
// All shipped HTML, including local help, must resolve its resources offline.
for (const file of files(path.join(root, 'src')).filter(file => file.endsWith('.html'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1].split('#')[0];
    if (!reference || /^https?:/.test(reference)) {
      continue;
    }
    assert(fs.existsSync(path.resolve(path.dirname(file), reference)), 'Missing local resource: ' + reference);
  }
  assert(!/<script[^>]+src=["']https?:/i.test(source), 'Remote scripts are not allowed');
  assert(!/\son[a-z]+\s*=/i.test(source), 'Use external event handlers for extension CSP');
  for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    assert(!match[1].trim(), 'Inline executable scripts are not allowed');
  }
}
console.log('PASS source syntax, version agreement, permission contract, local assets, fonts, and script policy');
