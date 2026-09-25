/* Pull plain text out of a blog post so the TES PDF can reuse real copy. */
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
for (const f of files) {
  let h = fs.readFileSync(f, 'utf8');
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '')
       .replace(/<style[\s\S]*?<\/style>/gi, '')
       .replace(/<head[\s\S]*?<\/head>/gi, '')
       .replace(/<nav[\s\S]*?<\/nav>/gi, '')
       .replace(/<footer[\s\S]*?<\/footer>/gi, '')
       .replace(/<\/(p|h1|h2|h3|h4|li|div|blockquote)>/gi, '\n')
       .replace(/<li[^>]*>/gi, '- ')
       .replace(/<[^>]+>/g, '')
       .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
       .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
       .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
       .replace(/[ \t]+/g, ' ')
       .replace(/\n{3,}/g, '\n\n');
  console.log('\n========== ' + path.basename(f) + ' ==========\n');
  console.log(h.split('\n').map(s => s.trim()).filter(Boolean).join('\n'));
}
