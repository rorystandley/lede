interface OpmlOutline {
  title: string;
  xmlUrl?: string;
  htmlUrl?: string;
  type?: string;
  children: OpmlOutline[];
}

export function parseOpml(xml: string): OpmlOutline[] {
  const outlines: OpmlOutline[] = [];

  function parseOutlines(content: string): OpmlOutline[] {
    const results: OpmlOutline[] = [];
    const outlineRegex = /<outline\s([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi;
    let match;

    while ((match = outlineRegex.exec(content)) !== null) {
      const attrs = match[1];
      const innerContent = match[2] || '';

      const getAttr = (name: string): string | undefined => {
        const attrMatch = attrs.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
        return attrMatch ? decodeXmlEntities(attrMatch[1]) : undefined;
      };

      const outline: OpmlOutline = {
        title: getAttr('title') ?? getAttr('text') ?? 'Untitled',
        xmlUrl: getAttr('xmlUrl') ?? getAttr('xmlurl'),
        htmlUrl: getAttr('htmlUrl') ?? getAttr('htmlurl'),
        type: getAttr('type'),
        children: innerContent ? parseOutlines(innerContent) : [],
      };

      results.push(outline);
    }

    return results;
  }

  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return parseOutlines(bodyMatch[1]);
  }

  return outlines;
}

export function generateOpml(title: string, outlines: OpmlOutline[]): string {
  function renderOutline(outline: OpmlOutline, indent: number): string {
    const pad = '  '.repeat(indent);
    const attrs: string[] = [];
    attrs.push(`text="${escapeXml(outline.title)}"`);
    attrs.push(`title="${escapeXml(outline.title)}"`);
    if (outline.xmlUrl) attrs.push(`xmlUrl="${escapeXml(outline.xmlUrl)}"`);
    if (outline.htmlUrl) attrs.push(`htmlUrl="${escapeXml(outline.htmlUrl)}"`);
    if (outline.type) attrs.push(`type="${escapeXml(outline.type)}"`);

    if (outline.children.length > 0) {
      const children = outline.children.map((c) => renderOutline(c, indent + 1)).join('\n');
      return `${pad}<outline ${attrs.join(' ')}>\n${children}\n${pad}</outline>`;
    }
    return `${pad}<outline ${attrs.join(' ')} />`;
  }

  const body = outlines.map((o) => renderOutline(o, 2)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
