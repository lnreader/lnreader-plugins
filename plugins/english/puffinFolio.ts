import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class PuffinFolioPlugin implements Plugin.PluginBase {
  id = 'puffinfolio';
  name = 'Puffin Folio';
  icon = 'src/en/puffinfolio/icon.png';
  site = 'https://www.puffinfolio.com/';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  private async loadPage(path: string) {
    const response = await fetchApi(this.site + path.replace(/^\//, ''));
    return loadCheerio(await response.text());
  }

  // Covers are served through next/image, so the real file sits in a url= param.
  private resolveCover(raw?: string): string {
    if (!raw) return defaultCover;
    const candidate = raw.trim().split(/\s+/)[0];
    const embedded = candidate.match(/url=([^&]+)/);
    const file = embedded ? decodeURIComponent(embedded[1]) : candidate;
    if (/^https?:\/\//.test(file)) return file;
    return (
      this.site.replace(/\/$/, '') + (file.startsWith('/') ? file : '/' + file)
    );
  }

  private async novelList(): Promise<Plugin.NovelItem[]> {
    const $ = await this.loadPage('browse');
    const novels: Plugin.NovelItem[] = [];

    $('a[href^="/novel/"]').each((_, element) => {
      const link = $(element);
      const href = link.attr('href');
      if (!href || href.includes('/chapter/')) return;

      const image = link.find('img').first();
      const name =
        link.find('h3').first().text().trim() || image.attr('alt')?.trim();
      if (!name) return;

      const path = href.replace(/^\//, '');
      if (novels.some(novel => novel.path === path)) return;

      novels.push({
        name,
        path,
        cover: this.resolveCover(image.attr('src') || image.attr('srcset')),
      });
    });

    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // The catalogue is small enough to sit on a single browse page.
    if (pageNo > 1) return [];
    return this.novelList();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.loadPage(novelPath);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
    };

    const cover = $('img[src*="covers"], img[srcset*="covers"]').first();
    novel.cover = this.resolveCover(cover.attr('src') || cover.attr('srcset'));

    novel.summary = $('meta[name="description"]').attr('content')?.trim();

    novel.genres = $('a[href^="/browse?tag="]')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .join(',');

    const statusText = $('span')
      .map((_, element) => $(element).text().trim())
      .get()
      .find(text => text === 'Ongoing' || text === 'Completed');
    novel.status =
      statusText === 'Completed'
        ? NovelStatus.Completed
        : statusText === 'Ongoing'
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown;

    const chapters: Plugin.ChapterItem[] = [];
    $('li a[href*="/chapter/"]').each((_, element) => {
      const link = $(element);
      const href = link.attr('href');
      if (!href) return;

      const path = href.replace(/^\//, '');
      if (chapters.some(chapter => chapter.path === path)) return;

      const time = link.find('time');
      // Strip the leading chapter-number badge so the name reads "Chapter 7".
      const label = link.find('span').first().clone();
      label.find('span').remove();

      chapters.push({
        name: label.text().trim() || href.split('/').pop() || '',
        path,
        releaseTime: time.attr('datetime') || time.attr('title') || null,
        chapterNumber: Number(href.match(/\/chapter\/(\d+)/)?.[1]) || undefined,
      });
    });

    novel.chapters = chapters.sort(
      (a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0),
    );
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.loadPage(chapterPath);
    return $('.reader-prose').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = searchTerm.toLowerCase();
    const novels = await this.novelList();
    return novels.filter(novel => novel.name.toLowerCase().includes(term));
  }

  resolveUrl = (path: string) => this.site + path.replace(/^\//, '');
}

export default new PuffinFolioPlugin();
