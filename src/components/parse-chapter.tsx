import React, { useState, useEffect } from 'react';
import { Copy, FileText } from 'lucide-react';
import { toast } from 'sonner';

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

export default function ParseChapterSection() {
  const plugin = useAppStore(state => state.plugin);
  const parseChapterPath = useAppStore(state => state.parseChapterPath);
  const shouldAutoSubmitChapter = useAppStore(
    state => state.shouldAutoSubmitChapter,
  );
  const clearParseChapterPath = useAppStore(
    state => state.clearParseChapterPath,
  );
  const [chapterPath, setChapterPath] = useState('');
  const [chapterText, setChapterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchChapterByPath = async (path: string) => {
    if (plugin && path.trim()) {
      setLoading(true);
      setFetchError('');
      try {
        const result = await plugin.parseChapter(path);
        setChapterText(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch chapter';
        setFetchError(errorMessage);
        console.error('Error parsing chapter:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchChapter = async () => {
    await fetchChapterByPath(chapterPath);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && chapterPath.trim()) {
      fetchChapter();
    }
  };

  const copyToClipboard = (text?: string, label?: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      toast.success(`${label || 'Text'} copied to clipboard!`);
    }
  };

  // Handle pre-filled path from navigation
  useEffect(() => {
    if (parseChapterPath) {
      setChapterPath(parseChapterPath);

      if (shouldAutoSubmitChapter && plugin) {
        fetchChapterByPath(parseChapterPath);
      }

      clearParseChapterPath();
    }
  }, [
    parseChapterPath,
    shouldAutoSubmitChapter,
    plugin,
    clearParseChapterPath,
  ]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Parse Chapter
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin
                ? 'Enter a chapter path to fetch content'
                : 'Select a plugin to parse chapters'}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <Input
            placeholder="Enter chapter path..."
            value={chapterPath}
            onChange={e => setChapterPath(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={!plugin}
          />
          <Button
            onClick={fetchChapter}
            disabled={!plugin || !chapterPath.trim() || loading}
          >
            {loading ? 'Fetching...' : 'Fetch'}
          </Button>
        </div>

        {fetchError && (
          <div className="p-4 mb-6 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive">{fetchError}</p>
          </div>
        )}

        {loading && !chapterText ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
            <div className="border border-border rounded-lg">
              <Skeleton className="h-10 w-full rounded-t-lg" />
              <div className="p-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
              </div>
            </div>
          </div>
        ) : !chapterText ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {plugin ? 'Ready to parse' : 'No plugin selected'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {plugin
                ? 'Enter a chapter path in the field above and click "Fetch" to load the chapter content.'
                : 'Please select a plugin from the sidebar to get started.'}
            </p>
          </div>
        ) : chapterText ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Chapter Content
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {chapterPath}
                </p>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() =>
                        copyToClipboard(chapterPath, 'Chapter path')
                      }
                    >
                      <Copy className="w-4 h-4" />
                      Copy Path
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy chapter path to clipboard</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() =>
                        copyToClipboard(chapterText, 'Chapter text')
                      }
                    >
                      <Copy className="w-4 h-4" />
                      Copy Text
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy chapter text to clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="border border-border rounded-lg">
              <div className="bg-muted/50 rounded-t-lg px-4 py-2 border-b border-border">
                <p className="text-xs text-muted-foreground font-medium">
                  CHAPTER CONTENT ({chapterText.length} characters)
                </p>
              </div>
              <div className="bg-background rounded-b-lg p-6 max-h-[600px] overflow-y-auto">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: chapterText,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Content loaded successfully
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setChapterText('');
                  setChapterPath('');
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
