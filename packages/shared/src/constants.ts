export const FEED_TYPES = ['rss', 'atom', 'json', 'newsletter', 'web_monitor'] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export const ARTICLE_TAG_SOURCES = ['manual', 'rule', 'ai'] as const;
export type ArticleTagSource = (typeof ARTICLE_TAG_SOURCES)[number];

export const RULE_MATCH_MODES = ['all', 'any'] as const;
export type RuleMatchMode = (typeof RULE_MATCH_MODES)[number];

export const DIGEST_STATUSES = ['pending', 'building', 'ready', 'delivered', 'failed'] as const;
export type DigestStatus = (typeof DIGEST_STATUSES)[number];

export const ANNOTATION_TYPES = ['highlight', 'note'] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const AI_PROVIDERS = ['openai', 'anthropic'] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const REGISTRATION_MODES = ['open', 'invite'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const VIEW_MODES = ['list', 'card', 'magazine'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const API_KEY_PREFIX = 'nrk_';

export const DEFAULT_REFRESH_INTERVAL = 60;
export const DEFAULT_DIGEST_SCHEDULE = '07:00';
