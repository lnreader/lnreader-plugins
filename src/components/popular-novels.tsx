import React, { useState, useEffect } from 'react';
import { Filter, BookOpen } from 'lucide-react';

import { FiltersSheet } from '@/components/filters/filters-sheet';
import { NovelCard } from '@/components/novel-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store';
import { FilterToValues, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';

type PopularNovelsSectionProps = {
  onNavigateToParseNovel?: () => void;
};

export default function PopularNovelsSection({
  onNavigateToParseNovel,
}: PopularNovelsSectionProps) {
  const plugin = useAppStore(state => state.plugin);
  const setParseNovelPath = useAppStore(state => state.setParseNovelPath);
  const [novels, setNovels] = useState<Plugin.NovelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [isLatest, setIsLatest] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<
    FilterToValues<Filters> | undefined
  >();

  const fetchNovelsByIndex = async (index: number) => {
    if (plugin && index) {
      setLoading(true);
      try {
        const fetchedNovels = await plugin.popularNovels(index, {
          filters: filterValues || {},
          showLatestNovels: isLatest,
        });
        if (fetchedNovels.length !== 0) {
          setCurrentIndex(index);
          if (index > maxIndex) {
            setMaxIndex(index);
          }
          setNovels(fetchedNovels);
        }
      } catch (error) {
        console.error('Error fetching novels:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (plugin) {
      setCurrentIndex(1);
      setMaxIndex(1);
      fetchNovelsByIndex(1);
    }
  }, [isLatest]);

  useEffect(() => {
    // Reset when changing plugins
    setCurrentIndex(0);
    setMaxIndex(0);
    setNovels([]);

    if (plugin?.filters) {
      const filters: FilterToValues<typeof plugin.filters> = {};
      for (const fKey in plugin.filters) {
        filters[fKey as keyof typeof filters] = {
          type: plugin.filters[fKey].type,
          value: plugin.filters[fKey].value,
        };
      }
      setFilterValues(filters);
    }
  }, [plugin]);

  const handleParseNovel = (path: string) => {
    setParseNovelPath(path, true);
    onNavigateToParseNovel?.();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Popular Novels
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin
                ? `Browse ${isLatest ? 'latest' : 'popular'} novels`
                : 'Select a plugin to browse novels'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              disabled={!plugin || isLatest || !plugin.filters}
              onClick={() => setFiltersOpen(true)}
            >
              <Filter className="w-4 h-4" />
              Filters
            </Button>
            <Button
              size="sm"
              disabled={!plugin || loading}
              onClick={() => fetchNovelsByIndex(1)}
            >
              {loading ? 'Loading...' : 'Fetch'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0 || loading}
              onClick={() => fetchNovelsByIndex(currentIndex + 1)}
            >
              Next Page
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {['Latest', 'Popular'].map(option => (
            <Badge
              key={option}
              variant={
                isLatest === (option === 'Latest') ? 'default' : 'outline'
              }
              className="cursor-pointer"
              onClick={() => setIsLatest(option === 'Latest')}
            >
              {option}
            </Badge>
          ))}
          {currentIndex > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Page</span>
              <Input
                type="number"
                min="1"
                max={maxIndex}
                value={currentIndex}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const page = parseInt(e.target.value);
                  if (page > 0 && page <= maxIndex) {
                    fetchNovelsByIndex(page);
                  }
                }}
                className="w-16 h-7 text-center text-xs"
                disabled={loading}
              />
              <span className="text-xs text-muted-foreground">
                of {maxIndex}+
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 lg:gap-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="w-full aspect-[3/4] rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              </div>
            ))}
          </div>
        ) : novels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {plugin ? 'No novels to display' : 'No plugin selected'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {plugin
                ? 'Click the "Fetch" button above to load the latest or popular novels from this source.'
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

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        values={filterValues}
        filters={plugin?.filters}
        setValues={setFilterValues}
        refetch={() => fetchNovelsByIndex(1)}
      />
    </div>
  );
}
