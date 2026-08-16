import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { CheerioAPI, load as parseHTML } from 'cheerio';

class PeachPuffTranslations implements Plugin.PluginBase {
  id = 'peachpuff';
  name = 'Peach Puff Translations';
  site = 'https://peachpuff.in/';
  version = '1.0.0';
  icon = 'src/english/peachpuff/icon.png';

  coversCache?: Map<string, string>;

  cleanCover(src?: string): string | undefined {
    if (!src) return undefined;
    return src
      .replace('i0.wp.com/', '')
      .replace(/^http:/, 'https:')
      .split('?')[0];
  }

  novelPath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    return href.replace(this.site, '').replace(/\/+$/, '');
  }

  async getNovelCovers(): Promise<Map<string, string>> {
    if (this.coversCache) return this.coversCache;
    const covers = new Map<string, string>();
    try {
      const [pages, media] = await Promise.all([
        fetchApi(
          `${this.site}wp-json/wp/v2/pages?per_page=100&_fields=id,link`,
        ).then(res => res.json()),
        fetchApi(
          `${this.site}wp-json/wp/v2/media?per_page=100&_fields=id,post,source_url`,
        ).then(res => res.json()),
      ]);
      const pageLinks = new Map(
        (pages as { id: number; link: string }[]).map(page => [
          page.id,
          page.link,
        ]),
      );
      const mediaItems = media as {
        id: number;
        post?: number;
        source_url: string;
      }[];
      mediaItems.sort((a, b) => a.id - b.id);
      for (const item of mediaItems) {
        const path = item.post
          ? this.novelPath(pageLinks.get(item.post))
          : undefined;
        if (path && !covers.has(path)) covers.set(path, item.source_url);
      }
    } catch {
      this.coversCache = covers;
      return covers;
    }
    this.coversCache = covers;
    return covers;
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('ul.wp-block-list li a[title]').each((_, element) => {
      const path = this.novelPath(loadedCheerio(element).attr('href'));
      if (!path) return;
      const name =
        loadedCheerio(element).attr('title') ||
        loadedCheerio(element).text().trim();
      novels.push({ name, path });
    });
    return novels;
  }

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site).then(res => res.text());
    const novels = this.parseNovels(parseHTML(body));
    const covers = await this.getNovelCovers();
    for (const novel of novels) novel.cover = covers.get(novel.path);
    return novels;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.toLowerCase();
    return (await this.popularNovels()).filter(novel =>
      novel.name.toLowerCase().includes(query),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div.entry-title h2').first().text().trim(),
    };

    novel.cover = this.cleanCover(
      loadedCheerio('figure.wp-block-image img').first().attr('src'),
    );

    loadedCheerio('p.wp-block-paragraph strong').each((_, element) => {
      const key = loadedCheerio(element).text().trim().toLowerCase();
      if (key === 'author:') {
        novel.author = loadedCheerio(element).nextUntil('strong').text().trim();
      }
    });

    const descriptionLabel = loadedCheerio(
      'p.wp-block-paragraph strong:contains("Description:")',
    ).first();
    if (descriptionLabel.length) {
      const summary = descriptionLabel
        .parent()
        .nextUntil('h4.wp-block-heading')
        .map((_, element) => {
          const paragraph = loadedCheerio(element);
          paragraph.find('br').replaceWith('\n');
          return paragraph.text().trim();
        })
        .get()
        .filter(Boolean)
        .join('\n\n');
      if (summary) novel.summary = summary;
    }

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('.lcp_catlist li a').each((_, element) => {
      const path = this.novelPath(loadedCheerio(element).attr('href'));
      if (!path) return;
      chapters.push({
        name: loadedCheerio(element).text().trim(),
        path,
      });
    });
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);
    loadedCheerio('.category-post-dropdown-container').remove();
    loadedCheerio('script, style').remove();

    return loadedCheerio('.entry-content').html() ?? '';
  }
}

export default new PeachPuffTranslations();
