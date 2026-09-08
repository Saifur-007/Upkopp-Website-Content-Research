const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const { test } = require('node:test');
const { createPackage } = require('../scripts/package.cjs');
const { crc32 } = require('../src/shared/zip-core.js');

test('Release ZIP is reproducible, preserves runtime files, and excludes development material', () => {
  const { bytes, files } = createPackage();
  assert.deepEqual(createPackage().bytes, bytes);
  assert(files.includes('manifest.json'));
  assert(files.includes('src/offscreen/images.html'));
  assert(files.includes('src/help/privacy.html'));
  assert(files.includes('assets/fonts/OFL.txt'));
  assert(files.every(file => !/^(tests|scripts|store|docs|dist|\.github)\//.test(file)));
  const extracted = new Map();
  const offsets = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameSize = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + nameSize;
    const name = bytes.toString('utf8', offset + 30, start);
    const data = inflateRawSync(bytes.subarray(start, start + size));
    assert.equal(data.length, bytes.readUInt32LE(offset + 22));
    assert.equal(crc32(data), bytes.readUInt32LE(offset + 14));
    assert.deepEqual(data, fs.readFileSync(path.join(__dirname, '..', name)));
    extracted.set(name, data);
    offsets.set(name, offset);
    offset = start + size;
  }
  const directoryStart = offset;
  for (const name of files) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const nameSize = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.toString('utf8', offset + 46, offset + 46 + nameSize), name);
    assert.equal(bytes.readUInt32LE(offset + 42), offsets.get(name));
    offset += 46 + nameSize;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x06054b50);
  assert.equal(bytes.readUInt16LE(offset + 10), files.length);
  assert.equal(bytes.readUInt32LE(offset + 16), directoryStart);
  assert.equal(bytes.readUInt32LE(offset + 12), offset - directoryStart);
  assert.equal(offset + 22, bytes.length);
  const manifest = JSON.parse(extracted.get('manifest.json'));
  for (const file of [manifest.background.service_worker, manifest.action.default_popup.split('?')[0], manifest.side_panel.default_path, ...Object.values(manifest.icons)]) {
    assert(extracted.has(file), 'Missing manifest entry: ' + file);
  }
});
