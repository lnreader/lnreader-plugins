import { useState } from 'react';
import { toast } from 'sonner';
import { Plugin } from '@/types/plugin';
import { createEpub, downloadBlob } from '@/lib/epub';

interface UseEpubExportOptions {
  plugin: Plugin.PluginBase | null;
  sourceNovel: (Plugin.SourceNovel & { totalPages?: number }) | undefined;
  chapters: Plugin.ChapterItem[];
  novelPath: string;
}

export function useEpubExport({
  plugin,
  sourceNovel,
  chapters,
  novelPath,
}: UseEpubExportOptions) {
  const [isExporting, setIsExporting] = useState(false);

  const exportEpub = async () => {
    if (!plugin || !sourceNovel || chapters.length === 0) {
      toast.error('No novel or chapters available to export');
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading('Starting EPUB export...', {
      description: `Preparing to export ${chapters.length} chapters`,
    });

    try {
      const allChapters: Plugin.ChapterItem[] = [];

      if (sourceNovel.totalPages && sourceNovel.totalPages > 1) {
        toast.loading('Fetching all chapters...', {
          id: toastId,
          description: `Found ${sourceNovel.totalPages} pages`,
        });

        for (let page = 1; page <= sourceNovel.totalPages; page++) {
          try {
            const pageResult = await (plugin as Plugin.PagePlugin).parsePage(
              novelPath,
              page.toString(),
            );
            allChapters.push(...pageResult.chapters);

            toast.loading('Fetching chapters...', {
              id: toastId,
              description: `Page ${page}/${sourceNovel.totalPages} - ${allChapters.length} chapters collected`,
            });
          } catch (error) {
            console.error(`Error fetching page ${page}:`, error);
          }
        }
      } else {
        allChapters.push(...chapters);
      }

      if (allChapters.length === 0) {
        toast.error('No chapters found to export', { id: toastId });
        setIsExporting(false);
        return;
      }

      toast.loading('Fetching chapter content...', {
        id: toastId,
        description: `0/${allChapters.length} chapters processed`,
      });

      const chapterContents: Array<{
        title: string;
        content: string;
        path: string;
      }> = [];

      for (let i = 0; i < allChapters.length; i++) {
        const chapter = allChapters[i];
        try {
          const content = await plugin.parseChapter(chapter.path);
          chapterContents.push({
            title: chapter.name,
            content: content || '<p>No content available</p>',
            path: chapter.path,
          });

          const progress = Math.round(((i + 1) / allChapters.length) * 100);
          toast.loading('Fetching chapter content...', {
            id: toastId,
            description: `${i + 1}/${allChapters.length} chapters processed (${progress}%)`,
          });
        } catch (error) {
          console.error(`Error fetching chapter ${i + 1}:`, error);
          chapterContents.push({
            title: chapter.name,
            content: `<p>Error: Failed to fetch chapter content</p>`,
            path: chapter.path,
          });
        }
      }

      toast.loading('Generating EPUB file...', {
        id: toastId,
        description: 'Creating EPUB structure',
      });

      let coverUrl = sourceNovel.cover;
      if (coverUrl && plugin.resolveUrl) {
        coverUrl = plugin.resolveUrl(coverUrl, true);
      } else if (
        coverUrl &&
        !coverUrl.startsWith('http://') &&
        !coverUrl.startsWith('https://')
      ) {
        coverUrl = coverUrl.startsWith('/') ? coverUrl : '/' + coverUrl;
      }

      const epubBlob = await createEpub(chapterContents, {
        title: sourceNovel.name,
        author: sourceNovel.author,
        description: sourceNovel.summary,
        cover: coverUrl,
        language: 'en',
      });

      const filename = `${sourceNovel.name.replace(/[^a-z0-9]/gi, '_')}.epub`;
      downloadBlob(epubBlob, filename);

      toast.success('EPUB exported successfully!', {
        id: toastId,
        description: `Downloaded ${allChapters.length} chapters as ${filename}`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to export EPUB';
      toast.error('Export failed', {
        id: toastId,
        description: errorMessage,
      });
      console.error('Error exporting EPUB:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportEpub,
    isExporting,
  };
}
