import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  ArrowRight,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store';
import { Plugin } from '@/types/plugin';
import { useEpubExport } from '@/hooks/useEpubExport';

type ParseNovelSectionProps = {
  onNavigateToParseChapter?: () => void;
};

export default function ParseNovelSection({
  onNavigateToParseChapter,
}: ParseNovelSectionProps) {
  const plugin = useAppStore(state => state.plugin);
  const parseNovelPath = useAppStore(state => state.parseNovelPath);
  const shouldAutoSubmitNovel = useAppStore(
    state => state.shouldAutoSubmitNovel,
  );
  const clearParseNovelPath = useAppStore(state => state.clearParseNovelPath);
  const setParseChapterPath = useAppStore(state => state.setParseChapterPath);
  const [novelPath, setNovelPath] = useState('');
  const [sourceNovel, setSourceNovel] = useState<
    (Plugin.SourceNovel & { totalPages?: number }) | undefined
  >();
  const [chapters, setChapters] = useState<Plugin.ChapterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [fetchError, setFetchError] = useState('');

  const { exportEpub, isExporting } = useEpubExport({
    plugin: plugin || null,
    sourceNovel,
    chapters,
    novelPath,
  });

  const fetchNovelByPath = async (path: string) => {
    if (plugin && path.trim()) {
      setLoading(true);
      setFetchError('');
      try {
        const result = await plugin.parseNovel(path);
        setSourceNovel(result);
        setChapters(result.chapters || []);
        setCurrentPage(1);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch novel';
        setFetchError(errorMessage);
        console.error('Error parsing novel:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchNovel = async () => {
    await fetchNovelByPath(novelPath);
  };

  const fetchPage = async (page: number) => {
    if (plugin && novelPath && sourceNovel?.totalPages) {
      setLoading(true);
      setFetchError('');
      try {
        const result = await (plugin as Plugin.PagePlugin).parsePage(
          novelPath,
          page.toString(),
        );
        setChapters(result.chapters);
        setCurrentPage(page);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch page';
        setFetchError(errorMessage);
        console.error('Error fetching page:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && novelPath.trim()) {
      fetchNovel();
    }
  };

  const copyToClipboard = (text?: string, label?: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      toast.success(`${label || 'Text'} copied to clipboard!`);
    }
  };

  const handleParseChapter = (path: string) => {
    setParseChapterPath(path, true);
    onNavigateToParseChapter?.();
  };

  useEffect(() => {
    if (parseNovelPath) {
      setNovelPath(parseNovelPath);

      if (shouldAutoSubmitNovel && plugin) {
        fetchNovelByPath(parseNovelPath);
      }

      clearParseNovelPath();
    }
  }, [parseNovelPath, shouldAutoSubmitNovel, plugin, clearParseNovelPath]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Parse Novel
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin
                ? 'Enter a novel path to fetch details'
                : 'Select a plugin to parse novels'}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <Input
            placeholder="Enter novel path..."
            value={novelPath}
            onChange={e => setNovelPath(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={!plugin}
          />
          <Button
            onClick={fetchNovel}
            disabled={!plugin || !novelPath.trim() || loading}
          >
            {loading ? 'Fetching...' : 'Fetch'}
          </Button>
        </div>

        {fetchError && (
          <div className="p-4 mb-6 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive">{fetchError}</p>
          </div>
        )}

        {loading && !sourceNovel ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="w-32 h-48 rounded-lg" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-32 w-full" />
              </div>
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : !sourceNovel ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {plugin ? 'Ready to parse' : 'No plugin selected'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {plugin
                ? 'Enter a novel path in the field above and click "Fetch" to load detailed information, including chapters, metadata, and more.'
                : 'Please select a plugin from the sidebar to get started.'}
            </p>
          </div>
        ) : sourceNovel ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Novel Info */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex gap-4">
                  <div
                    className="cursor-pointer"
                    onClick={() =>
                      copyToClipboard(sourceNovel.cover, 'Cover URL')
                    }
                  >
                    <img
                      src={
                        (sourceNovel.cover ? '/' : '') + sourceNovel.cover ||
                        '/static/coverNotAvailable.webp'
                      }
                      alt={sourceNovel.name}
                      className="w-32 h-48 rounded-lg object-cover hover:opacity-80 transition-opacity"
                      title="Click to copy cover URL"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-foreground mb-3 line-clamp-3">
                      {sourceNovel.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {sourceNovel.status && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            Status
                          </p>
                          <Badge className="text-xs">
                            {sourceNovel.status}
                          </Badge>
                        </div>
                      )}
                      {sourceNovel.author && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            Author
                          </p>
                          <p className="text-sm text-foreground line-clamp-1">
                            {sourceNovel.author}
                          </p>
                        </div>
                      )}
                      {sourceNovel.artist && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            Artist
                          </p>
                          <p className="text-sm text-foreground line-clamp-1">
                            {sourceNovel.artist}
                          </p>
                        </div>
                      )}
                      {sourceNovel.rating && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            Rating
                          </p>
                          <p className="text-sm text-foreground">
                            {sourceNovel.rating.toFixed(1)} / 5.0
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 bg-transparent"
                            onClick={() =>
                              copyToClipboard(sourceNovel.path, 'Novel path')
                            }
                          >
                            <Copy className="w-4 h-4" />
                            Copy Path
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copy novel path to clipboard</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 bg-transparent"
                            onClick={exportEpub}
                            disabled={isExporting || chapters.length === 0}
                          >
                            <Download className="w-4 h-4" />
                            {isExporting ? 'Exporting...' : 'Export EPUB'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {isExporting
                              ? 'Exporting chapters to EPUB...'
                              : 'Export all chapters as EPUB file'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                {sourceNovel.genres && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">
                      Genres
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {sourceNovel.genres.split(/,\s*/).map((genre, index) => (
                        <Badge key={`genre-${index}`} variant="secondary">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {sourceNovel.summary && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">
                      Summary
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {sourceNovel.summary}
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar Info */}
              <div className="bg-muted/50 rounded-lg p-4 h-fit">
                <h4 className="font-semibold text-foreground mb-4">Metadata</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Total Chapters
                    </p>
                    <p className="font-semibold text-foreground">
                      {chapters.length}
                    </p>
                  </div>
                  {sourceNovel.totalPages && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Total Pages
                      </p>
                      <p className="font-semibold text-foreground">
                        {sourceNovel.totalPages}
                      </p>
                    </div>
                  )}
                  {chapters.length > 0 && chapters[0].releaseTime && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        First Chapter
                      </p>
                      <p className="font-semibold text-foreground">
                        {formatDate(chapters[0].releaseTime)}
                      </p>
                    </div>
                  )}
                  {chapters.length > 0 &&
                    chapters[chapters.length - 1].releaseTime && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                          Last Updated
                        </p>
                        <p className="font-semibold text-foreground">
                          {formatDate(
                            chapters[chapters.length - 1].releaseTime,
                          )}
                        </p>
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Chapters Table */}
            {(chapters.length > 0 || sourceNovel.totalPages) && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-foreground">
                    Chapters ({chapters.length})
                  </h4>
                  {sourceNovel.totalPages && sourceNovel.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchPage(currentPage - 1)}
                        disabled={currentPage === 1 || loading}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {sourceNovel.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchPage(currentPage + 1)}
                        disabled={
                          currentPage === sourceNovel.totalPages || loading
                        }
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  {sourceNovel.totalPages && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchPage(currentPage)}
                      disabled={!currentPage || loading}
                    >
                      {loading ? 'Fetching...' : 'Chapter Fetch'}
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold text-foreground w-16">
                          #
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground">
                          Name
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground w-28">
                          Actions
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-foreground w-32">
                          Release Time
                        </th>
                        {chapters.some(ch => ch.chapterNumber) && (
                          <th className="text-left py-3 px-4 font-semibold text-foreground w-24">
                            Chapter #
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {chapters.map((chapter, index) => (
                        <tr
                          key={`${chapter.path}-${index}`}
                          className={`border-b border-border hover:bg-muted/70 transition-colors ${
                            index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                          }`}
                        >
                          <td className="py-2.5 px-4 text-muted-foreground text-xs">
                            {index}
                          </td>
                          <td className="py-2.5 px-4 text-foreground">
                            {chapter.name}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() =>
                                      copyToClipboard(
                                        chapter.path,
                                        'Chapter path',
                                      )
                                    }
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Copy chapter path</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() =>
                                      handleParseChapter(chapter.path)
                                    }
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Open in Parse Chapter tab</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground text-xs">
                            {formatDate(chapter.releaseTime)}
                          </td>
                          {chapters.some(ch => ch.chapterNumber) && (
                            <td className="py-2.5 px-4 text-muted-foreground text-xs">
                              {chapter.chapterNumber || '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
