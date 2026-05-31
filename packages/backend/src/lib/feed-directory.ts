export interface DirectoryFeed {
  name: string;
  url: string;
  siteUrl: string;
  description: string;
  category: string;
  icon?: string;
}

export const FEED_DIRECTORY: DirectoryFeed[] = [
  // --- Tech ---
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', siteUrl: 'https://news.ycombinator.com', description: 'Social news for programmers and startup founders', category: 'Tech' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', siteUrl: 'https://techcrunch.com', description: 'Startup and technology news', category: 'Tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', siteUrl: 'https://www.theverge.com', description: 'Technology, science, art, and culture', category: 'Tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', siteUrl: 'https://arstechnica.com', description: 'Technology news and analysis', category: 'Tech' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', siteUrl: 'https://www.wired.com', description: 'Technology, science, culture, and business', category: 'Tech' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', siteUrl: 'https://www.technologyreview.com', description: 'Emerging technology coverage from MIT', category: 'Tech' },
  { name: 'Lobsters', url: 'https://lobste.rs/rss', siteUrl: 'https://lobste.rs', description: 'Computing-focused link aggregation', category: 'Tech' },

  // --- Dev / Engineering ---
  { name: 'DEV Community', url: 'https://dev.to/feed', siteUrl: 'https://dev.to', description: 'Developer community articles and discussions', category: 'Dev' },
  { name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', siteUrl: 'https://css-tricks.com', description: 'Tips, tricks, and techniques on CSS', category: 'Dev' },
  { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', siteUrl: 'https://www.smashingmagazine.com', description: 'Web design and development', category: 'Dev' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', siteUrl: 'https://github.blog', description: 'Updates from GitHub', category: 'Dev' },
  { name: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', siteUrl: 'https://martinfowler.com', description: 'Software architecture and design', category: 'Dev' },

  // --- AI ---
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/feed.xml', siteUrl: 'https://www.anthropic.com', description: 'Research and updates from Anthropic', category: 'AI' },
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', siteUrl: 'https://openai.com/blog', description: 'Research and product updates from OpenAI', category: 'AI' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', siteUrl: 'https://huggingface.co/blog', description: 'Machine learning and NLP community', category: 'AI' },
  { name: 'The Gradient', url: 'https://thegradient.pub/rss/', siteUrl: 'https://thegradient.pub', description: 'Perspectives on AI research', category: 'AI' },

  // --- World News ---
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', siteUrl: 'https://www.bbc.co.uk/news', description: 'Top stories from BBC News', category: 'News' },
  { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', siteUrl: 'https://www.reuters.com', description: 'Global news from Reuters', category: 'News' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', siteUrl: 'https://www.theguardian.com', description: 'World news from The Guardian', category: 'News' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', siteUrl: 'https://www.npr.org', description: 'Top stories from NPR', category: 'News' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', siteUrl: 'https://www.aljazeera.com', description: 'International news coverage', category: 'News' },

  // --- Science ---
  { name: 'Nature', url: 'https://www.nature.com/nature.rss', siteUrl: 'https://www.nature.com', description: 'International weekly journal of science', category: 'Science' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', siteUrl: 'https://www.newscientist.com', description: 'Science and technology news', category: 'Science' },
  { name: 'Quanta Magazine', url: 'https://api.quantamagazine.org/feed/', siteUrl: 'https://www.quantamagazine.org', description: 'Mathematics, physics, biology, and computer science', category: 'Science' },
  { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', siteUrl: 'https://www.nasa.gov', description: 'Space and aeronautics news', category: 'Science' },

  // --- Business & Finance ---
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', siteUrl: 'https://www.bloomberg.com', description: 'Financial and business news', category: 'Business' },
  { name: 'Financial Times', url: 'https://www.ft.com/?format=rss', siteUrl: 'https://www.ft.com', description: 'Global business and finance', category: 'Business' },
  { name: 'Harvard Business Review', url: 'https://hbr.org/rss', siteUrl: 'https://hbr.org', description: 'Management and business insights', category: 'Business' },

  // --- Design ---
  { name: 'Sidebar', url: 'https://sidebar.io/feed.xml', siteUrl: 'https://sidebar.io', description: '5 design links daily', category: 'Design' },
  { name: 'A List Apart', url: 'https://alistapart.com/main/feed/', siteUrl: 'https://alistapart.com', description: 'Web design, development, and content', category: 'Design' },

  // --- Productivity / Lifestyle ---
  { name: 'Lifehacker', url: 'https://lifehacker.com/rss', siteUrl: 'https://lifehacker.com', description: 'Tips and downloads for getting things done', category: 'Productivity' },
  { name: 'Brain Pickings', url: 'https://feeds.feedburner.com/brainpickings/rss', siteUrl: 'https://www.themarginalian.org', description: 'Art, science, philosophy, and more', category: 'Productivity' },

  // --- Security ---
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', siteUrl: 'https://krebsonsecurity.com', description: 'In-depth security news and investigation', category: 'Security' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', siteUrl: 'https://thehackernews.com', description: 'Cybersecurity news and analysis', category: 'Security' },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/', siteUrl: 'https://www.schneier.com', description: 'Security, technology, and society', category: 'Security' },
];

export const FEED_CATEGORIES = [...new Set(FEED_DIRECTORY.map((f) => f.category))];
