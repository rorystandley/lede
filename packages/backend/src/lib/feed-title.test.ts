import { describe, expect, it } from 'vitest';
import {
  isPoorFeedTitle,
  humanizeHostname,
  extractSiteName,
  deriveDisplayTitle,
} from './feed-title.js';

describe('isPoorFeedTitle', () => {
  it('treats empty, URL-like, and domain titles as poor', () => {
    expect(isPoorFeedTitle('', 'https://example.com')).toBe(true);
    expect(isPoorFeedTitle('   ', 'https://example.com')).toBe(true);
    expect(isPoorFeedTitle(null, 'https://example.com')).toBe(true);
    expect(isPoorFeedTitle('https://example.com/feed', 'https://example.com')).toBe(true);
    expect(isPoorFeedTitle('martinfowler.com', 'https://martinfowler.com')).toBe(true);
    expect(isPoorFeedTitle('www.theregister.com - Articles', 'https://www.theregister.com')).toBe(true);
  });

  it('keeps real brand names', () => {
    expect(isPoorFeedTitle('The Verge', 'https://www.theverge.com')).toBe(false);
    expect(isPoorFeedTitle('Ars Technica', 'https://arstechnica.com')).toBe(false);
    expect(isPoorFeedTitle('Martin Fowler', 'https://martinfowler.com')).toBe(false);
  });
});

describe('humanizeHostname', () => {
  it('title-cases the root label', () => {
    expect(humanizeHostname('https://www.theregister.com/feed')).toBe('Theregister');
    expect(humanizeHostname('https://martinfowler.com')).toBe('Martinfowler');
  });
});

describe('extractSiteName', () => {
  it('prefers a short brand-like <title> segment over taglines and lowercase og:site_name', () => {
    const html = '<meta property="og:site_name" content="theregister">'
      + '<title>Technology news and analysis | The Register</title>';
    expect(extractSiteName(html)).toBe('The Register');
  });

  it('uses og:site_name when it is already a clean brand', () => {
    expect(extractSiteName('<meta property="og:site_name" content="Ars Technica" />'
      + '<title>Ars Technica - Serving the Technologist since 1998</title>')).toBe('Ars Technica');
    expect(extractSiteName('<meta property="og:site_name" content="The Verge"/><title>The Verge</title>')).toBe('The Verge');
  });

  it('decodes basic entities', () => {
    expect(extractSiteName('<title>Smith &amp; Co | Home</title>')).toBe('Smith & Co');
  });

  it('returns null when only a bare domain is available', () => {
    expect(extractSiteName('<title>martinfowler.com</title>')).toBeNull();
  });
});

describe('deriveDisplayTitle', () => {
  it('keeps a good feed title', () => {
    expect(deriveDisplayTitle('Martin Fowler', 'https://martinfowler.com', '<title>martinfowler.com</title>')).toBe('Martin Fowler');
  });

  it('replaces a poor title with the site name from HTML', () => {
    const html = '<title>Technology news and analysis | The Register</title>';
    expect(deriveDisplayTitle('www.theregister.com - Articles', 'https://www.theregister.com', html)).toBe('The Register');
  });

  it('falls back to a humanized hostname when no site name is available', () => {
    expect(deriveDisplayTitle('martinfowler.com', 'https://martinfowler.com', null)).toBe('Martinfowler');
  });
});
