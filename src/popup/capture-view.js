(() => {
  const Core = UpkoppCapture;
  const content = document.getElementById('content');
  const error = document.getElementById('error');
  const announcement = document.getElementById('announcement');
  let current = null;
  let preview = false;
  let previewLimit = 12000;
  let busy = false;
  let announced = '';
  let refreshing = false;
  const isActive = stage => ['reading', 'scrolling', 'checking', 'preparing', 'cancelling'].includes(stage);
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    if (className) {
      node.className = className;
    }
    return node;
  }
  function paragraph(text, cls) {
    return el('p', text, cls);
  }
  function button(label, action, primary = false) {
    const b = el('button', label, primary ? 'primary' : '');
    b.type = 'button';
    b.dataset.action = action;
    b.addEventListener('click', () => act(action));
    return b;
  }
  function actions(entries) {
    const list = el('div', null, 'actions');
    entries.forEach(([label, action, primary]) => list.append(button(label, action, primary)));
    return list;
  }
  function stats(counts = {}) {
    const group = el('div', null, 'stats');
    for (const [key, label] of [['sections', 'sections'], ['headings', 'headings'], ['blocks', 'items read']]) {
      const item = el('div');
      item.append(el('strong', counts[key] || 0), el('span', label, 'caption'));
      group.append(item);
    }
    return group;
  }
  function bullets(items) {
    const list = el('ul', null, 'status-list');
    for (const [mark, text] of items) {
      const li = el('li');
      const symbol = el('span', mark, 'mark');
      symbol.setAttribute('aria-hidden', 'true');
      li.append(symbol, el('span', text));
      list.append(li);
    }
    return list;
  }
  async function send(type) {
    const response = await chrome.runtime.sendMessage({
      type,
      windowId: globalThis.UpkoppContext ? await UpkoppContext.ready : undefined
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    return response;
  }
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }
  async function refresh() {
    if (refreshing || busy) {
      return;
    }
    refreshing = true;
    try {
      const response = await send('PC_GET_STATE');
      if (response) {
        render(response);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      refreshing = false;
    }
  }
  async function act(action) {
    if (action === 'preview') {
      preview = !preview;
      previewLimit = 12000;
      render(current);
      return;
    }
    if (action === 'more') {
      previewLimit += 12000;
      render(current);
      return;
    }
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(Core.copyExport(current.result));
        announcement.textContent = 'Text copied to clipboard.';
        const copyButton = content.querySelector('[data-action="copy"]');
        if (copyButton) {
          copyButton.textContent = 'Copied';
          setTimeout(() => {
            if (copyButton.isConnected) {
              copyButton.textContent = 'Copy text';
            }
          }, 1800);
        }
      } catch (error) {
        showError('Could not copy text: ' + error.message);
      }
      return;
    }
    if (busy) {
      return;
    }
    busy = true;
    error.hidden = true;
    const types = {
      cancel: 'PC_CANCEL',
      retry: 'PC_RETRY',
      start: 'PC_START_CURRENT',
      download: 'PC_DOWNLOAD',
      previous: 'PC_PREVIOUS',
      clear: 'PC_CLEAR'
    };
    try {
      const response = await send(types[action]);
      if (action === 'retry' || action === 'previous') {
        preview = false;
      }
      if (response) {
        render(response);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
    }
  }
  function showPreview(result) {
    const group = el('section');
    group.append(el('h2', 'Text for copywriting'), paragraph('This is the text saved in your download. Navigation menus, image data and technical capture details are excluded.', 'caption'));
    const text = Core.copyExport(result);
    group.append(el('pre', text.slice(0, previewLimit), 'copy-preview'));
    if (text.length > previewLimit) {
      group.append(paragraph('Preview shortened. The download contains all available text.', 'caption'), button('Show more text', 'more'));
    }
    return group;
  }
  function render(s) {
    const focused = document.activeElement?.dataset?.action;
    current = s;
    content.replaceChildren();
    const j = s.job;
    const result = s.result;
    const stage = j?.stage;
    const active = isActive(stage);
    if (j?.url) {
      const source = el('div', null, 'source');
      source.append(paragraph(active ? 'CAPTURING THIS PAGE' : 'SOURCE PAGE', 'caption'), paragraph(j.url), paragraph(result?.page.title || j.title, 'title'));
      content.append(source);
    }
    const title = !j ? 'Ready when you are' : {
      reading: 'Reading content',
      scrolling: 'Scrolling through the page',
      checking: 'Checking the capture',
      preparing: 'Preparing the text',
      cancelling: 'Stopping capture…',
      partial: 'Needs attention',
      cancelled: 'Capture cancelled',
      interrupted: 'Capture interrupted',
      failed: 'Capture unavailable'
    }[stage] || (s.download?.status === 'completed' ? 'Text saved' : s.download?.status === 'failed' ? 'Text download failed' : s.download?.status === 'downloading' ? 'Saving text…' : 'Capture finished');
    const heading = el('h2', title, active ? 'brand' : stage === 'completed' && s.download?.status !== 'failed' ? 'good' : ['partial', 'interrupted', 'failed'].includes(stage) || s.download?.status === 'failed' ? 'warning-title' : '');
    content.append(heading);
    if (announced !== title) {
      announcement.textContent = title;
      announced = title;
    }
    if (!j) {
      content.append(paragraph('Capture the current website as clean text. Scrolling starts when you choose Capture text.'), actions([['Capture text', 'start', true]]), bullets([['✓', 'Original text and heading structure'], ['✓', 'Clean text for copywriting research'], ['↓', 'One text file for the current page']]), paragraph('You can cancel at any time. Keep the source tab open while capture runs.', 'caption'));
    } else if (active) {
      content.append(paragraph('Collecting page content and checking what was observed. Keep this tab selected.'), actions([['Cancel capture', 'cancel', false]]));
      const stages = [['reading', 'Reading content'], ['scrolling', 'Scrolling through the page'], ['checking', 'Checking the capture'], ['preparing', 'Preparing the text']];
      const list = el('ol', null, 'steps');
      const index = stages.findIndex(([key]) => key === stage);
      stages.forEach(([key, label], i) => {
        const li = el('li', null, i === index ? 'current' : '');
        li.append(el('span', i < index ? '✓' : i === index ? '●' : '○', 'mark'), el('span', label, 'step-label'), el('span', i < index ? 'Done' : i === index ? 'Active' : 'Next', 'caption'));
        list.append(li);
      });
      content.append(list, paragraph('Observed so far', 'caption'), stats(j.counts), paragraph('Up to 60 seconds. The page scrolls automatically; manual scrolling cancels capture.', 'caption'));
    } else {
      if (j.message) {
        content.append(paragraph(j.message));
      }
      if (result) {
        content.append(paragraph(stage === 'completed' ? 'Original page text is ready to use.' : 'Available content is retained with its limitations.'));
        const details = el('details');
        details.append(el('summary', 'Capture details'), stats(result.capture.counts));
        const retention = s.retention === 'session' ? 'Retry copy available this browser session' : 'Session retention failed; download the available result now';
        details.append(bullets([['✓', stage === 'completed' ? 'Capture checks finished' : 'Partial result — review limitations'], ['◷', retention], ['↓', s.download?.status === 'completed' ? 'Text download completed' : s.download?.status === 'failed' ? 'Download failed; you can retry' : s.download?.status === 'downloading' ? 'Download in progress' : 'Not downloaded']]));
        for (const warning of result.capture.warnings.filter(w => w.severity === 'warning')) {
          const issue = el('div', null, 'issue');
          issue.append(el('strong', warning.message));
          if (warning.recovery) {
            issue.append(paragraph(warning.recovery, 'caption'));
          }
          content.append(issue);
        }
        if (s.download?.error) {
          content.append(paragraph(s.download.error, 'caption'));
        }
        details.append(paragraph(s.download?.status === 'completed' ? 'Downloaded filename' : 'Export filename', 'caption'), el('code', s.download?.filename || Core.filename(result, j.id), 'filename'));
        const entries = stage === 'completed' && s.download?.status === 'completed' ? [[preview ? 'Hide content preview' : 'Preview content', 'preview', true], ['Download again', 'download', false], ['Capture again', 'retry', false]] : [[s.download?.status === 'failed' ? 'Retry download' : stage === 'completed' ? 'Download text' : 'Download available content', 'download', true], [preview ? 'Hide content preview' : 'Preview content', 'preview', false], ['Retry capture', 'retry', false]];
        entries.unshift(['Copy text', 'copy', false]);
        const controls = actions(entries);
        content.append(controls);
        if (preview) {
          content.append(showPreview(result));
        }
        if (s.retention === 'session') {
          details.append(paragraph('Session copies clear when Chrome or the extension restarts. Downloaded files stay in your chosen download folder.', 'caption'));
        }
        content.append(details);
      } else if (j) {
        content.append(actions([['Retry capture', 'retry', true]]));
      }
      if (s.previous) {
        content.append(actions([['View previous result', 'previous', false]]));
      }
      if (result || s.previous) {
        const clear = button('Forget session copies', 'clear');
        clear.className = 'quiet';
        content.append(clear);
      }
    }
    if (focused) {
      content.querySelector('[data-action="' + focused + '"]')?.focus({
        preventScroll: true
      });
    }
  }
  if (!globalThis.chrome?.runtime?.id) {
    showError('This is an extension page. Load the folder containing manifest.json in Chrome through Developer mode → Load unpacked, then click its toolbar icon.');
    return;
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'PC_STATE_CHANGED') {
      refresh();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.captureState) {
      refresh();
    }
  });
  setInterval(() => {
    if (current && isActive(current.job?.stage)) {
      refresh();
    }
  }, 3000);
  refresh();
})();
