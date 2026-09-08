document.documentElement.dataset.surface = new URLSearchParams(location.search).has('popup') ? 'popup' : 'panel';
globalThis.UpkoppContext = {
  windowId: undefined,
  ready: (async () => {
    const requested = Number(new URLSearchParams(location.search).get('windowId'));
    const current = await chrome.windows.getCurrent();
    return requested > 0 && Number.isInteger(requested) ? requested : current.id;
  })()
};
UpkoppContext.ready.then(id => {
  UpkoppContext.windowId = id;
});
