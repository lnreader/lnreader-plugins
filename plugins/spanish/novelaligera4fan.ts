import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, type FetchInit } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// Invisible characters the site injects into its watermark lines.
const INVISIBLE_CHARS = new RegExp('[\u200B-\u200D\u2060\uFEFF]', 'g');

const MAX_SEARCH_PAGES = 5;

class NovelaLigera4FanPlugin implements Plugin.PluginBase {
  id = 'novelaligera4fan';
  name = 'NovelaLigera4Fan';
  icon = 'src/es/novelaligera4fan/icon.png';
  site = 'https://novelaligera4fan.com';
  version = '1.0.0';

  filters = {
    order: {
      value: 'recent',
      label: 'Ordenar por',
      options: [
        { label: 'Recientes', value: 'recent' },
        { label: 'Populares', value: 'popular' },
        { label: 'A-Z', value: 'az' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  async getCheerio(url: string, init?: FetchInit): Promise<CheerioAPI> {
    const response = await fetchApi(url, init);
    if (!response.ok) {
      throw new Error(
        `No se pudo acceder al sitio (${response.status}). Intenta abrirlo en WebView.`,
      );
    }
    const body = await response.text();
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    if (title === 'Just a moment...' || title === 'Un instant...') {
      throw new Error('Verificación de Cloudflare, ábrelo en WebView.');
    }
    return parseHTML(body);
  }

  toPath(url: string): string {
    return url.replace(/^https?:\/\/[^/]+/, '');
  }

  parseNovelCards(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('.nl4fl-card').each((_, el) => {
      const card = loadedCheerio(el);
      const link = card.find('.nl4fl-card__t a');
      const href = link.attr('href');
      const name = link.text().trim();
      if (!href || !name) return;
      novels.push({
        name,
        path: this.toPath(href),
        cover: card.find('img').attr('src') || defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The site lists its whole novel catalogue on a single page.
    if (pageNo > 1) return [];

    let order = filters?.order?.value || 'recent';
    if (showLatestNovels) order = 'recent';

    const url =
      order === 'recent'
        ? `${this.site}/novelas/`
        : `${this.site}/novelas/?orden=${order}`;
    const loadedCheerio = await this.getCheerio(url);
    return this.parseNovelCards(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = this.site + novelPath;
    const [loadedCheerio, chaptersCheerio] = await Promise.all([
      this.getCheerio(novelUrl),
      this.getCheerio(`${novelUrl.replace(/\/+$/, '')}/ajax/chapters/`, {
        method: 'POST',
        referrer: novelUrl,
      }),
    ]);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.post-title h1').text().trim() || 'Untitled',
      cover:
        loadedCheerio('.summary_image img').attr('src') ||
        loadedCheerio('meta[property="og:image"]').attr('content') ||
        defaultCover,
    };

    const author = loadedCheerio('.author-content').text().trim();
    if (author) novel.author = author;

    const genres = loadedCheerio('.genres-content a')
      .map((_, el) => loadedCheerio(el).text().trim())
      .get()
      .join(', ');
    if (genres) novel.genres = genres;

    const status = loadedCheerio('.post-status .summary-content')
      .text()
      .trim()
      .toLowerCase();
    if (status.includes('ongoing')) novel.status = NovelStatus.Ongoing;
    else if (status.includes('completed')) novel.status = NovelStatus.Completed;
    else if (status.includes('canceled')) novel.status = NovelStatus.Cancelled;
    else if (status.includes('on hold')) novel.status = NovelStatus.OnHiatus;

    const summary = loadedCheerio('.summary__content');
    summary.find('.code-block, script, noscript, style').remove();
    novel.summary = summary
      .find('p')
      .map((_, el) => loadedCheerio(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');

    const chapters: Plugin.ChapterItem[] = [];
    chaptersCheerio('li.wp-manga-chapter').each((_, el) => {
      const link = chaptersCheerio(el).find('a').first();
      const href = link.attr('href');
      if (!href || href === '#') return;
      chapters.push({
        name: link.text().replace(/\s+/g, ' ').trim(),
        path: this.toPath(href),
      });
    });

    // The site lists the newest chapter first.
    chapters.reverse();
    chapters.forEach((chapter, index) => {
      chapter.chapterNumber = index + 1;
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const loadedCheerio = await this.getCheerio(this.site + chapterPath);
    const content = loadedCheerio('.reading-content .text-left').first();
    if (!content.length) {
      throw new Error(
        'No se encontró texto en este capítulo (puede ser un manhwa o requerir WebView).',
      );
    }

    content.find('.code-block, script, noscript, style, ins, iframe').remove();
    // Drop the watermark lines the site adds between paragraphs.
    content.find('p').each((_, el) => {
      const text = loadedCheerio(el).text().replace(INVISIBLE_CHARS, '');
      if (/novelaligera4fan\.com/i.test(text)) loadedCheerio(el).remove();
    });

    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search also returns its manhwa; only keep what the
    // novel catalogue lists, since manhwa chapters are images.
    if (pageNo > 1) return [];

    const catalogueCheerio = await this.getCheerio(`${this.site}/novelas/`);
    const catalogue = new Map<string, string>();
    for (const novel of this.parseNovelCards(catalogueCheerio)) {
      catalogue.set(novel.path, novel.cover || defaultCover);
    }

    const novels: Plugin.NovelItem[] = [];
    // Novels may be spread over several result pages next to manhwa.
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      // Network and Cloudflare errors propagate so the app can offer WebView;
      // a page past the last result redirects to the home page with no results.
      const searchCheerio = await this.getCheerio(
        `${this.site}/page/${page}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`,
      );
      const results = searchCheerio('.c-tabs-item__content');
      if (!results.length) break;

      results.each((_, el) => {
        const result = searchCheerio(el);
        const link = result.find('.post-title a');
        const href = link.attr('href');
        const name = link.text().trim();
        if (!href || !name) return;
        const path = this.toPath(href);
        if (!catalogue.has(path) || novels.some(n => n.path === path)) return;
        novels.push({
          name,
          path,
          cover: result.find('img').attr('src') || catalogue.get(path),
        });
      });
    }
    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new NovelaLigera4FanPlugin();
