// Genera un diagrama Mermaid del grafo de pages a partir de los sidecars
// .autoflow/fingerprints/*.json. Imprime el bloque Mermaid en stdout y lo
// escribe también en .autoflow/grafos/grafo.md para verlo con cualquier preview.
//
// Uso: node .autoflow/scripts/grafo.js

const { readdirSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const dir = '.autoflow/fingerprints';
const archivos = readdirSync(dir).filter((f) => f.endsWith('.json'));

if (archivos.length === 0) {
  console.error('No hay fingerprints en .autoflow/fingerprints/.');
  process.exit(1);
}

const nodos = new Set();
const aristas = [];
const conSalida = new Set();
const conEntrada = new Set();

for (const archivo of archivos) {
  const data = JSON.parse(readFileSync(join(dir, archivo), 'utf8'));
  nodos.add(data.page);
  const conecta = Array.isArray(data.conecta) ? data.conecta : [];
  if (conecta.length > 0) conSalida.add(data.page);
  for (const destino of conecta) {
    nodos.add(destino);
    conEntrada.add(destino);
    aristas.push([data.page, destino]);
  }
}

const lineas = ['```mermaid', 'flowchart LR'];
lineas.push('    classDef inicio fill:#E3F2FD,stroke:#1565C0,stroke-width:2px,color:#0D47A1;');
lineas.push('    classDef intermedia fill:#F3E5F5,stroke:#6A1B9A,stroke-width:1.5px,color:#4A148C;');
lineas.push('    classDef terminal fill:#E8F5E9,stroke:#2E7D32,stroke-width:1.5px,color:#1B5E20;');
lineas.push('');

const nodosOrdenados = [...nodos].sort();
const claseDe = (n) => {
  const entra = conEntrada.has(n);
  const sale = conSalida.has(n);
  if (!entra && sale) return 'inicio';
  if (entra && !sale) return 'terminal';
  return 'intermedia';
};

for (const nodo of nodosOrdenados) {
  lineas.push(`    ${nodo}([${nodo}]):::${claseDe(nodo)}`);
}
lineas.push('');
for (const [origen, destino] of aristas) {
  lineas.push(`    ${origen} ==> ${destino}`);
}
lineas.push('```');

const mermaid = lineas.join('\n');

const md = [
  '# Grafo de Page Objects',
  '',
  `> Generado: ${new Date().toISOString()}`,
  `> **${nodos.size}** pages · **${aristas.length}** conexiones`,
  '',
  '**Leyenda:** 🟦 inicio · 🟪 intermedia · 🟩 terminal',
  '',
  mermaid,
  '',
];

mkdirSync('.autoflow/grafos', { recursive: true });
const outPath = '.autoflow/grafos/grafo.md';
writeFileSync(outPath, md.join('\n'), 'utf8');

console.log(mermaid);
console.log('');
console.log(`✅ Escrito en ${outPath} (${nodos.size} pages, ${aristas.length} conexiones)`);
