# Costs

What it actually costs to run lede, broken down by component. All prices in USD as of 2026.

## TL;DR

For a single user with 50 feeds and AI summaries on the daily digest:

- **Self-hosted on a small VPS:** ~$5/mo
- **AI usage (Claude Sonnet 4):** ~$0.50/mo for digest briefings, summarising ~30 articles/day on demand
- **AI usage (GPT-4o-mini):** ~$0.10/mo for the same workload
- **Total:** **$5–6/mo vs. Inoreader Pro at $9.99/mo**

For 100 active users sharing one instance, you're looking at ~$20–30/mo for hosting plus whatever each user spends on their own AI key (BYOAI means you don't pay for theirs).

## Infrastructure Costs

### Single-user / Personal

| Provider | Spec | Cost/mo |
|---------|------|---------|
| Hetzner CX11 | 1 vCPU, 2 GB RAM, 20 GB SSD | €4.51 (~$5) |
| DigitalOcean Basic | 1 vCPU, 1 GB RAM, 25 GB SSD | $6 |
| Linode Nanode | 1 vCPU, 1 GB RAM, 25 GB SSD | $5 |
| Fly.io shared | 1 vCPU, 512 MB RAM | ~$5–8 (varies by usage) |
| Domain name | (optional) | $10–15/yr |

A single 1 GB VPS comfortably handles one user with 50–200 feeds and tens of thousands of articles. Postgres + Redis + app all fit in 1 GB.

### Small team / Family (5–20 users)

| Provider | Spec | Cost/mo |
|---------|------|---------|
| Hetzner CX21 | 2 vCPU, 4 GB RAM | €5.83 (~$6.30) |
| DigitalOcean Basic 2GB | 1 vCPU, 2 GB RAM | $12 |

Add managed Postgres if you don't want to back up yourself: +$15/mo. Otherwise, the same single VPS scales fine.

### Medium / Hundreds of users

| Component | Spec | Cost/mo |
|----------|------|---------|
| App server | 2 vCPU, 4 GB | $20–25 |
| Managed Postgres | 2 vCPU, 4 GB, with backups | $50–60 |
| Managed Redis | 1 GB | $10–15 |
| **Total** | | **~$80–100** |

At this scale you'd also want to split the BullMQ workers into a separate process for isolation.

## AI Costs (BYOAI)

The user provides their own API key, so costs are theirs to pay. Here's what to expect.

### Pricing per 1M tokens (2026)

| Model | Input | Output |
|-------|-------|--------|
| Claude Sonnet 4 | $3 | $15 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude Haiku (if added) | $1 | $5 |

### Per-operation costs

**Article summary** (~3,000 input tokens, ~150 output)

| Model | Cost per summary | 30/day = month |
|-------|------------------|-----------------|
| Claude Sonnet 4 | $0.012 | $10.80 |
| GPT-4o-mini | $0.0005 | $0.45 |

**Tag suggestions** (~2,000 input tokens, ~50 output)

| Model | Cost per call |
|-------|---------------|
| Claude Sonnet 4 | $0.007 |
| GPT-4o-mini | $0.0003 |

**Digest briefing** (~5,000 input tokens, ~400 output, daily)

| Model | Cost per day | Month |
|-------|--------------|-------|
| Claude Sonnet 4 | $0.021 | $0.63 |
| GPT-4o-mini | $0.001 | $0.03 |

### Realistic monthly spend per user

| Profile | Anthropic | OpenAI |
|--------|-----------|---------|
| Light: digest briefing only | $0.65 | $0.05 |
| Moderate: digest + 10 summaries/day | $4.25 | $0.20 |
| Heavy: digest + 50 summaries/day + tag suggestions | $19 | $1 |

The app tracks usage and shows it in Settings → AI Usage. Each user can see exactly what their key has been charged.

## Cost-saving tips

- **Use GPT-4o-mini by default** — 20x cheaper than Sonnet, and good enough for summaries and tags. Save Claude for intelligence reports if you add them later.
- **Cache summaries** — summaries are stored per user once generated. Re-opening an article doesn't re-call the API.
- **Disable summaries in digests** — the digest still works without AI. You get article titles and feed summaries.
- **Run on a single VPS** — managed Postgres adds $50/mo for features you don't need at small scale. A daily `pg_dump` to S3 ($0.50/mo) is sufficient.

## Comparison to alternatives

| Service | Cost/mo | Notes |
|---------|---------|-------|
| **lede (self-hosted)** | $5 + your AI key | Full control, your data, BYOAI |
| Inoreader Pro | $9.99 | 1000 sources, no AI summaries on cheaper tiers |
| Feedly Pro+ | $12 | AI features bundled but limited |
| Feedbin | $5 | Simpler feature set, no AI |
| NewsBlur Premium | $36/yr | Open source, similar features, fewer integrations |

lede is roughly the cost of Feedbin with the feature set of Inoreader Pro, plus you get AI features metered to your actual usage.
