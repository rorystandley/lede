import { useArticle, useMarkRead, useStarArticle } from '../../hooks/use-articles.js';
import { useUiStore } from '../../stores/index.js';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi, articlesApi, sharingApi } from '../../api/index.js';
import { tagsApi } from '../../api/tags.api.js';
import { ArticlePlaceholder } from '../shared/ArticlePlaceholder.js';
import { AnnotatedContent } from './AnnotatedContent.js';

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
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'shared' | 'error'>('idle');
  const shareTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleShare = async (articleId: string) => {
    setShareStatus('loading');
    try {
      const data = await sharingApi.getShareData(articleId);
      // Try native Web Share API first
      if (navigator.share) {
        await navigator.share({
          title: data.title,
          text: data.summary ?? undefined,
          url: data.shareUrl,
        });
      } else {
        // Fallback: copy share URL to clipboard
        await navigator.clipboard.writeText(data.shareUrl);
      }
      setShareStatus('shared');
      clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareStatus('idle'), 2000);
    } catch (err: unknown) {
      // User cancelled the native share dialog — not an error
      if (err instanceof DOMException && err.name === 'AbortError') {
        setShareStatus('idle');
        return;
      }
      setShareStatus('error');
      clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareStatus('idle'), 3000);
    }
  };

  const summarizeMut = useMutation({
    mutationFn: (articleId: string) => aiApi.summarize(articleId),
    onSuccess: (data) => setAiSummary(data.summary),
  });

  const [tagSuggestionError, setTagSuggestionError] = useState<string | null>(null);
  const [appliedTagNames, setAppliedTagNames] = useState<Set<string>>(new Set());
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissedBanners((s) => new Set(s).add(id));
  const isDismissed = (id: string) => dismissedBanners.has(id);

  const suggestTagsMut = useMutation({
    mutationFn: (articleId: string) => aiApi.suggestTags(articleId),
    onMutate: () => {
      setTagSuggestionError(null);
      setAiTags(null);
    },
    onSuccess: (data) => setAiTags(data.tags),
    onError: (err: Error) => {
      const msg = err.message || '';
      if (msg.includes('400') || msg.toLowerCase().includes('not configured')) {
        setTagSuggestionError('AI not configured. Add an API key in Settings.');
      } else {
        setTagSuggestionError('AI request failed. Check your API key or try again.');
      }
    },
  });

  const applyTagMut = useMutation({
    mutationFn: ({ articleId, name }: { articleId: string; name: string }) =>
      tagsApi.applyByName(articleId, [name], 'ai'),
    onSuccess: (_data, vars) => {
      setAppliedTagNames((s) => new Set(s).add(vars.name.toLowerCase()));
      qc.invalidateQueries({ queryKey: ['article', selectedArticleId] });
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['articles-infinite'] });
    },
  });

  const [extractAttempts, setExtractAttempts] = useState(0);
  const [extractStartedAt, setExtractStartedAt] = useState<number | null>(null);
  const [lastExtractFailedAt, setLastExtractFailedAt] = useState<Date | null>(null);
  const [lastExtractStatus, setLastExtractStatus] = useState<'full' | 'metadata' | null>(null);
  const [minDelayPending, setMinDelayPending] = useState(false);

  const extractMut = useMutation({
    mutationFn: (articleId: string) => articlesApi.extract(articleId),
    onMutate: () => {
      setExtractStartedAt(Date.now());
      setLastExtractFailedAt(null);
    },
    onSuccess: (data) => {
      setLastExtractStatus(data.extractionStatus ?? 'full');
      qc.invalidateQueries({ queryKey: ['article', selectedArticleId] });
      qc.invalidateQueries({ queryKey: ['articles'] });
    },
    onError: () => {
      setLastExtractFailedAt(new Date());
      setLastExtractStatus(null);
    },
    onSettled: () => {
      // Keep the loading state visible for at least 800ms so very fast failures register.
      const elapsed = extractStartedAt ? Date.now() - extractStartedAt : 1000;
      const remaining = Math.max(0, 800 - elapsed);
      if (remaining > 0) {
        setMinDelayPending(true);
        setTimeout(() => setMinDelayPending(false), remaining);
      }
      setExtractAttempts((n) => n + 1);
    },
  });

  const triggerExtract = (id: string) => {
    setLastExtractFailedAt(null);
    extractMut.mutate(id);
  };

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
    setTagSuggestionError(null);
    setDismissedBanners(new Set());
    setAppliedTagNames(new Set());
    setExtractAttempts(0);
    setLastExtractFailedAt(null);
    setLastExtractStatus(null);
    setMinDelayPending(false);
    setShareStatus('idle');
    clearTimeout(shareTimerRef.current);
    extractMut.reset();
    suggestTagsMut.reset();
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

  const isExtracting = extractMut.isPending || minDelayPending;
  const stillThin = isThinContent(article.contentHtml, article.contentText) && !isExtracting;
  const extractFailed = !isExtracting && lastExtractFailedAt !== null;
  const onlyMetadata = !isExtracting && stillThin && lastExtractStatus === 'metadata';

  return (
    <div className="flex-1 overflow-y-auto bg-surface-secondary">
      <div className="p-4 md:p-6">
        <div
          data-testid="article-reader-toolbar"
          className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 border-b border-border bg-surface-secondary/95 px-4 py-3 backdrop-blur md:-mx-6 md:-mt-6 md:px-6"
        >
          <button
            onClick={() => selectArticle(null)}
            className="p-2 -ml-2 rounded text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary flex shrink-0 items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>

          <div className="flex items-center gap-1 md:gap-1.5 flex-wrap justify-end">
            {article.url && (
              <button
                onClick={() => triggerExtract(article.id)}
                disabled={isExtracting}
                className="px-2 py-1.5 md:py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50 flex items-center gap-1.5"
                title="Fetch full article from URL"
              >
                {isExtracting && (
                  <span className="animate-spin w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full" />
                )}
                {isExtracting ? 'Fetching...' : 'Fetch'}
              </button>
            )}
            <button
              onClick={() => summarizeMut.mutate(article.id)}
              disabled={summarizeMut.isPending}
              className="px-2 py-1.5 md:py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
              title="AI Summarize"
            >
              {summarizeMut.isPending ? '...' : 'Summarize'}
            </button>
            <button
              onClick={() => suggestTagsMut.mutate(article.id)}
              disabled={suggestTagsMut.isPending}
              className="hidden sm:flex px-2 py-1.5 md:py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50 items-center gap-1.5"
              title="AI Suggest Tags"
            >
              {suggestTagsMut.isPending && (
                <span className="animate-spin w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full" />
              )}
              {suggestTagsMut.isPending ? 'Thinking...' : 'Tags'}
            </button>
            <button
              onClick={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
              className={`p-2 md:p-1.5 rounded ${article.isStarred ? 'text-yellow-500' : 'text-text-tertiary hover:text-yellow-500'}`}
              aria-label={article.isStarred ? 'Unstar' : 'Star'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={article.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              onClick={() => handleShare(article.id)}
              disabled={shareStatus === 'loading'}
              className={`p-2 md:p-1.5 rounded ${
                shareStatus === 'shared' ? 'text-green-500'
                : shareStatus === 'error' ? 'text-red-500'
                : 'text-text-tertiary hover:text-text-primary'
              }`}
              aria-label={
                shareStatus === 'shared' ? 'Link copied!'
                : shareStatus === 'error' ? 'Share failed'
                : 'Share article'
              }
              title={
                shareStatus === 'shared' ? 'Link copied!'
                : shareStatus === 'error' ? 'Share failed'
                : 'Share article'
              }
            >
              {shareStatus === 'loading' ? (
                <span className="block w-4 h-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              ) : shareStatus === 'shared' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              )}
            </button>
            {article.url && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 md:p-1.5 rounded text-text-tertiary hover:text-text-primary"
                aria-label="Open original"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* Extraction status — one banner that morphs between states */}
        {(() => {
          if (!article.url) return null;
          const bannerState: 'loading' | 'error' | 'metadata' | 'idle' =
            isExtracting ? 'loading'
            : extractFailed ? 'error'
            : onlyMetadata ? 'metadata'
            : 'idle';
          // Don't render anything in pure idle if the user dismissed the offer
          if (bannerState === 'idle' && isDismissed('extract-idle')) return null;
          if (bannerState === 'error' && isDismissed('extract-error')) return null;
          if (bannerState === 'metadata' && isDismissed('extract-metadata')) return null;
          if (!(isExtracting || stillThin || extractFailed)) return null;
          return (
            <ExtractionBanner
              state={bannerState}
              host={tryHostname(article.url)}
              attempts={extractAttempts}
              lastFailedAt={lastExtractFailedAt}
              onFetch={() => triggerExtract(article.id)}
              onDismiss={
                bannerState === 'loading'
                  ? undefined
                  : () => dismiss(`extract-${bannerState}`)
              }
            />
          );
        })()}

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

        {summarizeMut.isError && !isDismissed('summary-error') && (
          <DismissibleBanner tone="error" onDismiss={() => dismiss('summary-error')}>
            AI summarization unavailable. Configure your AI provider in Settings.
          </DismissibleBanner>
        )}

        {/* AI Tag Suggestions */}
        {tagSuggestionError && !isDismissed('tag-error') && (
          <DismissibleBanner tone="error" onDismiss={() => dismiss('tag-error')}>
            {tagSuggestionError}
          </DismissibleBanner>
        )}
        {suggestTagsMut.isSuccess && aiTags !== null && aiTags.length === 0 && (
          <div className="bg-surface-tertiary rounded-lg p-3 mb-4">
            <p className="text-xs text-text-secondary">No tag suggestions for this article — the AI didn't return anything useful.</p>
          </div>
        )}
        {aiTags && aiTags.length > 0 && (
          <div className="bg-surface-tertiary rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-tertiary">AI-suggested tags · click to apply</span>
              {(article.tags.some((t) => aiTags.includes(t.name.toLowerCase())) || appliedTagNames.size > 0) && (
                <span className="text-[10px] text-text-tertiary">Applied tags appear in the sidebar</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {aiTags.map((tag) => {
                const alreadyOnArticle = article.tags.some((t) => t.name.toLowerCase() === tag.toLowerCase());
                const justApplied = appliedTagNames.has(tag.toLowerCase());
                const isApplied = alreadyOnArticle || justApplied;
                const isApplying = applyTagMut.isPending && applyTagMut.variables?.name === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => !isApplied && applyTagMut.mutate({ articleId: article.id, name: tag })}
                    disabled={isApplied || isApplying}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${
                      isApplied
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                        : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 cursor-pointer'
                    } ${isApplying ? 'opacity-50' : ''}`}
                  >
                    {isApplied && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {!isApplied && !isApplying && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                    {isApplying && (
                      <span className="animate-spin w-2 h-2 border-2 border-current border-t-transparent rounded-full" />
                    )}
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <article>
          <div className="mb-4">
            <span className="text-xs text-primary-600 dark:text-primary-400">{article.feedTitle}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary leading-tight mb-3">
            {article.title ?? 'Untitled'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm text-text-secondary mb-6">
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
          {article.imageUrl ? (
            <img
              src={upgradeUrl(article.imageUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full max-h-96 object-cover rounded-lg mb-6"
            />
          ) : (
            <div className="w-full h-56 rounded-lg overflow-hidden mb-6">
              <ArticlePlaceholder size="hero" seed={article.id} />
            </div>
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

          <AnnotatedContent
            articleId={article.id}
            html={upgradeImageUrls(article.contentHtml ?? article.summary ?? '')}
          />
        </article>
      </div>
    </div>
  );
}

function tryHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return 'the source'; }
}

/**
 * Upgrade image URLs to higher resolution where common CDNs use
 * query params to serve thumbnails. We patch both src and srcset.
 * This is a one-pass regex replacement — cheap and good enough.
 */
function upgradeImageUrls(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    let next = attrs as string;
    // Strip ?w=NN&h=NN size params from src
    next = next.replace(/(src=["'])([^"']+)(["'])/i, (_m, p, url, q) => `${p}${upgradeUrl(url)}${q}`);
    // Drop srcset entirely so the browser picks src
    next = next.replace(/\s+srcset=["'][^"']*["']/i, '');
    next = next.replace(/\s+sizes=["'][^"']*["']/i, '');
    return `<img${next}>`;
  });
}

function upgradeUrl(url: string): string {
  try {
    const u = new URL(url, 'https://example.com');
    // WordPress (TechCrunch, Wired, many blogs): drop w/h/resize/quality
    for (const k of ['w', 'h', 'resize', 'fit', 'crop', 'quality', 'q']) u.searchParams.delete(k);
    // Substack/CDN: /image/fetch/w_NN,c_limit/...
    const cleaned = u.toString()
      .replace(/\/w_\d+,?/g, '/')
      .replace(/\/h_\d+,?/g, '/')
      .replace(/\/c_(limit|fill|crop),?/g, '/')
      .replace(/\/q_\d+,?/g, '/');
    return cleaned;
  } catch {
    return url;
  }
}

/**
 * Single banner that morphs between idle (offer to fetch), loading (visible spinner +
 * minimum display time so fast failures still register), and error (with timestamp
 * and attempt count so retries are visible).
 */
/** Small close (×) button used inside dismissible banners. */
function DismissButton({ onDismiss, tone }: { onDismiss: () => void; tone: 'amber' | 'red' | 'primary' | 'neutral' }) {
  const colour = {
    amber: 'text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40',
    red: 'text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40',
    primary: 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40',
    neutral: 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary',
  }[tone];
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss"
      className={`p-1 rounded shrink-0 ${colour}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/** Simple dismissible single-line banner — error / info / warning. */
function DismissibleBanner({ children, tone, onDismiss }: {
  children: React.ReactNode;
  tone: 'error' | 'info' | 'warning';
  onDismiss?: () => void;
}) {
  const cls = {
    error: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300',
    info: 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200',
  }[tone];
  const dismissToneByBannerTone: Record<typeof tone, 'red' | 'primary' | 'amber'> = {
    error: 'red',
    info: 'primary',
    warning: 'amber',
  };
  const dismissTone = dismissToneByBannerTone[tone];
  return (
    <div className={`${cls} rounded-lg p-3 mb-4 flex items-start justify-between gap-3`}>
      <div className="text-xs flex-1">{children}</div>
      {onDismiss && <DismissButton tone={dismissTone} onDismiss={onDismiss} />}
    </div>
  );
}

function ExtractionBanner({ state, host, attempts, lastFailedAt, onFetch, onDismiss }: {
  state: 'idle' | 'loading' | 'error' | 'metadata';
  host: string;
  attempts: number;
  lastFailedAt: Date | null;
  onFetch: () => void;
  onDismiss?: () => void;
}) {
  if (state === 'metadata') {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 mb-4 flex items-start justify-between gap-3">
        <div className="text-xs text-amber-800 dark:text-amber-200 flex-1">
          We got the cover image and description from {host}, but couldn't pull the full article — the site likely requires JavaScript to render the body.
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={`https://${host}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            Open original
          </a>
          {onDismiss && <DismissButton tone="amber" onDismiss={onDismiss} />}
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-3 mb-4 flex items-center gap-3">
        <div className="animate-spin w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium text-primary-700 dark:text-primary-300">
            Fetching full article from {host}…
          </p>
          <p className="text-[11px] text-primary-600/70 dark:text-primary-400/70 mt-0.5">
            This usually takes a couple of seconds.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    const time = lastFailedAt!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg p-3 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium text-red-700 dark:text-red-300">
              Couldn't fetch from {host}
            </p>
            <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
              {attempts > 1 ? `Attempt ${attempts} failed at ${time}. ` : `Failed at ${time}. `}
              The site may block scrapers or require JavaScript.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onFetch}
              className="px-2.5 py-1 text-xs font-medium border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/40"
            >
              Try again
            </button>
            {onDismiss && <DismissButton tone="red" onDismiss={onDismiss} />}
          </div>
        </div>
      </div>
    );
  }

  // idle — feed is thin, offer to fetch
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 mb-4 flex items-start justify-between gap-3">
      <div className="text-xs text-amber-800 dark:text-amber-200 flex-1">
        This feed only includes a link. Want to fetch the full article from <span className="font-medium">{host}</span>?
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onFetch}
          className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
        >
          Fetch
        </button>
        {onDismiss && <DismissButton tone="amber" onDismiss={onDismiss} />}
      </div>
    </div>
  );
}
