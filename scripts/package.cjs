/* Build a deterministic Chrome Web Store ZIP from an explicit runtime allowlist. */
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { crc32 } = require('../src/shared/zip-core.js');

const root = path.resolve(__dirname, '..');
const assetFiles = [
  'assets/logo.svg', 'assets/icon16.png', 'assets/icon32.png',
  'assets/icon48.png', 'assets/icon128.png',
  'assets/fonts/Poppins-Regular.ttf', 'assets/fonts/Poppins-Medium.ttf',
  'assets/fonts/Poppins-SemiBold.ttf', 'assets/fonts/OFL.txt',
  'assets/fonts/README.md'
];

function sourceFiles(directory, base = root) {
  return fs.readdirSync(path.join(base, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory + '/' + entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error('Release sources must not contain symlinks: ' + relative);
    }
    if (entry.isDirectory()) {
      return sourceFiles(relative, base);
    }
    if (!/\.(js|html|css)$/.test(entry.name)) {
      throw new Error('Unexpected runtime file: ' + relative);
    }
    return [relative];
  });
}

function releaseFiles(base = root) {
  return ['manifest.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', ...assetFiles, ...sourceFiles('src', base)].sort();
}

function createPackage(base = root) {
  const files = releaseFiles(base);
  const localParts = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const filePath = path.join(base, file);
    if (!fs.lstatSync(filePath).isFile()) {
      throw new Error('Release input must be a regular file: ' + file);
    }
    const bytes = fs.readFileSync(filePath);
    const compressed = deflateRawSync(bytes, { level: 9 });
    const name = Buffer.from(file, 'utf8');
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // Stable DOS date: 1980-01-01.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    localParts.push(local, compressed);
    directory.push(central);
    offset += local.length + compressed.length;
  }
  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return { files, bytes: Buffer.concat([...localParts, ...directory, end]) };
}

function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('Use a three-part release version.');
  }
  const { files, bytes } = createPackage();
  const name = 'upkopp-content-research-' + manifest.version + '.zip';
  const destination = path.join(root, 'dist');
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, name), bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), hash + '  ' + name + '\n');
  fs.writeFileSync(path.join(destination, 'FILES.txt'), files.join('\n') + '\n');
  console.log('Built dist/' + name + ' (' + files.length + ' files; ' + bytes.length + ' bytes).');
}

if (require.main === module) {
  build();
}
module.exports = { createPackage, releaseFiles };
