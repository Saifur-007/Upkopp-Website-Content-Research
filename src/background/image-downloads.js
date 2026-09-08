/* Persist ZIP progress independently of the popup and reconcile Chrome downloads. */
(() => {
  const key = 'upkoppImageDownloads';
  const documentPath = 'src/offscreen/images.html';
  let changes = Promise.resolve();
  function serial(task) {
    const next = changes.then(task);
    changes = next.catch(() => {});
    return next;
  }
  const read = async () => (await chrome.storage.session.get(key))[key] || null;
  const save = job => chrome.storage.session.set({
    [key]: job
  });
  const contexts = () => chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(documentPath)]
  });
  async function close() {
    if ((await contexts()).length) {
      await chrome.offscreen.closeDocument();
    }
  }
  async function reconcile(job) {
    if (!job) {
      return null;
    }
    if (job.downloadId != null && job.state === 'downloading') {
      const [download] = await chrome.downloads.search({
        id: job.downloadId
      });
      if (download?.state === 'complete') {
        job.state = 'complete';
      } else if (!download || download.state === 'interrupted') {
        job.state = 'failed';
        job.error = download?.error || 'The ZIP download is no longer available.';
      }
    }
    if (job.state === 'preparing' && !(await contexts()).length) {
      job.state = 'failed';
      job.error = 'The image export was interrupted. Select the images and try again.';
    }
    if (['complete', 'failed'].includes(job.state)) {
      await close();
    }
    await save(job);
    return job;
  }
  const progress = () => serial(async () => reconcile(await read()));
  const changed = delta => serial(async () => {
    const job = await read();
    if (job?.downloadId !== delta.id) {
      return;
    }
    await reconcile(job);
  });
  const start = (images, sourceURL) => serial(async () => {
    const previous = await reconcile(await read());
    if (previous && ['preparing', 'downloading'].includes(previous.state)) {
      throw Error('An image ZIP is already being prepared or downloaded.');
    }
    if (!images.length || images.length > 2000 || images.some(image => !UpkoppResearchCore.safeImageURL(image?.src))) {
      throw Error('Choose between 1 and 2,000 valid images.');
    }
    const unique = [...new Map(images.map(image => [image.src, {
      src: image.src,
      number: image.number
    }])).values()];
    const origins = [...new Set(unique.filter(image => /^https?:/.test(image.src)).map(image => new URL(image.src).origin + '/*'))];
    if (origins.length && !(await chrome.permissions.contains({
      origins
    }))) {
      throw Error('Allow access to the image hosts to create a ZIP.');
    }
    const startedAt = new Date().toISOString();
    const host = new URL(sourceURL).hostname.replace(/[^a-z0-9.-]/gi, '-');
    const settings = await UpkoppSettings.read();
    const job = {
      id: crypto.randomUUID(),
      sourceURL,
      startedAt,
      filename: 'Upkopp/upkopp-' + host + '-images-' + startedAt.replace(/[^0-9]/g, '') + '.zip',
      folder: 'upkopp-' + host.replace(/[^a-z0-9-]/gi, '-').slice(0, 70) + '-images',
      state: 'preparing',
      total: unique.length,
      processed: 0,
      included: 0,
      failures: [],
      saveAs: settings.saveAs
    };
    await save(job);
    try {
      await chrome.offscreen.createDocument({
        url: documentPath,
        reasons: ['BLOBS'],
        justification: 'Package selected image files into one local ZIP download.'
      });
      const response = await chrome.runtime.sendMessage({
        type: 'UK_ARCHIVE_BUILD',
        id: job.id,
        folder: job.folder,
        images: unique
      });
      if (!response?.ok) {
        throw Error(response?.error || 'The archive could not be started.');
      }
    } catch (error) {
      job.state = 'failed';
      job.error = error.message;
      await save(job);
      await close();
      throw error;
    }
    return job;
  });
  const update = message => serial(async () => {
    const job = await read();
    if (!job || job.id !== message.id || job.state !== 'preparing') {
      return {
        stale: true
      };
    }
    if (message.state === 'preparing') {
      job.processed = message.processed;
      job.included = message.included;
      job.failures = message.failures;
    } else if (message.state === 'ready') {
      try {
        if (!message.blobURL?.startsWith('blob:chrome-extension://' + chrome.runtime.id + '/')) {
          throw Error('Invalid archive URL.');
        }
        job.downloadId = await chrome.downloads.download({
          url: message.blobURL,
          filename: job.filename,
          conflictAction: 'uniquify',
          saveAs: job.saveAs
        });
        job.state = 'downloading';
      } catch (error) {
        job.state = 'failed';
        job.error = error.message;
      }
    } else if (message.state === 'failed') {
      job.state = 'failed';
      job.error = message.error;
    }
    await save(job);
    await reconcile(job);
    return {
      ok: true
    };
  });
  globalThis.UpkoppImageDownloads = {
    start,
    progress,
    changed,
    update
  };
})();
