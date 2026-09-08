/* Read current page copy and image references without scrolling or making requests. */
(() => {
  const text = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => element.checkVisibility({
    checkVisibilityCSS: true,
    checkOpacity: true
  }) && !element.closest('[hidden],[aria-hidden="true"],template');
  const limitations = new Set();
  const main = document.querySelector('main,[role="main"]') || document.body;
  const blocks = [];
  const headings = [];
  const images = [];
  let characters = 0;
  let imageBytes = 0;
  let visited = 0;
  const blocksSelector = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,div';
  const excluded = 'script,style,template,noscript,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-page-capture-ui]';
  function imageURL(value) {
    if (!value) {
      return null;
    }
    try {
      const url = new URL(value, document.baseURI);
      return /^https?:$/.test(url.protocol) || url.protocol === 'blob:' || /^data:image\//i.test(value) ? url.href : null;
    } catch {
      return null;
    }
  }
  function addImage(element, source, kind, alt = null) {
    const src = imageURL(source);
    if (!src) {
      return;
    }
    if (images.length >= 2000 || imageBytes + src.length > 4000000) {
      limitations.add('Image inventory reached its 2,000-image or 4 MB reference limit.');
      return;
    }
    imageBytes += src.length;
    const rectangle = element.getBoundingClientRect();
    images.push({
      number: images.length + 1,
      src,
      kind,
      alt,
      caption: text(element.closest('figure')?.querySelector('figcaption')?.innerText),
      width: element.naturalWidth || Math.round(rectangle.width),
      height: element.naturalHeight || Math.round(rectangle.height),
      dimensionSource: element.naturalWidth ? 'intrinsic' : 'rendered',
      visible: !!visible(element)
    });
  }
  function visit(root, inMain = false) {
    for (const element of root.children || []) {
      if (++visited > 30000) {
        limitations.add('The page scan reached its 30,000-element limit.');
        return;
      }
      if (element.matches(excluded)) {
        continue;
      }
      const withinMain = inMain || element === main;
      const isHeading = /^H[1-6]$/.test(element.tagName);
      const isVisible = visible(element);
      if (isHeading && isVisible && headings.length >= 1000) {
        limitations.add('Heading overview reached its 1,000-heading limit. Page map has separate limits.');
      }
      if (isHeading && isVisible && headings.length < 1000) {
        headings.push({
          level: Number(element.tagName[1]),
          text: text(element.innerText)
        });
      }
      if ((withinMain || isHeading) && isVisible && element.matches(blocksSelector) && !element.closest('nav,[role="navigation"]') && !element.querySelector(excluded)) {
        const nestedBlock = element.querySelector(blocksSelector);
        const value = nestedBlock ? '' : text(element.innerText);
        if (!nestedBlock && value) {
          if (blocks.length < 5000 && characters + value.length <= 500000) {
            blocks.push({
              type: isHeading ? 'heading' : element.tagName === 'LI' ? 'list-item' : 'paragraph',
              ...(isHeading ? {
                level: Number(element.tagName[1])
              } : {}),
              text: value
            });
            characters += value.length;
          } else {
            limitations.add('Page copy reached its 5,000-block or 500,000-character limit. Use Text capture for its separate collection pass.');
          }
        }
      }
      if (element.tagName === 'IMG') {
        const lazy = element.getAttribute('data-src') || element.getAttribute('data-lazy-src');
        addImage(element, lazy && (!element.currentSrc || element.naturalWidth <= 1) ? lazy : element.currentSrc || element.getAttribute('src') || lazy, 'image', element.hasAttribute('alt') ? text(element.getAttribute('alt')) : null);
      } else if (element.tagName.toLowerCase() === 'svg') {
        const clone = element.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.querySelectorAll('script,foreignObject').forEach(node => node.remove());
        for (const node of [clone, ...clone.querySelectorAll('*')]) {
          for (const attribute of [...node.attributes]) {
            if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name) && !attribute.value.startsWith('#')) {
              node.removeAttribute(attribute.name);
            }
          }
        }
        const xml = new XMLSerializer().serializeToString(clone);
        if (xml.length < 128000) {
          addImage(element, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml), 'inline-svg', text(element.getAttribute('aria-label') || element.querySelector('title')?.textContent) || null);
        } else {
          limitations.add('An inline SVG exceeded the 128 KB per-image limit.');
        }
      }
      const background = getComputedStyle(element).backgroundImage;
      for (const match of background.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g)) {
        addImage(element, match[1], 'background');
      }
      if (element.shadowRoot) {
        visit(element.shadowRoot, withinMain);
      }
      if (element.tagName.toLowerCase() !== 'svg') {
        visit(element, withinMain);
      }
    }
  }
  visit(document);
  if (document.querySelector('iframe,frame')) {
    limitations.add('Image and content overview cover the main document and open shadow roots. Embedded documents are separate; use Page map or Text capture to inspect their availability.');
  }
  limitations.add('Images include current and declared lazy sources, inline SVGs, and CSS backgrounds found in the DOM. Scroll or expand the page and refresh for images that have not been added yet.');
  const tags = prefix => [...document.querySelectorAll('meta[property],meta[name]')].map(meta => ({
    name: meta.getAttribute('property') || meta.name,
    content: meta.content
  })).filter(meta => meta.name.toLowerCase().startsWith(prefix)).slice(0, 200);
  return {
    url: location.href,
    title: text(document.title),
    description: text(document.querySelector('meta[name="description" i]')?.content),
    language: document.documentElement.lang || '',
    capturedAt: new Date().toISOString(),
    dates: {
      published: text(document.querySelector('meta[property="article:published_time" i],meta[name="datePublished" i],meta[itemprop="datePublished" i]')?.content) || null,
      modified: text(document.querySelector('meta[property="article:modified_time" i],meta[name="dateModified" i],meta[itemprop="dateModified" i]')?.content) || null
    },
    wordCount: blocks.reduce((count, block) => count + block.text.split(/\s+/).length, 0),
    blocks,
    headings,
    images,
    social: {
      openGraph: tags('og:'),
      twitter: tags('twitter:')
    },
    limitations: [...limitations],
    limited: [...limitations].some(value => /limit|exceeded|reached/.test(value))
  };
})();
