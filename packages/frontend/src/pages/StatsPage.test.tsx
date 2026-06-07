import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsPage } from './StatsPage.js';

const useQueryMock = vi.fn();
const { statsApi } = vi.hoisted(() => ({
  statsApi: {
    summary: vi.fn(),
    daily: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (args: unknown) => useQueryMock(args),
}));

vi.mock('../api/stats.api.js', () => ({
  statsApi,
}));

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statsApi.daily.mockResolvedValue([]);
  });

  it('renders summary cards and a daily chart', () => {
    useQueryMock
      .mockReturnValueOnce({
        data: {
          totalArticlesRead: 42,
          totalStarred: 5,
          totalFeeds: 7,
          weeklyArticlesRead: 9,
          weeklyReadingTimeMin: 33,
        },
      })
      .mockReturnValueOnce({
        data: [
          { id: 'd1', date: '2026-06-01', articlesRead: 3, totalTimeMs: 1000 },
          { id: 'd2', date: '2026-06-02', articlesRead: 6, totalTimeMs: 2000 },
        ],
      });

    const onClose = vi.fn();
    const { container } = render(<StatsPage onClose={onClose} />);

    expect(screen.getByText('Articles Read')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('33 min')).toBeInTheDocument();
    expect(screen.getByText('Last 14 Days')).toBeInTheDocument();
    expect(container.querySelector('[title="2026-06-02: 6 articles"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the empty state when no daily data is available', () => {
    useQueryMock
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({ data: [] });

    render(<StatsPage onClose={vi.fn()} />);

    expect(screen.getByText('No reading data yet. Start reading articles to see your stats.')).toBeInTheDocument();
  });

  it('uses the 14-day query function for the daily stats request', async () => {
    useQueryMock
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({ data: [] });

    render(<StatsPage onClose={vi.fn()} />);

    const secondCall = useQueryMock.mock.calls[1][0] as { queryFn: () => Promise<unknown> };
    await secondCall.queryFn();
    expect(statsApi.daily).toHaveBeenCalledWith(14);
  });

  it('falls back safely when the daily stats query has not returned yet', () => {
    useQueryMock
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({ data: undefined });

    render(<StatsPage onClose={vi.fn()} />);

    expect(screen.getByText('No reading data yet. Start reading articles to see your stats.')).toBeInTheDocument();
  });

  it('renders minimum-height bars and omits the weekly subtitle when summary is unavailable', () => {
    useQueryMock
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({
        data: [
          { id: 'd0', date: '2026-06-03', articlesRead: 0, totalTimeMs: 0 },
        ],
      });

    const { container } = render(<StatsPage onClose={vi.fn()} />);

    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
    expect(container.querySelector('[title="2026-06-03: 0 articles"]')).toHaveAttribute('style', 'height: 4%;');
  });
});
