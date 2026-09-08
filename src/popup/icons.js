/* Small original outline icons. Labels remain visible; icons are decorative. */
(() => {
  const paths = {
    content: ['M6 3h8l4 4v14H6z', 'M14 3v5h4M9 12h6M9 16h6'],
    map: ['M4 5h5v5H4zM15 14h5v5h-5zM6.5 10v6h8.5M13 5h7M13 9h7'],
    capture: ['M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 10h8M8 14h6'],
    images: ['M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6', 'M15 8h.01'],
    indexability: ['M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z', 'M8 12l3 3 5-6'],
    social: ['M8 11l8-5M8 13l8 5', 'M7 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0M20 5a2 2 0 1 0-4 0 2 2 0 0 0 4 0M20 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0'],
    settings: ['M4 7h16M4 17h16M8 4v6M16 14v6'],
    download: ['M12 3v12M7 10l5 5 5-5M4 16v5h16v-5'],
    copy: ['M9 8h11v13H9zM15 8V3H4v13h5'],
    refresh: ['M20 7v5h-5M4 17v-5h5M19 9a7 7 0 0 0-12-4L4 8M5 15a7 7 0 0 0 12 4l3-3'],
    info: ['M12 10v7M12 6h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
    check: ['M5 12l4 4L19 6'],
    alert: ['M12 3L2 21h20zM12 9v5M12 17h.01'],
    external: ['M14 3h7v7M21 3L10 14M10 3H3v18h18v-7']
  };
  globalThis.UpkoppIcon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({
      viewBox: '0 0 24 24',
      width: '18',
      height: '18',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.75',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'uk-icon'
    })) {
      svg.setAttribute(key, value);
    }
    for (const d of paths[name] || paths.content) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  };
})();
