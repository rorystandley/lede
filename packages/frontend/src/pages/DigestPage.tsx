import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { digestsApi } from '../api/index.js';
import type { DigestContent, DigestArticleSummary } from '@news-reader/shared';

interface Props {
  onClose: () => void;
  onOpenArticle: (articleId: string) => void;
}

export function DigestPage({ onClose, onOpenArticle }: Props) {
  const qc = useQueryClient();
  const { data: digest, isLoading, error } = useQuery({
    queryKey: ['digest-latest'],
    queryFn: digestsApi.latest,
  });

  const buildMut = useMutation({
    mutationFn: digestsApi.build,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest-latest'] }),
  });

  const content = digest?.content as DigestContent | null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Morning Briefing</h2>
            {content && <p className="text-xs text-text-secondary mt-0.5">{content.date} — {content.stats.totalArticles} articles — ~{content.stats.estimatedReadTimeMin} min read</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => buildMut.mutate()}
              disabled={buildMut.isPending}
              className="px-3 py-1.5 text-xs font-medium bg-surface-tertiary text-text-primary rounded hover:bg-border disabled:opacity-50"
            >
              {buildMut.isPending ? 'Building...' : 'Rebuild'}
            </button>
            <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
          )}

          {error && !digest && (
            <div className="text-center py-12">
              <p className="text-sm text-text-secondary mb-3">No digest available yet</p>
              <button
                onClick={() => buildMut.mutate()}
                disabled={buildMut.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {buildMut.isPending ? 'Building your briefing...' : 'Build Morning Briefing'}
              </button>
            </div>
          )}

          {content && content.briefing && (
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6">
              <p className="text-sm text-text-primary">{content.briefing}</p>
            </div>
          )}

          {content && content.sections.map((section, si) => (
            <div key={si} className="mb-6">
              {section.folder && (
                <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">{section.folder}</h3>
              )}
              {section.feeds.map((feedGroup) => (
                <div key={feedGroup.feedId} className="mb-4">
                  <h4 className="text-sm font-medium text-text-primary mb-2">{feedGroup.feedTitle}</h4>
                  <div className="space-y-2">
                    {feedGroup.articles.map((article) => (
                      <DigestArticleRow key={article.id} article={article} onClick={() => { onOpenArticle(article.id); onClose(); }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {content && content.sections.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-6">All caught up! No new articles since your last digest.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DigestArticleRow({ article, onClick }: { article: DigestArticleSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded border border-border hover:bg-surface-secondary transition-colors"
    >
      <h5 className="text-sm font-medium text-text-primary leading-snug">{article.title ?? 'Untitled'}</h5>
      {article.aiSummary ? (
        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{article.aiSummary}</p>
      ) : article.summary ? (
        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{article.summary}</p>
      ) : null}
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-tertiary">
        {article.publishedAt && <span>{new Date(article.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </button>
  );
}
