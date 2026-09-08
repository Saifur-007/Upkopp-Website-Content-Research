/* Preferences are local, validated, and shared by every download surface. */
(() => {
  const key = 'upkoppSettings';
  const defaults = Object.freeze({
    theme: 'system',
    jsonAltText: false,
    autoDownloadText: true,
    saveAs: false
  });
  function normalize(value = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [name, name === 'theme' ? ['system', 'light', 'dark'].includes(value?.[name]) ? value[name] : fallback : typeof value?.[name] === 'boolean' ? value[name] : fallback]));
  }
  async function read() {
    const stored = await chrome.storage.local.get([key, 'mapSettings']);
    return normalize(stored[key] || {
      theme: stored.mapSettings?.theme
    });
  }
  async function write(value) {
    const settings = normalize(value);
    await chrome.storage.local.set({
      [key]: settings
    });
    return settings;
  }
  const api = {
    key,
    defaults,
    normalize,
    read,
    write
  };
  globalThis.UpkoppSettings = api;
  if (typeof module !== 'undefined') {
    module.exports = api;
  }
})();
