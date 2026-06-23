import { useEffect } from 'react';
import { useFeeds } from './use-feeds.js';

const BASE_TITLE = 'lede.';

/**
 * Reflects the total unread count in the browser tab title, e.g. "(12) lede.",
 * so the unread badge is visible from the tab — like Inoreader. Falls back to
 * the base title when nothing is unread.
 */
export function useUnreadTitle() {
  const { data } = useFeeds();
  const unread = data?.items?.reduce((sum, feed) => sum + feed.unreadCount, 0) ?? 0;

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unread]);

  // Restore the base title when this leaves the tree (e.g. on logout).
  useEffect(() => () => { document.title = BASE_TITLE; }, []);
}
