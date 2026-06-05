import sanitizeHtml from 'sanitize-html';

const articleSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'article', 'aside', 'section', 'header', 'footer', 'main',
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
    'abbr', 'cite', 'dfn', 'kbd', 'mark', 'q', 'samp', 'small',
    'sub', 'sup', 'time', 'var', 'wbr',
    'a', 'img', 'figure', 'figcaption',
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: [
      'href',
      'title',
      { name: 'target', values: ['_blank', '_self', '_parent', '_top'] },
      { name: 'rel', multiple: true, values: ['nofollow', 'noopener', 'noreferrer', 'ugc', 'sponsored'] },
    ],
    img: ['src', 'alt', 'title', 'width', 'height'],
    blockquote: ['cite'],
    q: ['cite'],
    time: ['datetime'],
    ol: ['start'],
    li: ['value'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    aside: [{ name: 'data-nr-meta', values: ['true'] }],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
  allowProtocolRelative: true,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
  parseStyleAttributes: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: attribs.rel ? `${attribs.rel} noopener noreferrer` : 'noopener noreferrer',
      },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

export function sanitizeArticleHtml(html: string | null | undefined): string | null {
  if (!html) return null;

  const clean = sanitizeHtml(html, articleSanitizeOptions).trim();
  return clean.length > 0 ? clean : null;
}

export function sanitizeArticleDisplayHtml(
  html: string | null | undefined,
  fallbackHtml: string | null | undefined,
): string | null {
  const clean = sanitizeArticleHtml(html);
  if (clean !== null) return clean;

  if (fallbackHtml !== null && fallbackHtml !== undefined) {
    return sanitizeArticleHtml(fallbackHtml) ?? '';
  }

  return null;
}

export function articleHtmlToText(html: string | null | undefined): string {
  const clean = sanitizeArticleHtml(html);
  if (!clean) return '';

  return clean.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeArticleImageUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;

  if (value.startsWith('//')) return value;

  try {
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(value);
    const parsed = new URL(value, 'https://lede.local');

    if (isRelative || parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}
