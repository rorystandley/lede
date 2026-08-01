import type { DigestContent } from '@lede/shared';

export function renderDigestEmail(content: DigestContent, displayName: string | null, appUrl: string): { html: string; text: string; subject: string } {
  const date = new Date(content.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const subject = `Your morning briefing — ${date} — ${content.stats.totalArticles} articles`;
  const greeting = displayName ? `Good morning, ${displayName}` : 'Good morning';

  const htmlSections = content.sections.map((section) => {
    const folderHeader = section.folder ? `<h3 style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:24px 0 12px;">${escape(section.folder)}</h3>` : '';
    const feedGroups = section.feeds.map((fg) => {
      const articles = fg.articles.map((a) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <a href="${escape(a.url ?? appUrl)}" style="font-size:14px;font-weight:600;color:#111827;text-decoration:none;display:block;line-height:1.4;">${escape(a.title ?? 'Untitled')}</a>
            ${a.aiSummary ? `<p style="font-size:13px;color:#4b5563;margin:6px 0 0;line-height:1.5;">${escape(a.aiSummary)}</p>` : a.summary ? `<p style="font-size:13px;color:#6b7280;margin:6px 0 0;line-height:1.5;">${escape(a.summary.slice(0, 200))}</p>` : ''}
          </td>
        </tr>`).join('');
      return `
        <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <div style="background:#f9fafb;padding:8px 16px;font-size:12px;font-weight:600;color:#374151;">${escape(fg.feedTitle ?? 'Feed')}</div>
          <table style="width:100%;border-collapse:collapse;">${articles}</table>
        </div>`;
    }).join('');
    return folderHeader + feedGroups;
  }).join('');

  const briefingBox = content.briefing ? `
    <div style="background:#ecfdf5;border-left:4px solid #12B981;padding:16px;border-radius:6px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.5;">${escape(content.briefing)}</p>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;max-width:600px;width:100%;">
        <tr><td style="padding:32px 32px 16px;">
          <h1 style="margin:0 0 4px;font-size:24px;color:#111827;">Morning Briefing</h1>
          <p style="margin:0;color:#6b7280;font-size:14px;">${escape(greeting)} — ${escape(date)}</p>
          <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">${content.stats.totalArticles} articles · ~${content.stats.estimatedReadTimeMin} min read</p>
        </td></tr>
        <tr><td style="padding:0 32px;">${briefingBox}${htmlSections}</td></tr>
        <tr><td style="padding:24px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <a href="${escape(appUrl)}" style="display:inline-block;padding:10px 20px;background:#12B981;color:white;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Open lede</a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">Manage your digest preferences in Settings.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [`${greeting} — ${date}`, `${content.stats.totalArticles} articles · ~${content.stats.estimatedReadTimeMin} min read`, ''];
  if (content.briefing) { textLines.push(content.briefing, ''); }
  for (const section of content.sections) {
    if (section.folder) textLines.push(`-- ${section.folder} --`);
    for (const fg of section.feeds) {
      textLines.push(`\n${fg.feedTitle ?? 'Feed'}`);
      for (const a of fg.articles) {
        textLines.push(`  • ${a.title ?? 'Untitled'}`);
        if (a.url) textLines.push(`    ${a.url}`);
      }
    }
  }
  textLines.push(`\n${appUrl}`);

  return { html, text: textLines.join('\n'), subject };
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
