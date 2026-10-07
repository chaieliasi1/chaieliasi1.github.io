// סורק את tools/*/index.html ובונה catalog.json מתגיות ה-meta של כל כלי.
// רץ אוטומטית ב-GitHub Action בכל push. מקומית: node scripts/build-catalog.mjs
//
// בראש כל כלי:
//   <meta name="tool:title" content="מחשבון תזרים">
//   <meta name="tool:description" content="משפט אחד">
//   <meta name="tool:type" content="מחשבון">        (מחשבון / מדריך / אחר)
//   <meta name="tool:public" content="true">         (מופיע בספרייה הציבורית)
//   <meta name="tool:lead" content="true">           (יש בו טופס ליד)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, 'tools');

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function meta(html, name) {
  const tag = html.match(new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]*>', 'i'));
  const content = tag && tag[0].match(/content=["']([^"']*)["']/i);
  return content ? decode(content[1].trim()) : '';
}

// first and last commit of the tool's folder; falls back to the file time outside git
function dates(dir, file) {
  try {
    const log = execFileSync('git', ['log', '--format=%cI', '--', dir], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (log.length) return { added: log[log.length - 1], updated: log[0] };
  } catch (e) { /* not a git checkout */ }
  const t = statSync(file).mtime.toISOString();
  return { added: t, updated: t };
}

const tools = (existsSync(TOOLS) ? readdirSync(TOOLS, { withFileTypes: true }) : [])
  .filter(d => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name))
  .map(d => {
    const file = join(TOOLS, d.name, 'index.html');
    if (!existsSync(file)) return null;
    const html = readFileSync(file, 'utf8');
    const title = meta(html, 'tool:title') || decode((html.match(/<title>([^<]*)<\/title>/i) || [, d.name])[1].split('·')[0].trim());
    return Object.assign({
      slug: d.name,
      path: 'tools/' + d.name + '/',
      title,
      description: meta(html, 'tool:description') || meta(html, 'description'),
      type: meta(html, 'tool:type') || 'כלי',
      public: meta(html, 'tool:public') === 'true',
      lead: meta(html, 'tool:lead') === 'true'
    }, dates('tools/' + d.name, file));
  })
  .filter(Boolean)
  .sort((a, b) => b.added.localeCompare(a.added));

writeFileSync(join(ROOT, 'catalog.json'), JSON.stringify({ built: new Date().toISOString(), tools }, null, 2) + '\n');
console.log('catalog.json: ' + tools.length + ' tools (' + tools.map(t => t.slug).join(', ') + ')');
