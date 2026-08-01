import { Sidebar } from '../components/layout/Sidebar.js';
import { ArticleList } from '../components/articles/ArticleList.js';
import { ArticleReader } from '../components/articles/ArticleReader.js';
import { useUiStore } from '../stores/index.js';
import { useUnreadTitle } from '../hooks/use-document-title.js';

interface Props {
  onOpenAddSources?: () => void;
}

export function FeedPage({ onOpenAddSources }: Props) {
  const { selectedArticleId } = useUiStore();
  useUnreadTitle();

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <Sidebar onOpenAddSources={onOpenAddSources} />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className={`${selectedArticleId ? 'hidden' : 'flex flex-1'} min-w-0 flex-col border-r border-border`}>
          <ArticleList />
        </div>
        {selectedArticleId && <ArticleReader />}
      </div>
    </div>
  );
}
