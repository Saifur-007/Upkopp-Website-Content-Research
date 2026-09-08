/* Dependency-free ZIP (stored entries). Images are already compressed. */
(() => {
  const table = Uint32Array.from({
    length: 256
  }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    }
    return value >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function create(entries) {
    const parts = [];
    const directory = [];
    const names = new Set();
    let offset = 0;
    if (!entries.length || entries.length > 65535) {
      throw Error('Invalid ZIP entry count.');
    }
    for (const entry of entries) {
      if (typeof entry.name !== 'string' || entry.name.length > 240 || entry.name.split('/').some(part => !/^[a-z0-9_][a-z0-9_.-]*$/i.test(part) || part === '..') || names.has(entry.name)) {
        throw Error('Unsafe or duplicate ZIP filename.');
      }
      names.add(entry.name);
      const name = new TextEncoder().encode(entry.name);
      const bytes = entry.bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length > 0xffffffff) {
        throw Error('Invalid ZIP bytes.');
      }
      const checksum = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x800, true);
      lv.setUint16(12, 33, true); // DOS date: 1980-01-01.
      lv.setUint32(14, checksum, true);
      lv.setUint32(18, bytes.length, true);
      lv.setUint32(22, bytes.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x800, true);
      cv.setUint16(14, 33, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, bytes.length, true);
      cv.setUint32(24, bytes.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      parts.push(local, bytes);
      directory.push(central);
      offset += local.length + bytes.length;
      if (offset > 0xffffffff) {
        throw Error('ZIP is too large.');
      }
    }
    const size = directory.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], {
      type: 'application/zip'
    });
  }
  const api = {
    create,
    crc32
  };
  globalThis.UpkoppZip = api;
  if (typeof module !== 'undefined') {
    module.exports = api;
  }
})();
