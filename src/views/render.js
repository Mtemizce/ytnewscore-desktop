// Görünümler ayrı .html dosyalarında durur ve açılışta tek bir sayfada birleşir:
// <!-- @include partials/pager -->           → views/partials/pager.html
// <!-- @include sections/content kind=news --> → değişkenli; dosyada {{kind}} yerine geçer

const files = import.meta.glob('./**/*.html', { query: '?raw', import: 'default', eager: true });

const INCLUDE = /<!--\s*@include\s+([\w/-]+)((?:\s+\w+=[\w-]+)*)\s*-->/g;

export function renderView(name, vars = {}) {
  const source = files[`./${name}.html`];
  if (source === undefined) {
    throw new Error(`Görünüm bulunamadı: views/${name}.html`);
  }

  return source
    .replace(INCLUDE, (_, child, attrs) => renderView(child, { ...vars, ...parseVars(attrs) }))
    .replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function parseVars(attrs) {
  return Object.fromEntries(attrs.trim().split(/\s+/).filter(Boolean).map((pair) => pair.split('=')));
}
