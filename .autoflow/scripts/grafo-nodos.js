// Genera un diagrama Mermaid del grafo de nodos a partir de:
//   - .autoflow/nodos.json         (definición de cada nodo)
//   - .autoflow/fingerprints/*.json (orden intra-page y conecta inter-page)
//
// Aristas:
//   - intra-page: n[i] → n[i+1] de cada sidecar (encadena los nodos de la page).
//   - inter-page: por cada A.conecta = [B], desde el último nodo de A hasta el primero de B.
//
// Color de los nodos según confiabilidad del locator (5 = id/testid, 1 = CSS frágil).
// Salida: .autoflow/grafos/grafo-nodos.md
//
// Uso: node .autoflow/scripts/grafo-nodos.js

const { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const nodosPath = '.autoflow/nodos.json';
const fingerprintsDir = '.autoflow/fingerprints';

if (!existsSync(nodosPath)) {
  console.error(`❌ No encuentro ${nodosPath}.`);
  process.exit(1);
}
if (!existsSync(fingerprintsDir)) {
  console.error(`❌ No encuentro ${fingerprintsDir}.`);
  process.exit(1);
}

const nodos = JSON.parse(readFileSync(nodosPath, 'utf8'));
const archivos = readdirSync(fingerprintsDir).filter((f) => f.endsWith('.json'));

if (archivos.length === 0) {
  console.error('No hay sidecars en .autoflow/fingerprints/.');
  process.exit(1);
}

// Cada nodo necesita un alias mermaid-safe (los ids tienen ::, [, ], ", etc).
const aliasDe = new Map();
let contadorAlias = 0;
function aliasPara(id) {
  if (!aliasDe.has(id)) {
    contadorAlias++;
    aliasDe.set(id, `N${contadorAlias}`);
  }
  return aliasDe.get(id);
}

// Etiqueta corta para mostrar dentro del nodo en el diagrama.
function etiquetaCorta(nodo) {
  const accion = nodo.accion;
  if (accion === 'goto') {
    return `goto ${nodo.selector.replace(/^goto:/, '')}`;
  }
  if (accion === 'assert') {
    const tail = nodo.selector.split(':').pop();
    const matcher = nodo.matcher ?? 'assert';
    return `${matcher}\\n${tail ?? ''}`.trim();
  }
  // click | fill | press | check | uncheck | selectOption | hover
  const tail = nodo.selector.split(':').pop();
  const valor = nodo.valor && nodo.valor !== '*' ? ` "${nodo.valor}"` : '';
  return `${accion}${valor}\\n${tail ?? ''}`;
}

// Sanitiza para que mermaid no rompa.
function sanitizar(texto) {
  return texto
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function claseConfiabilidad(c) {
  if (c === 5) return 'conf5';
  if (c === 4) return 'conf4';
  if (c === 3) return 'conf3';
  if (c === 2) return 'conf2';
  if (c === 1) return 'conf1';
  return 'confNa';
}

const sidecars = archivos
  .map((f) => JSON.parse(readFileSync(join(fingerprintsDir, f), 'utf8')))
  .filter((s) => Array.isArray(s.nodos) && s.nodos.length > 0);

// Aristas intra-page (deduplicadas).
const aristasIntra = new Set();
for (const sc of sidecars) {
  for (let i = 0; i < sc.nodos.length - 1; i++) {
    aristasIntra.add(`${sc.nodos[i]}|||${sc.nodos[i + 1]}`);
  }
}

// Aristas inter-page: último nodo de A → primer nodo de B.
const sidecarPorPage = new Map(sidecars.map((s) => [s.page, s]));
const aristasInter = new Set();
for (const sc of sidecars) {
  const conecta = Array.isArray(sc.conecta) ? sc.conecta : [];
  if (sc.nodos.length === 0) continue;
  const ultimo = sc.nodos[sc.nodos.length - 1];
  for (const destino of conecta) {
    const scDest = sidecarPorPage.get(destino);
    if (!scDest || scDest.nodos.length === 0) continue;
    const primero = scDest.nodos[0];
    aristasInter.add(`${ultimo}|||${primero}`);
  }
}

// Aristas de assert: del último nodo de acción de la page → cada assert.
// Se dibujan con línea punteada para distinguirlas del flujo principal.
const aristasAssert = new Set();
for (const sc of sidecars) {
  const asserts = Array.isArray(sc.asserts) ? sc.asserts : [];
  if (asserts.length === 0 || sc.nodos.length === 0) continue;
  const ultimo = sc.nodos[sc.nodos.length - 1];
  for (const idAssert of asserts) {
    aristasAssert.add(`${ultimo}|||${idAssert}`);
  }
}

// Asegurar que todos los nodos referenciados tengan alias asignado, en orden estable.
for (const sc of sidecars) {
  for (const id of sc.nodos) aliasPara(id);
  for (const id of sc.asserts ?? []) aliasPara(id);
}
// Sumar los huérfanos (nodos en nodos.json que no aparecen en ningún sidecar).
for (const id of Object.keys(nodos)) aliasPara(id);

const lineas = ['```mermaid', 'flowchart LR'];
lineas.push('    classDef conf5 fill:#1B5E20,stroke:#0D3311,color:#FFFFFF;');
lineas.push('    classDef conf4 fill:#A5D6A7,stroke:#2E7D32,color:#0D3311;');
lineas.push('    classDef conf3 fill:#FFF59D,stroke:#F9A825,color:#5D4037;');
lineas.push('    classDef conf2 fill:#FFCC80,stroke:#EF6C00,color:#3E2723;');
lineas.push('    classDef conf1 fill:#EF9A9A,stroke:#C62828,color:#3E0000;');
lineas.push('    classDef confNa fill:#ECEFF1,stroke:#607D8B,color:#263238;');
lineas.push('');

// Subgraphs por page.
const idsPorPage = new Map();
for (const id of Object.keys(nodos)) {
  const page = nodos[id].page ?? 'SinPage';
  if (!idsPorPage.has(page)) idsPorPage.set(page, []);
  idsPorPage.get(page).push(id);
}

for (const [page, ids] of [...idsPorPage.entries()].sort()) {
  lineas.push(`    subgraph ${page}["${page}"]`);
  for (const id of ids) {
    const nodo = nodos[id];
    const alias = aliasPara(id);
    const label = sanitizar(etiquetaCorta(nodo));
    const clase = claseConfiabilidad(nodo.confiabilidad);
    lineas.push(`        ${alias}["${label}"]:::${clase}`);
  }
  lineas.push('    end');
  lineas.push('');
}

// Aristas.
for (const arista of aristasIntra) {
  const [a, b] = arista.split('|||');
  if (!nodos[a] || !nodos[b]) continue;
  lineas.push(`    ${aliasPara(a)} --> ${aliasPara(b)}`);
}
for (const arista of aristasInter) {
  const [a, b] = arista.split('|||');
  if (!nodos[a] || !nodos[b]) continue;
  lineas.push(`    ${aliasPara(a)} ==> ${aliasPara(b)}`);
}
for (const arista of aristasAssert) {
  const [a, b] = arista.split('|||');
  if (!nodos[a] || !nodos[b]) continue;
  lineas.push(`    ${aliasPara(a)} -.assert.-> ${aliasPara(b)}`);
}

lineas.push('```');

const mermaid = lineas.join('\n');

const totalNodos = Object.keys(nodos).length;
const totalAristas = aristasIntra.size + aristasInter.size + aristasAssert.size;

const md = [
  '# Grafo de Nodos',
  '',
  `> Generado: ${new Date().toISOString()}`,
  `> **${totalNodos}** nodos · **${aristasIntra.size}** intra-page · **${aristasInter.size}** inter-page · **${aristasAssert.size}** asserts`,
  '',
  '**Confiabilidad del locator:**',
  '🟩 5 = id/testid · 🟢 4 = role+name · 🟡 3 = label · 🟧 2 = placeholder/text · 🟥 1 = CSS/posicional · ⬜ N/A (goto, assert)',
  '',
  '**Aristas:** finas `-->` intra-page · gruesas `==>` inter-page (`conecta`) · punteadas `-.assert.->` desde el último nodo de la page hacia cada assert.',
  '',
  mermaid,
  '',
];

mkdirSync('.autoflow/grafos', { recursive: true });
const outPath = '.autoflow/grafos/grafo-nodos.md';
writeFileSync(outPath, md.join('\n'), 'utf8');
console.log(mermaid);
console.log('');
console.log(`✅ Escrito en ${outPath} (${totalNodos} nodos, ${totalAristas} aristas)`);
