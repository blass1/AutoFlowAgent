// Agrega todas las trazas de recordings (.autoflow/recordings/*-path.json) y
// emite un reporte de cobertura: que nodos pisa cada test, que nodos no pisa
// nadie, que pages tienen 0 cobertura.
//
// Salida:
//   .autoflow/grafos/cobertura.md    (resumen humano-legible)
//   .autoflow/grafos/cobertura.html  (vista interactiva con tabla + grafo)
//
// Uso: node .autoflow/scripts/cobertura.js

const { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { renderHtml } = require('./lib/render-html');

const nodosPath = '.autoflow/nodos.json';
const recordingsDir = '.autoflow/recordings';

if (!existsSync(nodosPath)) {
  console.error('❌ No encuentro .autoflow/nodos.json — primero generá al menos un caso.');
  process.exit(1);
}

const nodos = JSON.parse(readFileSync(nodosPath, 'utf8'));

// Cargar todas las trazas
const trazas = [];
if (existsSync(recordingsDir)) {
  for (const f of readdirSync(recordingsDir).filter((x) => x.endsWith('-path.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(recordingsDir, f), 'utf8'));
      const numero = data.numero ?? f.replace(/-path\.json$/, '');
      const path = Array.isArray(data.path) ? data.path : [];
      trazas.push({ numero, path, file: f });
    } catch {
      // ignorar trazas rotas
    }
  }
}

// nodoId → set de TC que lo cubren
const cobertura = new Map();
for (const id of Object.keys(nodos)) cobertura.set(id, new Set());
for (const t of trazas) {
  for (const id of t.path) {
    if (cobertura.has(id)) cobertura.get(id).add(t.numero);
  }
}

// Por page: total / cubiertos / no cubiertos
const porPage = new Map();
for (const [id, info] of Object.entries(nodos)) {
  const page = info.page ?? 'SinPage';
  if (!porPage.has(page)) porPage.set(page, { total: 0, cubiertos: 0, ids: [] });
  const p = porPage.get(page);
  p.total++;
  p.ids.push(id);
  if (cobertura.get(id).size > 0) p.cubiertos++;
}

const totalNodos = Object.keys(nodos).length;
const cubiertos = [...cobertura.values()].filter((s) => s.size > 0).length;
const noCubiertos = totalNodos - cubiertos;
const pct = totalNodos === 0 ? 0 : Math.round((cubiertos / totalNodos) * 100);

// === Markdown
const lineasMd = [
  '# Cobertura de nodos',
  '',
  `> Generado: ${new Date().toISOString()}`,
  `> **${cubiertos}/${totalNodos}** nodos cubiertos (**${pct}%**) · **${trazas.length}** trazas leídas`,
  '',
  '## Resumen por page',
  '',
  '| Page | Cubiertos | Total | % |',
  '| --- | ---: | ---: | ---: |',
];
const pagesOrdenadas = [...porPage.entries()].sort((a, b) => {
  const pa = a[1].total === 0 ? 0 : a[1].cubiertos / a[1].total;
  const pb = b[1].total === 0 ? 0 : b[1].cubiertos / b[1].total;
  return pa - pb; // peores arriba
});
for (const [page, info] of pagesOrdenadas) {
  const p = info.total === 0 ? 0 : Math.round((info.cubiertos / info.total) * 100);
  lineasMd.push(`| ${page} | ${info.cubiertos} | ${info.total} | ${p}% |`);
}

lineasMd.push('', '## Nodos sin cobertura', '');
const huerfanos = [...cobertura.entries()].filter(([, s]) => s.size === 0).map(([id]) => id);
if (huerfanos.length === 0) {
  lineasMd.push('_Todos los nodos están cubiertos por al menos un test._');
} else {
  for (const id of huerfanos) {
    const def = nodos[id];
    const tag = def.deprecated ? ' (deprecated)' : '';
    lineasMd.push(`- \`${id}\`${tag}`);
  }
}

lineasMd.push('', '## Cobertura por test', '');
if (trazas.length === 0) {
  lineasMd.push('_Sin trazas._');
} else {
  for (const t of trazas) {
    const unicos = new Set(t.path).size;
    lineasMd.push(`- **TC-${t.numero}** — pisa ${unicos} nodos únicos en ${t.path.length} pasos.`);
  }
}

mkdirSync('.autoflow/grafos', { recursive: true });
writeFileSync('.autoflow/grafos/cobertura.md', lineasMd.join('\n'), 'utf8');

// === Mermaid: grafo de pages coloreado por % de cobertura
const lineasMermaid = ['```mermaid', 'flowchart TB'];
lineasMermaid.push('    classDef cov100 fill:#1B5E20,stroke:#0D3311,color:#FFFFFF;');
lineasMermaid.push('    classDef cov75 fill:#A5D6A7,stroke:#2E7D32,color:#0D3311;');
lineasMermaid.push('    classDef cov50 fill:#FFF59D,stroke:#F9A825,color:#5D4037;');
lineasMermaid.push('    classDef cov25 fill:#FFCC80,stroke:#EF6C00,color:#3E2723;');
lineasMermaid.push('    classDef cov0 fill:#EF9A9A,stroke:#C62828,color:#3E0000;');
lineasMermaid.push('');
const aliasPage = (p) => p.replace(/[^a-zA-Z0-9]/g, '_');
for (const [page, info] of porPage) {
  const p = info.total === 0 ? 0 : (info.cubiertos / info.total) * 100;
  let clase = 'cov0';
  if (p >= 100) clase = 'cov100';
  else if (p >= 75) clase = 'cov75';
  else if (p >= 50) clase = 'cov50';
  else if (p >= 25) clase = 'cov25';
  lineasMermaid.push(`    ${aliasPage(page)}["${page}\\n${info.cubiertos}/${info.total} (${Math.round(p)}%)"]:::${clase}`);
}
// Aristas conecta entre pages (relee fingerprints)
const fpDir = '.autoflow/fingerprints';
if (existsSync(fpDir)) {
  for (const f of readdirSync(fpDir).filter((x) => x.endsWith('.json'))) {
    try {
      const sc = JSON.parse(readFileSync(join(fpDir, f), 'utf8'));
      for (const dest of sc.conecta ?? []) {
        if (porPage.has(sc.page) && porPage.has(dest)) {
          lineasMermaid.push(`    ${aliasPage(sc.page)} ==> ${aliasPage(dest)}`);
        }
      }
    } catch {}
  }
}
lineasMermaid.push('```');
const mermaid = lineasMermaid.join('\n');

const html = renderHtml({
  titulo: 'Cobertura de nodos · AutoFlow',
  mermaidSrc: mermaid,
  meta: [
    `${cubiertos}/${totalNodos} nodos cubiertos`,
    `${pct}% cobertura`,
    `${trazas.length} trazas`,
    `${huerfanos.length} sin cubrir`,
  ],
});

writeFileSync('.autoflow/grafos/cobertura.html', html, 'utf8');

// Salida estructurada para que el agente la pueda leer.
console.log(`AUTOFLOW_COBERTURA: ${JSON.stringify({
  total: totalNodos,
  cubiertos,
  noCubiertos,
  pct,
  trazas: trazas.length,
  pagesPeoresCubiertas: pagesOrdenadas.slice(0, 3).map(([p, i]) => ({
    page: p,
    pct: i.total === 0 ? 0 : Math.round((i.cubiertos / i.total) * 100),
  })),
})}`);
console.log('');
console.log(`✅ ${cubiertos}/${totalNodos} nodos cubiertos (${pct}%).`);
console.log(`📄 .autoflow/grafos/cobertura.md`);
console.log(`🌐 .autoflow/grafos/cobertura.html`);
