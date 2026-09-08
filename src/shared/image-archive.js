/* Fetch selected image bytes with explicit host access and bounded memory. */
(() => {
  const limits = Object.freeze({
    imageBytes: 20 * 1024 * 1024,
    archiveBytes: 128 * 1024 * 1024,
    timeout: 20000,
    duration: 180000
  });
  const extensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico'
  };
  async function readImage(image, remaining, fetcher = fetch) {
    if (image.src.startsWith('blob:')) {
      throw Error('This temporary page image cannot be exported. Open its original or refresh the page.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeout);
    let reader;
    try {
      // No cookies, no page credentials, and no silent requests to redirect destinations.
      const response = await fetcher(image.src, {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer'
      });
      if (!response.ok) {
        throw Error('HTTP ' + response.status);
      }
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      const extension = extensions[mime];
      if (!extension) {
        throw Error('The server did not return a supported image type.');
      }
      const maximum = Math.min(limits.imageBytes, remaining);
      if (Number(response.headers.get('content-length')) > maximum) {
        throw Error('Image exceeds the remaining export size limit.');
      }
      reader = response.body?.getReader();
      if (!reader) {
        throw Error('Image bytes are unavailable.');
      }
      const chunks = [];
      let size = 0;
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) {
          break;
        }
        size += value.length;
        if (size > maximum) {
          throw Error('Image exceeds the remaining export size limit.');
        }
        chunks.push(value);
      }
      if (!size) {
        throw Error('The image is empty.');
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        bytes,
        extension
      };
    } finally {
      clearTimeout(timer);
      await reader?.cancel().catch(() => {});
      controller.abort();
    }
  }
  async function build(images, notify, fetcher = fetch, folder = 'upkopp-images') {
    if (!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(folder)) {
      throw Error('Invalid image folder name.');
    }
    const entries = [];
    const failures = [];
    const deadline = Date.now() + limits.duration;
    let size = 0;
    let lastNotification = -Infinity;
    for (const [index, image] of images.entries()) {
      try {
        if (Date.now() > deadline) {
          throw Error('The three-minute export time limit was reached.');
        }
        if (size >= limits.archiveBytes) {
          throw Error('The 128 MB archive size limit was reached.');
        }
        const result = await readImage(image, limits.archiveBytes - size, fetcher);
        size += result.bytes.length;
        entries.push({
          name: folder + '/image-' + String(index + 1).padStart(4, '0') + '.' + result.extension,
          bytes: result.bytes
        });
      } catch (error) {
        failures.push({
          number: image.number,
          error: error.name === 'AbortError' ? 'The image request timed out.' : error.message
        });
      }
      const now = Date.now();
      if (index === images.length - 1 || now - lastNotification >= 100) {
        await notify({
          processed: index + 1,
          included: entries.length,
          failures: [...failures]
        });
        lastNotification = now;
      }
    }
    if (!entries.length) {
      throw Error('No images could be packaged. Check the failures and try again.');
    }
    if (failures.length) {
      const report = 'Upkopp image export — incomplete\n' + entries.length + ' of ' + images.length + ' unique images included.\n\n' + failures.map(item => 'Image ' + item.number + ': ' + item.error).join('\n') + '\n';
      entries.push({
        name: folder + '/_export-report.txt',
        bytes: new TextEncoder().encode(report)
      });
    }
    return UpkoppZip.create(entries);
  }
  const api = {
    limits,
    readImage,
    build
  };
  globalThis.UpkoppImageArchive = api;
  if (typeof module !== 'undefined') {
    module.exports = api;
  }
})();
