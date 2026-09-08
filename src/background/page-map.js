/* Page-map routing. Content scripts are injected only into permitted documents. */
(() => {
  async function currentTab(windowId) {
    const [tab] = await chrome.tabs.query({
      active: true,
      ...(Number.isInteger(windowId) ? {
        windowId
      } : {
        currentWindow: true
      })
    });
    if (!tab || !eligible(tab.url)) {
      throw Error('Open a website and click the extension toolbar icon to allow this page.');
    }
    return tab;
  }
  async function readFrame(tabId, frame, options, force) {
    const target = {
      frameId: frame.frameId
    };
    try {
      let data;
      try {
        data = await chrome.tabs.sendMessage(tabId, {
          type: 'PM_SCAN',
          options,
          force
        }, target);
      } catch {
        await chrome.scripting.executeScript({
          target: {
            tabId,
            frameIds: [frame.frameId]
          },
          files: ['src/content/page-map.js']
        });
        data = await chrome.tabs.sendMessage(tabId, {
          type: 'PM_SCAN',
          options,
          force
        }, target);
      }
      if (!data || data.error) {
        throw Error(data?.error || 'No map response');
      }
      return {
        frameId: frame.frameId,
        parentFrameId: frame.parentFrameId,
        ...data
      };
    } catch {
      return {
        frameId: frame.frameId,
        parentFrameId: frame.parentFrameId,
        url: frame.url,
        title: frame.frameId === 0 ? 'Main document' : 'Embedded document',
        error: 'Page access is unavailable. Use the toolbar icon, or allow this embedded site below.'
      };
    }
  }
  async function get(message) {
    const tab = await currentTab(message.windowId);
    if (message.sourceURL && (message.sourceURL !== tab.url || message.sourceTabId !== tab.id)) {
      throw Error('The selected page changed. Refresh before exporting.');
    }
    const s = await state();
    if (active(s) && s.job.tabId === tab.id) {
      return {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        paused: true,
        documents: []
      };
    }
    const {
      mapSettings = {}
    } = await chrome.storage.local.get('mapSettings');
    let frames = await chrome.webNavigation.getAllFrames({
      tabId: tab.id
    });
    frames ||= [{
      frameId: 0,
      parentFrameId: -1,
      url: tab.url
    }];
    frames.sort((a, b) => a.frameId - b.frameId);
    if (message.sourceDocumentId && frames.find(frame => frame.frameId === 0)?.documentId !== message.sourceDocumentId) {
      throw Error('The page reloaded. Refresh before exporting.');
    }
    const documents = await Promise.all(frames.slice(0, 30).map(frame => readFrame(tab.id, frame, mapSettings, !!message.force)));
    const still = await currentTab(message.windowId);
    if (still.id !== tab.id || still.url !== tab.url) {
      throw Error('The selected page changed. Refresh the page map.');
    }
    if (message.sourceDocumentId) {
      const latestFrames = await chrome.webNavigation.getAllFrames({
        tabId: tab.id
      });
      if (latestFrames?.find(frame => frame.frameId === 0)?.documentId !== message.sourceDocumentId) {
        throw Error('The page reloaded during export. Refresh and try again.');
      }
    }
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title,
      documents,
      frameLimit: frames.length > 30
    };
  }
  async function act(message) {
    const tab = await currentTab(message.windowId);
    if (tab.id !== message.tabId) {
      throw Error('The active tab changed. Refresh the page map.');
    }
    const s = await state();
    if (active(s) && s.job.tabId === tab.id) {
      throw Error('Finish or cancel text capture before navigating the page map.');
    }
    if (!['jump', 'reveal', 'top'].includes(message.action)) {
      throw Error('Unknown page-map action');
    }
    // Reveal ancestor frames by matching the actual child window, not a URL
    // that can be duplicated or redirected. Tokens are created only here.
    if (message.frameId !== 0 && ['jump', 'top'].includes(message.action)) {
      const frames = await chrome.webNavigation.getAllFrames({
        tabId: tab.id
      });
      let child = frames?.find(frame => frame.frameId === message.frameId);
      let depth = 0;
      if (!child) {
        throw Error('The frame was removed. Refresh the page map.');
      }
      const targetData = await readFrame(tab.id, child, {}, false);
      if (targetData.error || targetData.epoch !== message.epoch || targetData.url !== message.url) {
        throw Error('The frame changed. Refresh the page map.');
      }
      while (child && child.parentFrameId >= 0 && depth++ < 20) {
        const parent = frames.find(frame => frame.frameId === child.parentFrameId);
        if (!parent) {
          break;
        }
        const parentData = await readFrame(tab.id, parent, {}, false);
        const childData = await readFrame(tab.id, child, {}, false);
        if (parentData.error || childData.error) {
          break;
        }
        const token = crypto.randomUUID();
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PM_ACT',
          action: 'arm-frame',
          token,
          epoch: parentData.epoch,
          url: parentData.url
        }, {
          frameId: parent.frameId
        });
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PM_ACT',
          action: 'reveal-frame',
          token,
          epoch: childData.epoch,
          url: childData.url
        }, {
          frameId: child.frameId
        });
        child = parent;
      }
    }
    const reply = await chrome.tabs.sendMessage(tab.id, {
      type: 'PM_ACT',
      epoch: message.epoch,
      url: message.url,
      id: message.id,
      action: message.action,
      kind: message.kind,
      enabled: message.enabled,
      offset: message.offset,
      highlight: message.highlight
    }, {
      frameId: message.frameId
    });
    if (reply?.error) {
      throw Error(reply.error);
    }
    return reply || {
      ok: false
    };
  }
  globalThis.UpkoppMapBackground = {
    get,
    act,
    currentTab
  };
})();
