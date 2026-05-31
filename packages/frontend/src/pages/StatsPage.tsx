import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/stats.api.js';

interface Props {
  onClose: () => void;
}

export function StatsPage({ onClose }: Props) {
  const { data: summary } = useQuery({ queryKey: ['stats-summary'], queryFn: statsApi.summary });
  const { data: daily } = useQuery({ queryKey: ['stats-daily'], queryFn: () => statsApi.daily(14) });

  const maxArticles = Math.max(...(daily ?? []).map((d) => d.articlesRead), 1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Reading Stats</h2>
          <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Articles Read" value={summary?.totalArticlesRead ?? 0} />
            <StatCard label="Starred" value={summary?.totalStarred ?? 0} />
            <StatCard label="Feeds" value={summary?.totalFeeds ?? 0} />
            <StatCard label="This Week" value={summary?.weeklyArticlesRead ?? 0} subtitle={summary ? `${summary.weeklyReadingTimeMin} min` : undefined} />
          </div>

          {/* Daily bar chart */}
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">Last 14 Days</h3>
            {(!daily || daily.length === 0) ? (
              <p className="text-xs text-text-tertiary text-center py-6">No reading data yet. Start reading articles to see your stats.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-32">
                {(daily ?? []).reverse().map((day) => {
                  const height = Math.max((day.articlesRead / maxArticles) * 100, 4);
                  const date = new Date(day.date);
                  const label = date.toLocaleDateString(undefined, { weekday: 'short' });
                  return (
                    <div key={day.id} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-text-tertiary">{day.articlesRead}</span>
                      <div
                        className="w-full rounded-t bg-primary-500 dark:bg-primary-400 transition-all"
                        style={{ height: `${height}%` }}
                        title={`${day.date}: ${day.articlesRead} articles`}
                      />
                      <span className="text-[9px] text-text-tertiary">{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="bg-surface-secondary border border-border rounded-lg p-3 text-center">
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
      {subtitle && <p className="text-[10px] text-text-tertiary">{subtitle}</p>}
    </div>
  );
}
