/* Test-only API adapter. Loaded by the design preview, never by the extension. */
(() => {
  const source = {
    url: 'https://example.com/garden-care',
    title: 'Garden care & seasonal maintenance',
    description: 'Thoughtful garden care for homes across the Cotswolds. From seasonal planting to year-round maintenance.',
    wordCount: 1248,
    language: 'en',
    limited: false,
    headings: [{
      level: 1,
      text: 'A garden to enjoy, all year round'
    }, {
      level: 2,
      text: 'Care that grows with your garden'
    }, {
      level: 3,
      text: 'Seasonal planting'
    }, {
      level: 3,
      text: 'Regular maintenance'
    }, {
      level: 2,
      text: 'A little care makes a lasting difference'
    }, {
      level: 2,
      text: 'Let’s talk about your garden'
    }],
    images: [{
      number: 1,
      alt: 'Lavender and grasses along a sunlit garden path',
      caption: 'A summer border in full bloom.'
    }, {
      number: 2,
      alt: '',
      caption: ''
    }, {
      number: 3,
      alt: null,
      caption: 'Seasonal planting for a courtyard garden.'
    }, {
      number: 4,
      alt: '<strong>Original source text</strong>',
      caption: ''
    }]
  };
  source.blocks = [{
    type: 'heading',
    level: 1,
    text: source.headings[0].text
  }, {
    type: 'paragraph',
    text: 'A beautiful garden starts with thoughtful care. We help you create an outdoor space that feels like home, season after season.'
  }, {
    type: 'heading',
    level: 2,
    text: source.headings[1].text
  }, {
    type: 'paragraph',
    text: 'From a fresh spring border to regular maintenance, our local team takes care of the details so you can enjoy your garden.'
  }, {
    type: 'heading',
    level: 3,
    text: 'Seasonal planting'
  }, {
    type: 'paragraph',
    text: 'Colour, texture, and plants chosen for your soil. Every planting plan is shaped around the way you use your space.'
  }];
  source.limitations = ['Image inventory covers the current main document. Scroll and refresh to discover newly loaded images.'];
  source.images = source.images.map((image, index) => ({
    ...image,
    src: location.origin + '/tests/browser/' + (index % 2 ? 'garden-card.svg' : 'plant.svg'),
    width: 600,
    height: 400,
    visible: index !== 2,
    kind: index === 2 ? 'background' : 'image'
  }));
  if (new URLSearchParams(location.search).get('imageFixture') === 'many') {
    source.images = Array.from({
      length: 85
    }, (_, index) => ({
      ...source.images[index % 4],
      number: index + 1
    }));
  }
  source.social = {
    openGraph: [{
      name: 'og:title',
      content: source.title
    }, {
      name: 'og:type',
      content: 'website'
    }, {
      name: 'og:image',
      content: location.origin + '/tests/browser/garden-card.svg'
    }, {
      name: 'og:url',
      content: source.url
    }, {
      name: 'og:description',
      content: source.description
    }],
    twitter: [{
      name: 'twitter:card',
      content: 'summary_large_image'
    }, {
      name: 'twitter:title',
      content: source.title
    }, {
      name: 'twitter:image',
      content: location.origin + '/tests/browser/garden-card.svg'
    }]
  };
  const signals = {
    url: source.url,
    checkedAt: new Date().toISOString(),
    summary: 'no-noindex-detected',
    canonical: {
      rendered: [source.url],
      raw: [source.url]
    },
    robotsMeta: [{
      agent: 'robots',
      content: 'index, follow'
    }],
    response: {
      status: 200,
      finalURL: source.url,
      xRobotsTag: null,
      error: null
    },
    robotsTxt: {
      url: 'https://example.com/robots.txt',
      status: 200,
      text: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
      error: null,
      truncated: false
    },
    sitemaps: ['https://example.com/sitemap.xml'],
    hreflangs: [{
      language: 'en-GB',
      url: source.url
    }],
    limitations: ['Signals only. This does not confirm indexing. Raw HTML and headers are from a new request.']
  };
  const result = {
    schema_version: '1.0.0',
    page: {
      ...source,
      captured_at: '2026-09-08T12:00:00Z'
    },
    regions: [{
      id: 'r1',
      type: 'main',
      sections: [{
        id: 's1',
        grouping_basis: 'region',
        sections: [],
        order: ['b1', 'b2'],
        blocks: [{
          id: 'b1',
          type: 'heading',
          visibility: 'visible',
          text: source.headings[0].text,
          inline: [{
            text: source.headings[0].text
          }],
          level: 1,
          semantic_source: 'h1'
        }, {
          id: 'b2',
          type: 'paragraph',
          visibility: 'visible',
          text: source.description,
          inline: [{
            text: source.description
          }]
        }]
      }]
    }],
    images: [],
    capture: {
      status: 'completed',
      checks: {
        schema_valid: true,
        comparison_pass_performed: true,
        observed_content_reconciled: true
      },
      warnings: [],
      limits_reached: [],
      counts: {
        sections: 1,
        headings: 1,
        blocks: 2,
        images: 0
      },
      limits: {},
      elapsed_ms: 2500
    }
  };
  const saved = {
    job: {
      id: 'preview',
      stage: 'completed',
      url: source.url,
      title: source.title,
      counts: result.capture.counts
    },
    result,
    previous: null,
    download: {
      status: 'completed',
      filename: 'example.com-garden-care-preview.txt'
    },
    retention: 'session'
  };
  const states = {
    ready: {
      job: null,
      result: null
    },
    saved,
    progress: {
      ...saved,
      result: null,
      download: null,
      job: {
        ...saved.job,
        stage: 'scrolling'
      }
    },
    incomplete: structuredClone(saved)
  };
  states.incomplete.job.stage = 'partial';
  states.incomplete.result.capture.status = 'partial';
  states.incomplete.download = null;
  states.incomplete.result.capture.warnings = [{
    severity: 'warning',
    message: 'Some embedded content could not be read.',
    recovery: 'Open the embedded content separately to capture its text.'
  }];
  let current = states.ready;
  const listeners = [];
  const stored = {};
  const notify = () => listeners.forEach(listener => listener({
    type: 'PC_STATE_CHANGED'
  }));
  globalThis.chrome = {
    runtime: {
      id: 'upkopp-preview',
      onMessage: {
        addListener: listener => listeners.push(listener)
      },
      sendMessage: async message => {
        if (message.type === 'UK_INDEXABILITY') {
          return structuredClone(signals);
        }
        if (message.type === 'UK_IMAGE_DOWNLOAD_STATE') {
          return null;
        }
        if (message.type === 'UK_DOWNLOAD_IMAGES') {
          return {
            error: 'Design preview: original-image downloads are available in the installed extension.'
          };
        }
        if (message.type === 'UK_OVERVIEW') {
          return structuredClone(source);
        }
        if (message.type === 'UK_WORKSPACE') {
          return {
            error: 'This is a design preview. Use the installed extension to open a workspace.'
          };
        }
        if (message.type === 'PM_GET') {
          return {
            tabId: 1,
            title: source.title,
            url: source.url,
            documents: [{
              frameId: 0,
              epoch: 'preview',
              title: source.title,
              url: source.url,
              headings: source.headings.map((heading, index) => ({
                ...heading,
                id: 'h' + index,
                label: heading.text,
                hidden: false,
                warnings: [],
                href: source.url + '#h' + index
              })),
              landmarks: [],
              sections: []
            }]
          };
        }
        if (message.type === 'PM_ACTION') {
          return {
            ok: true
          };
        }
        if (message.type === 'PC_START_CURRENT' || message.type === 'PC_RETRY') {
          current = states.progress;
        }
        if (message.type === 'PC_CANCEL') {
          current = states.incomplete;
        }
        if (message.type === 'PC_CLEAR') {
          current = states.ready;
        }
        if (message.type === 'PC_DOWNLOAD') {
          return {
            error: 'Design preview: no capture file is downloaded.'
          };
        }
        if (message.type !== 'PC_GET_STATE') {
          setTimeout(notify, 0);
        }
        return structuredClone(current);
      }
    },
    windows: {
      getCurrent: async () => ({
        id: 1
      })
    },
    sidePanel: {
      open: async () => {
        throw Error('Design preview: the installed extension provides the side panel.');
      }
    },
    downloads: {
      download: async () => {
        throw Error('Design preview: downloads are disabled.');
      }
    },
    permissions: {
      request: async () => false
    },
    storage: {
      local: {
        get: async () => stored,
        set: async data => Object.assign(stored, data)
      },
      onChanged: {
        addListener: () => {}
      }
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.className = 'preview-banner';
    const label = document.createElement('strong');
    label.textContent = 'Design preview · simulated data, not a working extension';
    banner.append(label);
    for (const name of Object.keys(states)) {
      const button = document.createElement('button');
      button.textContent = 'Show ' + name;
      button.onclick = () => {
        current = structuredClone(states[name]);
        UpkoppUI.show('capture');
        notify();
      };
      banner.append(button);
    }
    document.body.prepend(banner);
  });
})();
