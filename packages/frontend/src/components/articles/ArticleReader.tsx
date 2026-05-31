import { useArticle, useMarkRead, useStarArticle } from '../../hooks/use-articles.js';
import { useUiStore } from '../../stores/index.js';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi, articlesApi } from '../../api/index.js';

/** Mirror of backend isThinContent — keep them in sync. */
function isThinContent(html: string | null, text: string | null): boolean {
  const t = text ?? '';
  if (t.length < 800) return true;
  if (/Article URL:\s*https?:\/\//i.test(t) && t.length < 2000) return true;
  if (/^Comments URL:/im.test(t) && t.length < 2000) return true;
  if (html && html.length < 1000 && !/<p[\s>]/i.test(html)) return true;
  return false;
}

export function ArticleReader() {
  const qc = useQueryClient();
  const { selectedArticleId, selectArticle } = useUiStore();
  const { data: article, isLoading } = useArticle(selectedArticleId);
  const markRead = useMarkRead();
  const starArticle = useStarArticle();
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiTags, setAiTags] = useState<string[] | null>(null);
  const autoExtractedRef = useRef<Set<string>>(new Set());

  const summarizeMut = useMutation({
    mutationFn: (articleId: string) => aiApi.summarize(articleId),
    onSuccess: (data) => setAiSummary(data.summary),
  });

  const suggestTagsMut = useMutation({
    mutationFn: (articleId: string) => aiApi.suggestTags(articleId),
    onSuccess: (data) => setAiTags(data.tags),
  });

  const extractMut = useMutation({
    mutationFn: (articleId: string) => articlesApi.extract(articleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['article', selectedArticleId] });
      qc.invalidateQueries({ queryKey: ['articles'] });
    },
  });

  useEffect(() => {
    if (article && !article.isRead) markRead.mutate([article.id]);
  }, [article?.id]);

  // Auto-extract once per article if content is thin and we haven't tried yet
  useEffect(() => {
    if (!article || !article.url) return;
    if (autoExtractedRef.current.has(article.id)) return;
    if (isThinContent(article.contentHtml, article.contentText)) {
      autoExtractedRef.current.add(article.id);
      extractMut.mutate(article.id);
    }
  }, [article?.id]);

  useEffect(() => {
    setAiSummary(null);
    setAiTags(null);
  }, [selectedArticleId]);

  if (!selectedArticleId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary bg-surface-secondary">
        <p className="text-sm">Select an article to read</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-secondary">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary bg-surface-secondary">
        <p className="text-sm">Article not found</p>
      </div>
    );
  }

  const stillThin = isThinContent(article.contentHtml, article.contentText) && !extractMut.isPending;
  const isExtracting = extractMut.isPending;

  return (
    <div className="flex-1 overflow-y-auto bg-surface-secondary">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => selectArticle(null)}
            className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>

          <div className="flex items-center gap-1.5">
            {article.url && (
              <button
                onClick={() => extractMut.mutate(article.id)}
                disabled={isExtracting}
                className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
                title="Fetch full article from URL"
              >
                {isExtracting ? 'Fetching...' : 'Fetch'}
              </button>
            )}
            <button
              onClick={() => summarizeMut.mutate(article.id)}
              disabled={summarizeMut.isPending}
              className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
              title="AI Summarize"
            >
              {summarizeMut.isPending ? '...' : 'Summarize'}
            </button>
            <button
              onClick={() => suggestTagsMut.mutate(article.id)}
              disabled={suggestTagsMut.isPending}
              className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
              title="AI Suggest Tags"
            >
              {suggestTagsMut.isPending ? '...' : 'Suggest Tags'}
            </button>
            <button
              onClick={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
              className={`p-1.5 rounded ${article.isStarred ? 'text-yellow-500' : 'text-text-tertiary hover:text-yellow-500'}`}
              aria-label={article.isStarred ? 'Unstar' : 'Star'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={article.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            {article.url && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded text-text-tertiary hover:text-text-primary"
                aria-label="Open original"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* Extraction banner */}
        {isExtracting && (
          <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3 mb-4 flex items-center gap-2">
            <div className="animate-spin w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full" />
            <span className="text-xs text-primary-700 dark:text-primary-300">Fetching full article from {tryHostname(article.url)}...</span>
          </div>
        )}
        {!isExtracting && stillThin && article.url && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
            <div className="text-xs text-amber-800 dark:text-amber-200">
              This feed only includes a link. Want to fetch the full article from {tryHostname(article.url)}?
            </div>
            <button
              onClick={() => extractMut.mutate(article.id)}
              className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 shrink-0"
            >
              Fetch
            </button>
          </div>
        )}
        {extractMut.isError && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-red-600 dark:text-red-400">Could not fetch full article. The site may block scrapers or require JavaScript.</p>
          </div>
        )}

        {/* AI Summary Panel */}
        {aiSummary && (
          <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-600 dark:text-primary-400">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
              <span className="text-xs font-medium text-primary-600 dark:text-primary-400">AI Summary</span>
            </div>
            <p className="text-sm text-text-primary">{aiSummary}</p>
          </div>
        )}

        {summarizeMut.isError && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-red-600 dark:text-red-400">AI summarization unavailable. Configure your AI provider in Settings.</p>
          </div>
        )}

        {/* AI Tag Suggestions */}
        {aiTags && aiTags.length > 0 && (
          <div className="bg-surface-tertiary rounded-lg p-3 mb-4">
            <span className="text-xs text-text-tertiary">Suggested tags: </span>
            {aiTags.map((tag) => (
              <span key={tag} className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mr-1.5 mb-1">
                {tag}
              </span>
            ))}
          </div>
        )}

        <article>
          <div className="mb-4">
            <span className="text-xs text-primary-600 dark:text-primary-400">{article.feedTitle}</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary leading-tight mb-3">
            {article.title ?? 'Untitled'}
          </h1>
          <div className="flex items-center gap-3 text-sm text-text-secondary mb-6">
            {article.author && <span>By {article.author}</span>}
            {article.publishedAt && (
              <time dateTime={article.publishedAt}>
                {new Date(article.publishedAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </time>
            )}
            {article.wordCount > 0 && (
              <span>{Math.ceil(article.wordCount / 200)} min read</span>
            )}
          </div>

          {/* Lead image */}
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full max-h-96 object-cover rounded-lg mb-6"
            />
          )}

          {article.tags.length > 0 && (
            <div className="flex gap-1.5 mb-6">
              {article.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    color: tag.color ?? undefined,
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-text-primary prose-p:text-text-secondary prose-a:text-primary-600 prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: article.contentHtml ?? article.summary ?? '' }}
          />
        </article>
      </div>
    </div>
  );
}

function tryHostname(url: string | null): string {
  if (!url) return 'the source';
  try { return new URL(url).hostname; } catch { return 'the source'; }
}
