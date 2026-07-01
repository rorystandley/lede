import { decodeHTML } from 'entities';

/**
 * Decode character references found in feed metadata, such as `&#8217;` or
 * `&hellip;`. These values are returned as plain text, so decoding them is safe:
 * API clients still escape any resulting `<` or `>` characters when rendering.
 */
export function decodeHtmlEntities<T extends string | null | undefined>(
  value: T,
): T extends string ? string : T {
  return (typeof value === 'string' ? decodeHTML(value) : value) as T extends string ? string : T;
}
