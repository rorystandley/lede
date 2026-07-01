import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './html-entities.js';

describe('decodeHtmlEntities', () => {
  it('decodes decimal, hexadecimal, and named character references', () => {
    expect(decodeHtmlEntities('Meta &#8216;rate limits&#8217; &amp; paywalls')).toBe(
      'Meta ‘rate limits’ & paywalls',
    );
    expect(decodeHtmlEntities('A&#x2014;B &hellip; C')).toBe('A—B … C');
  });

  it('preserves nullable values', () => {
    expect(decodeHtmlEntities(null)).toBeNull();
    expect(decodeHtmlEntities(undefined)).toBeUndefined();
  });
});
