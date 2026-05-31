import { Sidebar } from '../components/layout/Sidebar.js';
import { ArticleList } from '../components/articles/ArticleList.js';
import { ArticleReader } from '../components/articles/ArticleReader.js';
import { useUiStore } from '../stores/index.js';

export function FeedPage() {
  const { selectedArticleId } = useUiStore();

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedArticleId ? 'hidden lg:flex lg:w-96' : 'flex flex-1'} flex-col border-r border-border`}>
          <ArticleList />
        </div>
        {selectedArticleId && <ArticleReader />}
      </div>
    </div>
  );
}
