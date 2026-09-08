/* Shared contract, validation and filenames. No dependencies. */
(() => {
  const LIMITS = Object.freeze({
    durationMs: 60000,
    collectMs: 40000,
    compareMs: 15000,
    steps: 80,
    blocks: 10000,
    images: 2000,
    bytes: 2097152,
    nodesPerPass: 60000,
    nestedScrollers: 3,
    quietMs: 600,
    waitMs: 1500
  });
  const TYPES = ['heading', 'paragraph', 'text', 'quote', 'list', 'table', 'link', 'button', 'image', 'description_list'];
  const STATES = ['completed', 'partial', 'cancelled', 'interrupted'];
  const string = {
    type: 'string'
  };
  const nullable = {
    type: ['string', 'null']
  };
  const inline = {
    type: 'array',
    items: {
      $ref: 'segment'
    }
  };
  // This contract is used by both capture and export validation. Order arrays
  // interleave section and block IDs rather than flattening nested sections.
  const SCHEMA = {
    root: {
      type: 'object',
      required: ['schema_version', 'page', 'regions', 'images', 'capture'],
      properties: {
        schema_version: {
          const: '1.0.0'
        },
        page: {
          $ref: 'page'
        },
        regions: {
          type: 'array',
          items: {
            $ref: 'region'
          }
        },
        images: {
          type: 'array',
          items: {
            $ref: 'image'
          }
        },
        capture: {
          $ref: 'capture'
        }
      }
    },
    page: {
      type: 'object',
      required: ['url', 'title', 'site_name', 'language', 'captured_at'],
      properties: {
        url: string,
        title: string,
        site_name: nullable,
        language: nullable,
        captured_at: string
      }
    },
    region: {
      type: 'object',
      required: ['id', 'type', 'sections'],
      properties: {
        id: string,
        type: string,
        sections: {
          type: 'array',
          items: {
            $ref: 'section'
          }
        }
      }
    },
    section: {
      type: 'object',
      required: ['id', 'grouping_basis', 'blocks', 'sections', 'order'],
      properties: {
        id: string,
        grouping_basis: string,
        blocks: {
          type: 'array',
          items: {
            $ref: 'block'
          }
        },
        sections: {
          type: 'array',
          items: {
            $ref: 'section'
          }
        },
        order: {
          type: 'array',
          items: string
        }
      }
    },
    segment: {
      type: 'object',
      required: ['text'],
      properties: {
        text: string,
        href: nullable,
        emphasis: {
          enum: ['strong', 'em', 'code']
        }
      }
    },
    list: {
      type: 'object',
      required: ['ordered', 'start', 'items'],
      properties: {
        ordered: {
          type: 'boolean'
        },
        start: {
          type: 'number'
        },
        items: {
          type: 'array',
          items: {
            $ref: 'listItem'
          }
        }
      }
    },
    listItem: {
      type: 'object',
      required: ['inline', 'children'],
      properties: {
        inline,
        children: {
          type: 'array',
          items: {
            $ref: 'list'
          }
        }
      }
    },
    cell: {
      type: 'object',
      required: ['inline', 'header', 'row_span', 'col_span'],
      properties: {
        inline,
        header: {
          type: 'boolean'
        },
        row_span: {
          type: 'number'
        },
        col_span: {
          type: 'number'
        }
      }
    },
    definition: {
      type: 'object',
      required: ['term', 'definitions'],
      properties: {
        term: inline,
        definitions: {
          type: 'array',
          items: inline
        }
      }
    },
    block: {
      type: 'object',
      required: ['id', 'type', 'visibility'],
      properties: {
        id: string,
        type: {
          enum: TYPES
        },
        visibility: {
          enum: ['visible', 'hidden']
        },
        text: string,
        inline,
        level: {
          type: ['number', 'null']
        },
        semantic_source: string,
        image_id: string,
        ordered: {
          type: 'boolean'
        },
        start: {
          type: 'number'
        },
        items: {
          type: 'array',
          items: {
            $ref: 'listItem'
          }
        },
        rows: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              $ref: 'cell'
            }
          }
        },
        caption: nullable,
        entries: {
          type: 'array',
          items: {
            $ref: 'definition'
          }
        }
      }
    },
    association: {
      type: 'object',
      required: ['section_id', 'related_block_ids', 'basis', 'certainty'],
      properties: {
        section_id: string,
        related_block_ids: {
          type: 'array',
          items: string
        },
        basis: {
          enum: ['explicit_caption', 'shared_card', 'shared_section', 'unresolved']
        },
        certainty: {
          enum: ['supported', 'inferred', 'unknown']
        }
      }
    },
    image: {
      type: 'object',
      required: ['id', 'url', 'alt', 'caption', 'decorative', 'source_kind', 'association'],
      properties: {
        id: string,
        url: nullable,
        alt: nullable,
        caption: nullable,
        decorative: {
          type: 'boolean'
        },
        source_kind: {
          enum: ['img', 'svg', 'background']
        },
        association: {
          $ref: 'association'
        }
      }
    },
    warning: {
      type: 'object',
      required: ['category', 'message', 'severity', 'recovery'],
      properties: {
        category: string,
        message: string,
        severity: {
          enum: ['info', 'warning']
        },
        recovery: nullable
      }
    },
    capture: {
      type: 'object',
      required: ['status', 'checks', 'warnings', 'limits_reached', 'counts', 'limits', 'elapsed_ms'],
      properties: {
        status: {
          enum: STATES
        },
        checks: {
          type: 'object',
          required: ['schema_valid', 'comparison_pass_performed', 'observed_content_reconciled'],
          properties: {
            schema_valid: {
              type: 'boolean'
            },
            comparison_pass_performed: {
              type: 'boolean'
            },
            observed_content_reconciled: {
              type: 'boolean'
            }
          }
        },
        warnings: {
          type: 'array',
          items: {
            $ref: 'warning'
          }
        },
        limits_reached: {
          type: 'array',
          items: string
        },
        counts: {
          type: 'object'
        },
        limits: {
          type: 'object'
        },
        elapsed_ms: {
          type: 'number'
        }
      }
    }
  };
  function validateSchema(value, schema, path, errors, depth = 0) {
    if (errors.length >= 20) {
      return;
    }
    if (depth > 100) {
      errors.push(path + ': nesting too deep');
      return;
    }
    if (schema.$ref) {
      schema = SCHEMA[schema.$ref];
    }
    if (schema.const !== undefined && value !== schema.const) {
      errors.push(path + ': wrong version');
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(path + ': unsupported value');
    }
    const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (schema.type && ![].concat(schema.type).includes(kind)) {
      errors.push(path + ': expected ' + schema.type);
      return;
    }
    if (kind === 'number' && !Number.isFinite(value)) {
      errors.push(path + ': invalid number');
    }
    if (kind === 'object') {
      for (const key of schema.required || []) {
        if (!(key in value)) {
          errors.push(path + '.' + key + ': missing');
        }
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) {
          validateSchema(value[key], sub, path + '.' + key, errors, depth + 1);
        }
      }
    }
    if (kind === 'array' && schema.items) {
      value.forEach((v, i) => validateSchema(v, schema.items, path + '[' + i + ']', errors, depth + 1));
    }
  }
  function validate(result) {
    const errors = [];
    validateSchema(result, SCHEMA.root, 'capture', errors);
    if (errors.length) {
      return errors;
    }
    const ids = new Set();
    const sections = new Map();
    const blocks = new Map();
    const images = new Map();
    const add = id => {
      if (!id || ids.has(id)) {
        errors.push('Duplicate or empty ID: ' + id);
      }
      ids.add(id);
    };
    function walk(section, depth = 0) {
      if (depth > 80) {
        errors.push('Section nesting too deep');
        return;
      }
      add(section.id);
      sections.set(section.id, section);
      const children = [...section.sections, ...section.blocks];
      if (section.order.length !== children.length || new Set(section.order).size !== children.length || children.some(c => !section.order.includes(c.id))) {
        errors.push('Invalid reading order: ' + section.id);
      }
      section.blocks.forEach(b => {
        add(b.id);
        blocks.set(b.id, b);
        if (b.type === 'heading' && (!('level' in b) || !b.semantic_source || !b.text)) {
          errors.push('Invalid heading: ' + b.id);
        }
        if (b.semantic_source && /^h[1-6]$/.test(b.semantic_source) && b.level !== Number(b.semantic_source[1])) {
          errors.push('Heading level mismatch');
        }
        if (b.type === 'list' && (!Array.isArray(b.items) || typeof b.ordered !== 'boolean' || !Number.isFinite(b.start))) {
          errors.push('Invalid list');
        }
        if (b.type === 'table' && !Array.isArray(b.rows)) {
          errors.push('Invalid table');
        }
        if (b.type === 'description_list' && !Array.isArray(b.entries)) {
          errors.push('Invalid definitions');
        }
        if (['heading', 'paragraph', 'text', 'quote', 'link', 'button'].includes(b.type) && (typeof b.text !== 'string' || !Array.isArray(b.inline))) {
          errors.push('Invalid text block');
        }
      });
      section.sections.forEach(s => walk(s, depth + 1));
    }
    result.regions.forEach(r => {
      add(r.id);
      r.sections.forEach(s => walk(s));
    });
    result.images.forEach(i => {
      add(i.id);
      images.set(i.id, i);
    });
    blocks.forEach(b => {
      if (b.type === 'image' && !images.has(b.image_id)) {
        errors.push('Missing image: ' + b.id);
      }
    });
    images.forEach(i => {
      const a = i.association;
      const section = sections.get(a.section_id);
      if (!section) {
        errors.push('Missing image section');
      }
      for (const id of a.related_block_ids) {
        if (!blocks.has(id) || !section?.blocks.some(b => b.id === id)) {
          errors.push('Invalid image context');
        }
      }
    });
    if (!blocks.size) {
      errors.push('No readable content found');
    }
    if (result.capture.status === 'completed' && (result.capture.warnings.some(w => w.severity === 'warning') || result.capture.limits_reached.length || !result.capture.checks.comparison_pass_performed || !result.capture.checks.observed_content_reconciled)) {
      errors.push('Completed status contradicts coverage report');
    }
    if (!Number.isFinite(Date.parse(result.page.captured_at))) {
      errors.push('Invalid capture date');
    }
    return errors.slice(0, 20);
  }
  function counts(result) {
    let sectionCount = 0;
    let blockCount = 0;
    let headings = 0;
    const walk = s => {
      sectionCount++;
      for (const b of s.blocks) {
        blockCount++;
        if (b.type === 'heading') {
          headings++;
        }
      }
      s.sections.forEach(walk);
    };
    result.regions.forEach(r => r.sections.forEach(walk));
    return {
      sections: sectionCount,
      blocks: blockCount,
      headings,
      images: result.images.length
    };
  }
  const serialize = result => JSON.stringify(result, null, 2);
  // Keep the detailed capture contract internal. Downloads contain source copy,
  // once, rather than IDs, DOM evidence, duplicate inline text or image URLs.
  function copyContent(result) {
    const inlineText = parts => (parts || []).map(p => p.text).join('').trim();
    function listText(list, depth = 0) {
      if (depth > 40) {
        return '';
      }
      return (list.items || []).map((item, index) => {
        const line = '  '.repeat(depth) + (list.ordered ? list.start + index + '. ' : '- ') + inlineText(item.inline);
        return [line, ...(item.children || []).map(child => listText(child, depth + 1))].filter(Boolean).join('\n');
      }).join('\n');
    }
    function tableText(block) {
      // Expand row/column spans so a price on the next row keeps its label.
      const grid = [];
      for (let y = 0; y < block.rows.length; y++) {
        grid[y] ||= [];
        let x = 0;
        for (const cell of block.rows[y]) {
          while (grid[y][x] !== undefined) {
            x++;
          }
          const value = inlineText(cell.inline).replace(/\s+/g, ' ');
          const rows = cell.row_span === 0 ? block.rows.length - y : Math.max(1, cell.row_span);
          for (let dy = 0; dy < Math.min(rows, block.rows.length - y); dy++) {
            grid[y + dy] ||= [];
            for (let dx = 0; dx < Math.min(Math.max(1, cell.col_span), 1000); dx++) {
              grid[y + dy][x + dx] = value;
            }
          }
          x += Math.min(Math.max(1, cell.col_span), 1000);
        }
      }
      return [block.caption, ...grid.map(row => Array.from(row, value => value || '').join('\t'))].filter(Boolean).join('\n');
    }
    function blockText(block) {
      if (block.visibility === 'hidden' || block.type === 'image') {
        return '';
      }
      if (block.type === 'list') {
        return listText(block);
      }
      if (block.type === 'table') {
        return tableText(block);
      }
      if (block.type === 'description_list') {
        return block.entries.map(entry => [inlineText(entry.term), ...entry.definitions.map(inlineText)].filter(Boolean).join('\n')).join('\n\n');
      }
      const text = (block.text ?? inlineText(block.inline)).trim();
      if (!text) {
        return '';
      }
      if (block.type === 'heading') {
        return (block.level >= 1 && block.level <= 6 ? '#'.repeat(block.level) + ' ' : 'Heading' + (block.level ? ' ' + block.level : '') + ': ') + text;
      }
      if (block.type === 'quote') {
        return text.split('\n').map(line => '> ' + line).join('\n');
      }
      return text;
    }
    function sectionText(section) {
      const items = new Map([...section.blocks, ...section.sections].map(item => [item.id, item]));
      const chunks = [];
      const seen = new Set();
      for (const id of section.order) {
        const item = items.get(id);
        if (!item) {
          continue;
        }
        if (item.blocks) {
          const text = sectionText(item);
          if (text) {
            chunks.push(text);
          }
          continue;
        }
        const text = blockText(item);
        const key = item.type + '\n' + text; // Collapse identical observations only within their own source section.
        if (text && !seen.has(key)) {
          chunks.push(text);
          seen.add(key);
        }
      }
      return chunks.join('\n\n');
    }
    return result.regions.filter(region => region.type !== 'navigation').flatMap(region => region.sections.map(sectionText)).filter(Boolean).join('\n\n');
  }
  function copyNotes(result) {
    if (result.capture.status === 'completed') {
      return [];
    }
    return [...new Set(['Capture ' + result.capture.status + ': some page text may be missing.', ...result.capture.warnings.filter(w => w.severity === 'warning').map(w => w.message)])];
  }
  function copyExport(result, format = 'text') {
    const content = copyContent(result);
    const notes = copyNotes(result);
    if (format === 'json') {
      return JSON.stringify({
        title: result.page.title,
        url: result.page.url,
        content,
        ...(notes.length ? {
          notes
        } : {})
      }, null, 2) + '\n';
    }
    return [result.page.title, result.page.url, ...(notes.length ? ['Capture note: ' + notes.join(' ')] : []), content].filter(Boolean).join('\n\n') + '\n';
  }
  const byteLength = text => new TextEncoder().encode(text).length;
  function filename(result, id) {
    const url = new URL(result.page.url);
    const safe = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 40) || 'page';
    const path = safe(url.pathname === '/' ? 'home' : url.pathname);
    const date = result.page.captured_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return safe(url.hostname) + '-' + path + '-' + date + '-' + safe(id).slice(0, 8) + (result.capture.status === 'completed' ? '' : '-' + result.capture.status) + '.txt';
  }
  function qualify(result, status, category, message) {
    result.capture.status = status;
    if (!result.capture.warnings.some(w => w.category === category)) {
      result.capture.warnings.push({
        category,
        message,
        severity: 'warning',
        recovery: 'Return to the source page and capture again.'
      });
    }
    result.capture.checks.observed_content_reconciled = false;
    return result;
  }
  globalThis.UpkoppCapture = {
    LIMITS,
    SCHEMA,
    validate,
    counts,
    serialize,
    copyContent,
    copyNotes,
    copyExport,
    byteLength,
    filename,
    qualify
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalThis.UpkoppCapture;
  }
})();
