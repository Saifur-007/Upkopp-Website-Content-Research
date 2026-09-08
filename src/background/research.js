/* On-demand page research and source-window validation. */
(() => {
  async function overview(windowId, file = 'page-overview.js', sourceURL) {
    const tab = await UpkoppMapBackground.currentTab(windowId);
    if (sourceURL && tab.url !== sourceURL) {
      throw new Error('The active page changed. Refresh Upkopp before exporting.');
    }
    const [injection] = await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
        frameIds: [0]
      },
      files: ['src/content/' + file]
    });
    const current = await UpkoppMapBackground.currentTab(windowId);
    if (current.id !== tab.id || current.url !== tab.url || !injection?.result) {
      throw new Error('The page changed while reading. Refresh to read the current page.');
    }
    return file === 'page-overview.js' ? {
      ...injection.result,
      tabId: tab.id,
      documentId: injection.documentId
    } : injection.result;
  }
  async function handle(message) {
    switch (message.type) {
      case 'UK_OVERVIEW':
        return overview(message.windowId);
      case 'UK_INDEXABILITY':
        return overview(message.windowId, 'indexability.js', message.sourceURL);
      case 'UK_IMAGE_DOWNLOAD_STATE':
        return UpkoppImageDownloads.progress();
      case 'UK_DOWNLOAD_IMAGES':
        {
          const tab = await UpkoppMapBackground.currentTab(message.windowId);
          if (tab.url !== message.sourceURL) {
            throw new Error('The source page changed. Refresh before downloading its images.');
          }
          if (!Array.isArray(message.images)) {
            throw new Error('Choose images to download.');
          }
          return UpkoppImageDownloads.start(message.images, tab.url);
        }
      case 'UK_WORKSPACE':
        return chrome.windows.create({
          url: chrome.runtime.getURL('src/popup/popup.html') + '?windowId=' + message.windowId,
          type: 'popup',
          width: 1040,
          height: 760
        });
      default:
        throw new Error('Unknown Upkopp request.');
    }
  }
  globalThis.UpkoppResearch = {
    handle
  };
})();
