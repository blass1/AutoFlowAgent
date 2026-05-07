// Genera un HTML autocontenido que renderiza un diagrama Mermaid con pan/zoom,
// para abrir en el navegador y poder navegar grafos grandes (mucho mejor que la
// preview de VSCode).
//
// Mermaid y svg-pan-zoom se cargan desde CDN. Sin npm install.
//
// Uso:
//   const { renderHtml } = require('./lib/render-html');
//   renderHtml({ titulo, mermaidSrc, meta }) → string HTML

function renderHtml({ titulo, mermaidSrc, meta }) {
  const fuente = mermaidSrc
    .replace(/^```mermaid\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  const metaHtml = (meta ?? [])
    .map((linea) => `<div>${escapar(linea)}</div>`)
    .join('\n      ');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapar(titulo)}</title>
<style>
  :root {
    /* Paleta Galicia — coherente con el dashboard */
    --bg: #0d0d1a;
    --panel: #161628;
    --text: #f3f0e7;
    --muted: #9d99af;
    --accent: #ff6f1d;
    --indigo: #2a2168;
    --border: #2a2640;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header {
    display: flex; align-items: center; gap: 16px; padding: 10px 16px;
    border-bottom: 1px solid var(--border); background: var(--panel);
    position: sticky; top: 0; z-index: 10;
  }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 12px; }
  header .meta div { display: inline-block; margin-right: 12px; }
  header .toolbar { margin-left: auto; display: flex; gap: 6px; }
  header button {
    background: transparent; color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;
  }
  header button:hover { border-color: var(--accent); color: var(--accent); }
  #stage {
    width: 100vw; height: calc(100vh - 50px);
    overflow: hidden; cursor: grab;
  }
  #stage.dragging { cursor: grabbing; }
  #stage svg { width: 100%; height: 100%; display: block; }
  .hint {
    position: fixed; bottom: 12px; right: 16px; background: var(--panel);
    border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px;
    font-size: 11px; color: var(--muted);
  }
</style>
</head>
<body>
  <header>
    <h1>${escapar(titulo)}</h1>
    <div class="meta">
      ${metaHtml}
    </div>
    <div class="toolbar">
      <button id="zoomIn" title="Zoom in">＋</button>
      <button id="zoomOut" title="Zoom out">−</button>
      <button id="reset" title="Reset">⤺</button>
      <button id="fit" title="Ajustar a pantalla">⇲</button>
    </div>
  </header>
  <div id="stage"><div class="mermaid" id="diagrama">${escapar(fuente)}</div></div>
  <div class="hint">Click + arrastrar para mover · rueda para zoom · doble click para resetear</div>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    import svgPanZoom from 'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/+esm';

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, useMaxWidth: false, curve: 'basis' },
    });

    const stage = document.getElementById('stage');
    const src = document.getElementById('diagrama').textContent;
    const { svg } = await mermaid.render('diagramaSvg', src);
    stage.innerHTML = svg;

    const svgEl = stage.querySelector('svg');
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');

    const panZoom = svgPanZoom(svgEl, {
      zoomEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      minZoom: 0.1,
      maxZoom: 20,
      zoomScaleSensitivity: 0.4,
      dblClickZoomEnabled: false,
    });

    document.getElementById('zoomIn').onclick = () => panZoom.zoomIn();
    document.getElementById('zoomOut').onclick = () => panZoom.zoomOut();
    document.getElementById('reset').onclick = () => { panZoom.resetZoom(); panZoom.center(); };
    document.getElementById('fit').onclick = () => { panZoom.fit(); panZoom.center(); };
    stage.addEventListener('dblclick', () => { panZoom.resetZoom(); panZoom.center(); });
    stage.addEventListener('mousedown', () => stage.classList.add('dragging'));
    window.addEventListener('mouseup', () => stage.classList.remove('dragging'));
    window.addEventListener('resize', () => panZoom.resize());
  </script>
</body>
</html>
`;
}

function escapar(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { renderHtml };
