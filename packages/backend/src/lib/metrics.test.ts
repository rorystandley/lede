import { describe, expect, it } from 'vitest';
import {
  activeUsers,
  aiCalls,
  aiTokensUsed,
  articlesIngested,
  digestsBuilt,
  feedsRefreshed,
  httpRequestDuration,
  httpRequestsTotal,
  queueJobDuration,
  queueJobsProcessed,
  registry,
} from './metrics.js';

describe('metrics', () => {
  it('registers the expected metric collectors', async () => {
    expect((httpRequestsTotal as unknown as { name: string }).name).toBe('newsreader_http_requests_total');
    expect((httpRequestDuration as unknown as { name: string }).name).toBe('newsreader_http_request_duration_seconds');
    expect((queueJobsProcessed as unknown as { name: string }).name).toBe('newsreader_queue_jobs_processed_total');
    expect((queueJobDuration as unknown as { name: string }).name).toBe('newsreader_queue_job_duration_seconds');
    expect((feedsRefreshed as unknown as { name: string }).name).toBe('newsreader_feeds_refreshed_total');
    expect((articlesIngested as unknown as { name: string }).name).toBe('newsreader_articles_ingested_total');
    expect((digestsBuilt as unknown as { name: string }).name).toBe('newsreader_digests_built_total');
    expect((aiCalls as unknown as { name: string }).name).toBe('newsreader_ai_calls_total');
    expect((aiTokensUsed as unknown as { name: string }).name).toBe('newsreader_ai_tokens_used_total');
    expect((activeUsers as unknown as { name: string }).name).toBe('newsreader_active_users');

    const metrics = await registry.metrics();
    expect(metrics).toContain('newsreader_http_requests_total');
    expect(metrics).toContain('newsreader_active_users');
  });
});
