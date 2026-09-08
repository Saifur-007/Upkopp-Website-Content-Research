const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  test
} = require('node:test');
const Zip = require('../src/shared/zip-core.js');
const Archive = require('../src/shared/image-archive.js');
function entries(buffer) {
  const found = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const length = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength;
    const data = buffer.subarray(start, start + length);
    assert.equal(Zip.crc32(data), buffer.readUInt32LE(offset + 14));
    found.push({
      name: buffer.toString('utf8', offset + 30, start),
      data
    });
    offset = start + length;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length - 12), found.length);
  assert.equal(buffer.readUInt32LE(buffer.length - 6), offset);
  return found;
}
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64'));
test('Fast image batches coalesce progress messages while preserving final failures and files', async () => {
  const updates = [];
  const images = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, src: 'https://example.com/' + index }));
  const originalNow = Date.now;
  Date.now = () => 1000;
  try {
    const blob = await Archive.build(images, async value => updates.push(value), async url =>
      url.endsWith('/99') ? new Response('Blocked', { status: 403 }) : new Response(png, { headers: { 'content-type': 'image/png' } }));
    assert.equal(updates.length, 2);
    assert.equal(updates.at(-1).processed, 100);
    assert.equal(updates.at(-1).included, 99);
    assert.equal(updates.at(-1).failures[0].number, 100);
    assert.equal(entries(Buffer.from(await blob.arrayBuffer())).length, 100);
  } finally {
    Date.now = originalNow;
  }
});
test('ZIP preserves real image bytes and produces a valid central directory', async () => {
  assert.equal(Zip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const blob = Zip.create([{
    name: 'upkopp-images/image-0001.png',
    bytes: png
  }]);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const files = entries(bytes);
  assert.equal(files[0].name, 'upkopp-images/image-0001.png');
  assert.deepEqual(files[0].data, Buffer.from(png));
  assert.throws(() => Zip.create([{
    name: '../escape.png',
    bytes: png
  }]), /Unsafe/);
  for (const name of ['../escape.png', '/absolute.png', 'images/../escape.png', 'images//a.png', 'C:/bad.png', 'images/./a.png']) {
    assert.throws(() => Zip.create([{
      name,
      bytes: png
    }]), /Unsafe/);
  }
  const generated = path.join(__dirname, 'browser/generated');
  fs.mkdirSync(generated, {
    recursive: true
  });
  fs.writeFileSync(path.join(generated, 'archive-check.zip'), bytes);
});
test('Partial ZIP contains actual images plus a concise failure report; HTTP failures never become image files', async () => {
  const updates = [];
  const blob = await Archive.build([{
    number: 1,
    src: 'https://example.com/a'
  }, {
    number: 2,
    src: 'https://example.com/blocked'
  }], async data => updates.push(data), async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return url.endsWith('/a') ? new Response(png, {
      headers: {
        'content-type': 'image/png'
      }
    }) : new Response('Forbidden', {
      status: 403
    });
  });
  const files = entries(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(files.map(file => file.name), ['upkopp-images/image-0001.png', 'upkopp-images/_export-report.txt']);
  assert(files[1].data.toString().includes('Image 2: HTTP 403'));
  assert.equal(updates.at(-1).included, 1);
  assert.equal(updates.at(-1).processed, 2);
});
test('Archive rejects HTML, empty images, oversized streams, and unavailable blobs; no empty ZIP', async () => {
  const image = {
    number: 1,
    src: 'https://example.com/a'
  };
  await assert.rejects(() => Archive.readImage(image, 100, async () => new Response('login', {
    headers: {
      'content-type': 'text/html'
    }
  })), /supported image/);
  await assert.rejects(() => Archive.readImage(image, 100, async () => new Response(null, {
    headers: {
      'content-type': 'image/png'
    }
  })), /unavailable/);
  await assert.rejects(() => Archive.readImage(image, 2, async () => new Response(png, {
    headers: {
      'content-type': 'image/png'
    }
  })), /size limit/);
  await assert.rejects(() => Archive.readImage({
    src: 'blob:https://example.com/a'
  }, 100), /temporary/);
  await assert.rejects(() => Archive.build([image], async () => {}, async () => new Response('no', {
    status: 404
  })), /No images could/);
});
