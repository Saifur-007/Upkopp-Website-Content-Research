/* A hidden extension document owns the ZIP Blob until Chrome saves it. */
(() => {
  let busy = false;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.tab || sender.url && sender.url !== chrome.runtime.getURL('src/background/service-worker.js') || message.type !== 'UK_ARCHIVE_BUILD') {
      return;
    }
    if (busy) {
      respond({
        error: 'An image ZIP is already being prepared.'
      });
      return;
    }
    busy = true;
    respond({
      ok: true
    });
    const send = async data => {
      const response = await chrome.runtime.sendMessage({
        type: 'UK_ARCHIVE_UPDATE',
        id: message.id,
        ...data
      });
      if (!response?.ok) {
        throw Error(response?.error || 'The download handler did not acknowledge the archive. Please reload Upkopp.');
      }
      return response;
    };
    void (async () => {
      try {
        const blob = await UpkoppImageArchive.build(message.images, progress => send({
          state: 'preparing',
          ...progress
        }), undefined, message.folder);
        await send({
          state: 'ready',
          blobURL: URL.createObjectURL(blob)
        });
      } catch (error) {
        await send({
          state: 'failed',
          error: error.message
        });
      }
    })().catch(error => console.error('Upkopp archive:', error));
  });
})();
