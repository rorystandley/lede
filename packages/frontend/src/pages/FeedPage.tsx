import { Sidebar } from '../components/layout/Sidebar.js';
import { ArticleList } from '../components/articles/ArticleList.js';
import { ArticleReader } from '../components/articles/ArticleReader.js';
import { useUiStore } from '../stores/index.js';
import { useIsMobile } from '../hooks/use-media-query.js';

interface Props {
  onOpenAddSources?: () => void;
}

export function FeedPage({ onOpenAddSources }: Props) {
  const { selectedArticleId } = useUiStore();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onOpenAddSources={onOpenAddSources} />
        {selectedArticleId ? (
          <ArticleReader />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <ArticleList />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar onOpenAddSources={onOpenAddSources} />
      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedArticleId ? 'hidden' : 'flex flex-1'} flex-col border-r border-border`}>
          <ArticleList />
        </div>
        {selectedArticleId && <ArticleReader />}
      </div>
    </div>
  );
}
