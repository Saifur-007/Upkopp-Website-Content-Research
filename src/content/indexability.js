/* Explicit, bounded same-origin checks; response HTML is parsed inertly and never exported. */
(async () => {
  const sourceURL = location.href;
  const resolve = (value, base = sourceURL) => {
    if (!value) {
      return null;
    }
    try {
      const url = new URL(value, base);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };
  const canonicals = (root, base) => [...root.querySelectorAll('link[rel~="canonical" i]')].map(link => resolve(link.getAttribute('href'), base)).filter(Boolean);
  const metaRobots = root => [...root.querySelectorAll('meta[name]')].filter(meta => /^(robots|googlebot|bingbot)$/i.test(meta.name)).map(meta => ({
    agent: meta.name.toLowerCase(),
    content: meta.content
  }));
  async function read(url, maxBytes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: controller.signal,
        cache: 'no-cache'
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = '';
      let truncated = false;
      while (reader) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        bytes += chunk.value.length;
        if (bytes > maxBytes) {
          truncated = true;
          await reader.cancel();
          break;
        }
        body += decoder.decode(chunk.value, {
          stream: true
        });
      }
      body += decoder.decode();
      return {
        status: response.status,
        url: response.url,
        contentType: response.headers.get('content-type'),
        xRobotsTag: response.headers.get('x-robots-tag'),
        body,
        truncated
      };
    } catch (error) {
      return {
        error: error.name === 'AbortError' ? 'Request timed out.' : 'The page or browser blocked this request.'
      };
    } finally {
      clearTimeout(timer);
    }
  }
  const robotsURL = new URL('/robots.txt', sourceURL).href;
  const [raw, robots] = await Promise.all([read(sourceURL, 2000000), read(robotsURL, 256000)]);
  const rawDocument = !raw.error && /(?:text\/html|application\/xhtml\+xml)/i.test(raw.contentType || '') && !raw.truncated ? new DOMParser().parseFromString(raw.body, 'text/html') : null;
  const rawBase = rawDocument ? resolve(rawDocument.querySelector('base[href]')?.getAttribute('href') || raw.url, raw.url) || raw.url : raw.url;
  const robotsUsable = !robots.error && robots.status === 200 && !/<(?:!doctype|html|body)\b/i.test(robots.body);
  const sitemaps = robotsUsable ? robots.body.split(/\r?\n/).map(line => line.match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1]).filter(Boolean).map(url => resolve(url, robots.url)).filter(Boolean) : [];
  const renderedCanonical = canonicals(document, document.baseURI);
  const renderedRobots = metaRobots(document);
  const noindex = [...renderedRobots.map(meta => meta.content), raw.xRobotsTag || '', ...(rawDocument ? metaRobots(rawDocument).map(meta => meta.content) : [])].some(value => /\b(noindex|none)\b/i.test(value));
  return {
    url: sourceURL,
    checkedAt: new Date().toISOString(),
    summary: noindex ? 'noindex-detected' : 'no-noindex-detected',
    canonical: {
      rendered: renderedCanonical,
      raw: rawDocument ? canonicals(rawDocument, rawBase) : null
    },
    robotsMeta: renderedRobots,
    response: {
      status: raw.status || null,
      finalURL: raw.url || null,
      xRobotsTag: raw.error ? null : raw.xRobotsTag,
      rawRobotsMeta: rawDocument ? metaRobots(rawDocument) : null,
      error: raw.error || (raw.truncated ? 'Response exceeded the 2 MB reading limit.' : !rawDocument ? 'Response was not readable HTML.' : null)
    },
    robotsTxt: {
      url: robotsURL,
      status: robots.status || null,
      text: robotsUsable ? robots.body : null,
      truncated: !!robots.truncated,
      error: robots.error || (!robotsUsable && robots.status === 200 ? 'Response was not a robots.txt document.' : null)
    },
    sitemaps: [...new Set(sitemaps)],
    hreflangs: [...document.querySelectorAll('link[hreflang][href]')].slice(0, 200).map(link => ({
      language: link.hreflang,
      url: resolve(link.getAttribute('href'), document.baseURI)
    })).filter(link => link.url),
    limitations: ['Signals only: this does not prove that a search engine has indexed the page. Robots rules are shown as source text, not a crawler-specific allow/block verdict.', 'Raw HTML and HTTP headers come from a new request and may differ from the original navigation.']
  };
})();
