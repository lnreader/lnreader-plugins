import React, { useState, useEffect } from 'react';
import { Search as SearchIcon } from 'lucide-react';

import { NovelCard } from '@/components/novel-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store';
import { Plugin } from '@/types/plugin';

type SearchNovelsSectionProps = {
  onNavigateToParseNovel?: () => void;
};

export default function SearchNovelsSection({
  onNavigateToParseNovel,
}: SearchNovelsSectionProps) {
  const plugin = useAppStore(state => state.plugin);
  const setParseNovelPath = useAppStore(state => state.setParseNovelPath);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [novels, setNovels] = useState<Plugin.NovelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchNovels = async (page: number) => {
    if (plugin && searchTerm.trim()) {
      setLoading(true);
      setFetchError('');
      try {
        const results = await plugin.searchNovels(searchTerm, page);
        setNovels(results);
        setCurrentPage(page);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch novels';
        setFetchError(errorMessage);
        console.error('Error searching novels:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setNovels([]);
    setSearchTerm('');
    setFetchError('');
  }, [plugin]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      fetchNovels(1);
    }
  };

  const handleParseNovel = (path: string) => {
    setParseNovelPath(path, true);
    onNavigateToParseNovel?.();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Search Novels
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin
                ? 'Search for novels by title or keywords'
                : 'Select a plugin to search novels'}
            </p>
          </div>
          {currentPage > 1 && (
            <Badge variant="secondary">Page {currentPage}</Badge>
          )}
        </div>

        <div className="flex gap-3 mb-6">
          <Input
            placeholder="Enter search term..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={!plugin}
          />
          <Button
            onClick={() => fetchNovels(1)}
            disabled={!plugin || !searchTerm.trim() || loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
          <Button
            variant="outline"
            onClick={() => fetchNovels(currentPage + 1)}
            disabled={!plugin || novels.length === 0 || loading}
          >
            Next Page
          </Button>
        </div>

        {fetchError && (
          <div className="p-4 mb-6 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive">{fetchError}</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 lg:gap-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="w-full aspect-[3/4] rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              </div>
            ))}
          </div>
        ) : novels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <SearchIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchTerm
                ? 'No results found'
                : plugin
                  ? 'Ready to search'
                  : 'No plugin selected'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {searchTerm
                ? 'Try adjusting your search term or check the spelling. Different sources may have different availability.'
                : plugin
                  ? 'Enter a search term in the field above and click "Search" to find novels.'
                  : 'Please select a plugin from the sidebar to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 lg:gap-4">
            {novels.map((novel, index) => (
              <NovelCard
                key={`${novel.path}-${index}`}
                novel={novel}
                onParse={handleParseNovel}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
