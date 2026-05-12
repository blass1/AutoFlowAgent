// Helper compartido: formatea un timestamp local en formato DD_MM_YYYY_HH-MM-SS
// para nombrar carpetas de artifacts por corrida (`runs/{ts}/`).
//
// Lo usan run-test.js y run-testset.js antes de invocar Playwright para setear
// `AUTOFLOW_RUN_DIR`. Playwright lo lee desde playwright.config.ts y vuelca
// screenshots, traces, videos y attachments dentro de esa carpeta.

function formatRunTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${dd}_${mm}_${yyyy}_${hh}-${mi}-${ss}`;
}

module.exports = { formatRunTimestamp };
