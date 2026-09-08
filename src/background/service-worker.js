importScripts('../shared/capture-core.js', '../shared/settings.js');
const Core = UpkoppCapture;
let cached = null;
let chain = Promise.resolve();
const active = state => ['reading', 'scrolling', 'checking', 'preparing', 'cancelling'].includes(state?.job?.stage);
function queue(task) {
  const next = chain.then(task);
  chain = next.catch(error => console.error('Upkopp:', error));
  return next;
}
async function state() {
  if (cached) {
    return cached;
  }
  const data = await chrome.storage.session.get('captureState');
  cached = data.captureState || {
    job: null,
    result: null,
    previous: null,
    download: null,
    retention: 'session'
  };
  return cached;
}
async function save(value) {
  cached = value;
  try {
    value.retention = 'session';
    await chrome.storage.session.set({
      captureState: value
    });
  } catch {
    value.retention = 'memory';
    // Keep a small, truthful fallback if large-result storage is unavailable.
    await chrome.storage.session.set({
      captureState: {
        ...value,
        result: null,
        previous: null,
        retention: 'unavailable'
      }
    }).catch(() => {});
  }
  await chrome.storage.local.set({
    lastJob: value.job ? {
      id: value.job.id,
      tabId: value.job.tabId,
      url: value.job.url,
      title: value.job.title,
      stage: value.job.stage,
      startedAt: value.job.startedAt
    } : null
  }).catch(() => {});
  chrome.runtime.sendMessage({
    type: 'PC_STATE_CHANGED'
  }).catch(() => {});
}
async function signal(job, message) {
  try {
    return await chrome.tabs.sendMessage(job.tabId, message, job.documentId ? {
      documentId: job.documentId
    } : {});
  } catch {
    return null;
  }
}
function interrupted(s, message) {
  if (s.result) {
    Core.qualify(s.result, 'interrupted', 'interrupted', message);
  }
  if (s.job) {
    s.job.stage = 'interrupted';
    s.job.message = message;
  }
}
async function refresh() {
  const s = await state();
  if (!s.job) {
    const {
      lastJob
    } = await chrome.storage.local.get('lastJob');
    if (lastJob) {
      s.job = {
        ...lastJob,
        stage: 'interrupted',
        message: 'The browser or extension restarted. Session copies are no longer available; downloaded files are unchanged.'
      };
      await save(s);
    }
  } else if (active(s)) {
    const ping = await signal(s.job, {
      type: 'PC_PING'
    });
    if (!ping || ping.id !== s.job.id || ping.url !== s.job.url || Date.now() - s.job.startedAt > Core.LIMITS.durationMs + 5000) {
      interrupted(s, 'The page capture stopped before all checks finished.');
      await save(s);
    }
  }
  return s;
}
function eligible(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) && u.hostname !== 'chromewebstore.google.com' && !(u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'));
  } catch {
    return false;
  }
}
importScripts('page-map.js');
importScripts('research.js');
importScripts('../shared/research-core.js');
importScripts('image-downloads.js');
async function begin(tab) {
  const s = await state();
  if (active(s)) {
    if (s.job.tabId === tab.id && s.job.url === tab.url) {
      return s;
    }
    await signal(s.job, {
      type: 'PC_CANCEL',
      id: s.job.id,
      reason: 'interrupted'
    });
    interrupted(s, 'Another page was selected.');
  }
  const previous = s.result?.capture.status === 'completed' ? {
    result: s.result,
    job: {
      ...s.job
    },
    download: s.download
  } : s.previous || (s.result ? {
    result: s.result,
    job: {
      ...s.job
    },
    download: s.download
  } : null);
  const job = {
    id: crypto.randomUUID(),
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || '',
    title: tab.title || 'Current page',
    startedAt: Date.now(),
    stage: 'reading',
    counts: {
      sections: 0,
      headings: 0,
      images: 0,
      blocks: 0
    }
  };
  const next = {
    job,
    result: null,
    previous,
    download: null,
    retention: 'session'
  };
  if (!eligible(tab.url)) {
    job.stage = 'failed';
    job.message = 'This page cannot be captured. Open a normal website and click the extension icon.';
    await save(next);
    return next;
  }
  await save(next);
  try {
    const injected = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ['src/shared/capture-core.js', 'src/content/capture.js']
    });
    job.documentId = injected[0].documentId;
    const current = await chrome.tabs.get(tab.id);
    if (current.url !== job.url) {
      throw new Error('The page changed before capture could start.');
    }
    const started = await signal(job, {
      type: 'PC_START',
      job: {
        id: job.id,
        url: job.url
      }
    });
    if (!started?.ok) {
      throw new Error('Could not start capture. Reload the page, then click the extension icon again.');
    }
    await save(next);
  } catch (error) {
    job.stage = 'failed';
    job.message = 'Chrome could not read this page. ' + String(error.message).slice(0, 180);
    await save(next);
  }
  return next;
}
async function updateDownload(s) {
  if (!s.download?.id) {
    return;
  }
  const found = await chrome.downloads.search({
    id: s.download.id
  });
  if (found[0]) {
    s.download.status = found[0].state === 'complete' ? 'completed' : found[0].state === 'interrupted' ? 'failed' : 'downloading';
    s.download.filename = found[0].filename?.split(/[\\/]/).pop() || s.download.filename;
    s.download.error = found[0].error || null;
    await save(s);
  }
}
async function download(s) {
  if (!s.result) {
    throw new Error('This session copy is no longer available. Capture the page again.');
  }
  if (s.download?.status === 'downloading') {
    return s;
  }
  const errors = Core.validate(s.result);
  if (errors.length) {
    throw new Error('The result could not pass validation. Please retry capture.');
  }
  const text = Core.copyExport(s.result);
  if (!Core.copyContent(s.result).trim()) {
    throw new Error('No visible page text is available to export. Expand relevant content and capture again.');
  }
  if (Core.byteLength(text) > Core.LIMITS.bytes) {
    throw new Error('The result is too large to export safely.');
  }
  const filename = Core.filename(s.result, s.job.id);
  s.download = {
    status: 'downloading',
    filename,
    id: null
  };
  await save(s);
  try {
    const id = await chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(text),
      filename,
      conflictAction: 'uniquify',
      saveAs: (await UpkoppSettings.read()).saveAs
    });
    s.download.id = id;
    await save(s);
    await updateDownload(s);
  } catch (error) {
    s.download.status = 'failed';
    s.download.error = String(error.message).slice(0, 180);
    await save(s);
  }
  return s;
}
async function collectorMessage(message, sender) {
  const s = await state();
  const j = s.job;
  if (!j || !active(s) || sender.tab?.id !== j.tabId || sender.documentId !== j.documentId || message.id !== j.id || message.url !== j.url) {
    return {
      stale: true
    };
  }
  if (message.type === 'PC_PROGRESS') {
    if (j.stage !== 'cancelling') {
      j.stage = message.stage;
    }
    j.counts = message.counts;
    j.elapsed = message.elapsed;
    if (message.result && Core.byteLength(JSON.stringify(message.result)) < Core.LIMITS.bytes) {
      s.result = message.result;
    }
    await save(s);
    return {
      ok: true
    };
  }
  s.result = message.result;
  j.stage = 'preparing';
  await save(s);
  if (j.cancelRequested && s.result.capture.status === 'completed') {
    Core.qualify(s.result, 'cancelled', 'cancelled', 'Capture was cancelled.');
  }
  try {
    const tab = await chrome.tabs.get(j.tabId);
    if (tab.url !== j.url) {
      Core.qualify(s.result, 'interrupted', 'navigation', 'The source page changed during capture.');
    }
  } catch {
    Core.qualify(s.result, 'interrupted', 'closed_tab', 'The source tab was closed.');
  }
  const errors = Core.validate(s.result);
  if (!errors.length && !Core.copyContent(s.result).trim()) {
    errors.push('No readable content found');
  }
  if (errors.length || Core.byteLength(Core.serialize(s.result)) > Core.LIMITS.bytes) {
    j.stage = 'failed';
    j.message = errors[0] === 'No readable content found' ? 'No readable page content was found. This page may use a protected viewer or visual-only content.' : 'The capture could not be validated. Please reload the page and retry.';
    j.validation = errors;
    s.result = null;
    await save(s);
    return {
      ok: false
    };
  }
  s.result.capture.checks.schema_valid = true;
  j.stage = s.result.capture.status;
  j.counts = Core.counts(s.result);
  await save(s);
  if (j.stage === 'completed' && (await UpkoppSettings.read()).autoDownloadText) {
    await download(s);
  }
  return {
    ok: true
  };
}
// The toolbar popup is declared in manifest.json; capture remains explicit.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) {
    return;
  }
  if (sender.url === chrome.runtime.getURL('src/offscreen/images.html') && message.type === 'UK_ARCHIVE_UPDATE') {
    UpkoppImageDownloads.update(message).then(respond, error => respond({
      error: error.message
    }));
    return true;
  }
  if (message.type === 'PC_PROGRESS' || message.type === 'PC_DONE') {
    queue(() => collectorMessage(message, sender)).then(respond, error => respond({
      error: error.message
    }));
    return true;
  }
  if (sender.url?.split('?')[0] !== chrome.runtime.getURL('src/popup/popup.html')) {
    return;
  }
  if (message.type?.startsWith('UK_')) {
    UpkoppResearch.handle(message).then(respond, error => respond({
      error: error.message
    }));
    return true;
  }
  queue(async () => {
    if (message.type === 'PM_GET') {
      return UpkoppMapBackground.get(message);
    }
    if (message.type === 'PM_ACTION') {
      return UpkoppMapBackground.act(message);
    }
    if (message.type === 'PC_START_CURRENT') {
      return begin(await UpkoppMapBackground.currentTab(message.windowId));
    }
    if (message.type === 'PC_GET_STATE') {
      return refresh();
    }
    const s = await state();
    if (message.type === 'PC_CANCEL' && active(s)) {
      s.job.cancelRequested = true;
      s.job.stage = 'cancelling';
      await save(s);
      const reply = await signal(s.job, {
        type: 'PC_CANCEL',
        id: s.job.id,
        reason: 'cancelled'
      });
      if (!reply) {
        interrupted(s, 'The source page is no longer available.');
        await save(s);
      }
      return s;
    }
    if (message.type === 'PC_RETRY') {
      const tab = await UpkoppMapBackground.currentTab(message.windowId);
      if (!tab || tab.id !== s.job?.tabId || tab.url !== s.job?.url) {
        throw new Error('Use the toolbar icon on the page you want to capture.');
      }
      return begin(tab);
    }
    if (message.type === 'PC_DOWNLOAD') {
      return download(s);
    }
    if (message.type === 'PC_PREVIOUS' && s.previous && !active(s)) {
      const prior = s.previous;
      s.previous = s.result ? {
        job: s.job,
        result: s.result,
        download: s.download
      } : null;
      s.job = prior.job;
      s.result = prior.result;
      s.download = prior.download;
      await save(s);
      return s;
    }
    if (message.type === 'PC_CLEAR' && !active(s)) {
      s.result = null;
      s.previous = null;
      s.job = null;
      s.download = null;
      await save(s);
      return s;
    }
    return s;
  }).then(respond, error => respond({
    error: error.message
  }));
  return true;
});
chrome.downloads.onChanged.addListener(delta => queue(async () => {
  await UpkoppImageDownloads.changed(delta);
  const s = await state();
  if (s.download?.id === delta.id) {
    await updateDownload(s);
  }
}));
chrome.tabs.onUpdated.addListener((tabId, change) => queue(async () => {
  const s = await state();
  if (active(s) && s.job.tabId === tabId && (change.url && change.url !== s.job.url || change.status === 'loading')) {
    await signal(s.job, {
      type: 'PC_CANCEL',
      id: s.job.id,
      reason: 'interrupted'
    });
    interrupted(s, 'The source page navigated or reloaded during capture.');
    await save(s);
  }
}));
chrome.tabs.onRemoved.addListener(tabId => queue(async () => {
  const s = await state();
  if (active(s) && s.job.tabId === tabId) {
    interrupted(s, 'The source tab was closed.');
    await save(s);
  }
}));
chrome.tabs.onActivated.addListener(info => queue(async () => {
  const s = await state();
  if (active(s) && s.job.windowId === info.windowId && s.job.tabId !== info.tabId) {
    await signal(s.job, {
      type: 'PC_CANCEL',
      id: s.job.id,
      reason: 'interrupted'
    });
    interrupted(s, 'You switched tabs. Available content is still tied to the original page.');
    await save(s);
  }
}));
