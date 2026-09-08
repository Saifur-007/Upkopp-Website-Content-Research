/* Compact, source-oriented exports. Never serialize the internal capture tree or image bytes. */
(() => {
  function contentText(blocks = []) {
    return blocks.map(block => block.type === 'heading' ? '#'.repeat(Math.min(6, Math.max(1, block.level))) + ' ' + block.text : block.type === 'list-item' ? '- ' + block.text : block.text).join('\n\n');
  }
  function pageMapExport(map, settings = {}) {
    if (!map || map.paused) {
      throw Error('Finish text capture before exporting Content and Page map together.');
    }
    const options = {
      ...settings,
      showHidden: true,
      showEmpty: true
    };
    const cleanItem = (item, kind) => {
      const output = kind === 'headings' ? {
        level: item.level,
        text: item.label || ''
      } : kind === 'landmarks' ? {
        role: item.role,
        label: item.label || '',
        depth: item.depth
      } : {
        section: item.index,
        tag: item.tag,
        label: item.label || ''
      };
      if (item.href?.includes('#')) {
        output.anchor = item.href;
      }
      if (item.hidden) {
        output.hidden = true;
      }
      if (item.warnings?.length) {
        output.notes = [...new Set(item.warnings)];
      }
      return output;
    };
    const output = {
      documents: (map.documents || []).map(doc => {
        const result = {
          title: doc.title,
          url: doc.url
        };
        if (doc.error) {
          return {
            ...result,
            note: doc.error
          };
        }
        result.headings = UpkoppMapCore.headingTree(doc.headings || [], options).map(item => cleanItem(item, 'headings'));
        result.landmarks = UpkoppMapCore.landmarkTree(doc.landmarks || [], options).map(item => cleanItem(item, 'landmarks'));
        result.sections = UpkoppMapCore.sectionTree(doc.sections || [], options).map(item => cleanItem(item, 'sections'));
        if (doc.limited) {
          result.note = 'The map limit was reached; some items may be missing.';
        }
        return result;
      })
    };
    if (map.frameLimit) {
      output.note = 'Only the first 30 documents were read.';
    }
    return output;
  }
  function jsonExport(page, captureState, captureCore, settings = {}, map, mapSettings = {}) {
    if (!map || map.url !== page.url || page.tabId && map.tabId !== page.tabId) {
      throw Error('The page map does not match this content. Refresh and export again.');
    }
    const capture = captureState?.result;
    const useCapture = capture?.page?.url === page.url && (!page.tabId || captureState.job?.tabId === page.tabId) && (!page.documentId || captureState.job?.documentId === page.documentId) && captureCore?.copyContent(capture)?.trim();
    const output = {
      url: page.url,
      content: {
        title: page.title,
        description: page.description || '',
        wordCount: page.wordCount,
        text: useCapture ? captureCore.copyContent(capture) : contentText(page.blocks)
      },
      pageMap: pageMapExport(map, mapSettings)
    };
    if (page.dates?.published || page.dates?.modified) {
      output.content.dates = Object.fromEntries(Object.entries(page.dates).filter(([, value]) => value));
    }
    if (settings.jsonAltText) {
      const altText = [...new Set((page.images || []).map(image => image.alt?.trim()).filter(Boolean))];
      if (altText.length) {
        output.imageAltText = altText;
      }
    }
    const warnings = useCapture ? (capture.capture?.warnings || []).filter(item => item.severity === 'warning').map(item => item.message) : page.limited ? page.limitations || [] : [];
    const incomplete = useCapture ? capture.capture?.status !== 'completed' : page.limited;
    if (incomplete || warnings.length) {
      output.note = [...new Set([...(incomplete ? ['This is an incomplete capture.'] : []), ...warnings])].join(' ');
    }
    return output;
  }
  function safeImageURL(value) {
    if (typeof value !== 'string' || value.length > 2000000) {
      return false;
    }
    if (/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon|vnd.microsoft.icon)[;,]/i.test(value)) {
      return true;
    }
    try {
      return ['http:', 'https:', 'blob:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  const api = {
    contentText,
    jsonExport,
    safeImageURL
  };
  globalThis.UpkoppResearchCore = api;
  if (typeof module !== 'undefined') {
    module.exports = api;
  }
})();
