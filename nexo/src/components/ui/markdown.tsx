/** Renderizador markdown mínimo e seguro (escapa HTML antes de converter). */
function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    )
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(
      /(^|\s)@([A-ZÀ-Ú][\wÀ-ú]+(?: [A-ZÀ-Ú][\wÀ-ú]+)?)/g,
      '$1<span class="rounded bg-brand-50 px-1 text-brand-700 font-medium">@$2</span>',
    );
}

export function markdownToHtml(src: string): string {
  const lines = esc(src ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const out: string[] = [];
  let i = 0;
  const flushPara = (buf: string[]) => {
    if (buf.length) out.push(`<p>${inline(buf.join('<br/>'))}</p>`);
    buf.length = 0;
  };
  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flushPara(para);
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara(para);
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara(para);
      out.push('<hr/>');
      i++;
      continue;
    }
    if (line.startsWith('&gt; ')) {
      flushPara(para);
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('&gt; ')) q.push(lines[i++].slice(5));
      out.push(`<blockquote>${inline(q.join('<br/>'))}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara(para);
      const cells = (l: string) =>
        l
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((c) => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }
    const li = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      flushPara(para);
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        let text = m[3];
        const cb = text.match(/^\[([ xX])\]\s+(.*)$/);
        if (cb)
          text = `<input type="checkbox" disabled ${cb[1] !== ' ' ? 'checked' : ''}/> ${cb[1] !== ' ' ? `<span class="line-through muted">${inline(cb[2])}</span>` : inline(cb[2])}`;
        else text = inline(text);
        items.push(`<li>${text}</li>`);
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (line.trim() === '') {
      flushPara(para);
      i++;
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara(para);
  return out.join('\n');
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = { __html: markdownToHtml(source) };
  return (
    <div
      className={`prose-md ${className ?? ''}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML gerado a partir de texto escapado
      dangerouslySetInnerHTML={html}
    />
  );
}
