import { listArticlesQuerySchema } from '@lede/shared';

// Regression test for the News Feed showing read articles instead of unread.
// Query params arrive as strings; `z.coerce.boolean()` ran `Boolean("false")`,
// which is `true`, so `?isRead=false` parsed to `true` and the unread-only
// feed silently filtered to read articles. These assertions lock in that the
// literal string "false" parses to the boolean false.
describe('listArticlesQuerySchema boolean params', () => {
  it('parses isRead=false as false (not true)', () => {
    expect(listArticlesQuerySchema.parse({ isRead: 'false' }).isRead).toBe(false);
  });

  it('parses isRead=true as true', () => {
    expect(listArticlesQuerySchema.parse({ isRead: 'true' }).isRead).toBe(true);
  });

  it('distinguishes false from true for every boolean param', () => {
    const asFalse = listArticlesQuerySchema.parse({
      isRead: 'false',
      isStarred: 'false',
      isArchived: 'false',
    });
    expect(asFalse).toMatchObject({ isRead: false, isStarred: false, isArchived: false });

    const asTrue = listArticlesQuerySchema.parse({
      isRead: 'true',
      isStarred: 'true',
      isArchived: 'true',
    });
    expect(asTrue).toMatchObject({ isRead: true, isStarred: true, isArchived: true });
  });

  it('leaves omitted boolean params undefined', () => {
    const parsed = listArticlesQuerySchema.parse({});
    expect(parsed.isRead).toBeUndefined();
    expect(parsed.isStarred).toBeUndefined();
    expect(parsed.isArchived).toBeUndefined();
  });

  it('rejects non-boolean strings rather than silently coercing them', () => {
    expect(() => listArticlesQuerySchema.parse({ isRead: '1' })).toThrow();
  });
});
