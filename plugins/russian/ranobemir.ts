import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { load as parseHTML } from 'cheerio';

const headers = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

class RanobeMir implements Plugin.PluginBase {
  id = 'ranobemir';
  name = 'РанобэМир';
  icon = 'src/ru/ranobemir/icon.png';
  site = 'https://ranobemir.com';
  version = '1.0.1';

  imageRequestInit: Plugin.ImageRequestInit = { headers };

  private async request(url: string) {
    const response = await fetchApi(url, { headers });
    if (!response.ok) {
      throw Object.assign(new Error(`РанобэМир: HTTP ${response.status}.`), {
        status: response.status,
      });
    }
    return response.text();
  }

  private parseList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    const novels: Plugin.NovelItem[] = [];

    $('a[data-card-link-type="title"]').each((_, el) => {
      const link = $(el);
      const path = link.attr('href');
      if (!path) return;
      novels.push({
        name: link.text().trim(),
        path,
        cover:
          link
            .closest('section')
            .find('a[data-card-link-type="poster"] img')
            .attr('src') || defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels
      ? 'last_chapter_id'
      : filters?.sort?.value || 'views';
    const html = await this.request(
      `${this.site}/novel?sort=${sort}&page=${pageNo}`,
    );
    return this.parseList(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // `?toc` is the no-JS fallback of "Показать все главы" and lists every chapter.
    const html = await this.request(`${this.site}${novelPath}?toc`);
    const $ = parseHTML(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim() || 'Untitled',
      cover: $('meta[property="og:image"]').attr('content') || defaultCover,
    };

    const ldJson = $('script[type="application/ld+json"]').first().html();
    if (ldJson) {
      try {
        const book = JSON.parse(ldJson)['@graph']?.[0];
        if (book?.genre?.length) novel.genres = book.genre.join(', ');
      } catch {
        // genres are optional
      }
    }

    const summary = $('h2:contains("О романе")').next('div');
    summary.find('br').replaceWith('\n');
    summary.find('div').before('\n');
    novel.summary = summary
      .text()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n\n');

    const statusLabel = $('a[href^="/novel?status"]').first().text().trim();
    novel.status =
      {
        'Выпускается': NovelStatus.Ongoing,
        'Выпущено': NovelStatus.Completed,
        'Заброшено': NovelStatus.Cancelled,
      }[statusLabel] || NovelStatus.Unknown;

    const chapters: Plugin.ChapterItem[] = [];
    $('#chapters_list li.list-row').each((_, el) => {
      const row = $(el);
      const link = row.find('a[href]').first();
      const path = link.attr('href');
      const releaseTime = row.find('time').attr('datetime');
      // Rows without a date are "Прогноз" placeholders for unpublished chapters.
      if (!path || !releaseTime) return;
      const name = link.text().trim();
      chapters.push({
        name,
        path,
        releaseTime,
        chapterNumber: Number(name.match(/Глава\s+(\d+(?:\.\d+)?)/)?.[1]) || 0,
      });
    });
    // The site lists the newest chapter first.
    novel.chapters = chapters.reverse();
    chapters.forEach((chapter, index) => {
      if (!chapter.chapterNumber) chapter.chapterNumber = index + 1;
    });

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.request(this.site + chapterPath);
    const $ = parseHTML(html);
    const article = $('article[data-chapter-url]');
    // The collapsible «Ранее в ...» recap precedes the real chapter text.
    article.find('details.collapse').remove();
    article.find('script, style, noscript').remove();

    // The app renders this HTML as is, so drop event handlers and URLs that
    // would run script.
    article.find('*').each((_, el) => {
      const node = $(el);
      for (const name of Object.keys(el.attribs)) {
        if (/^on/i.test(name)) {
          node.removeAttr(name);
        } else if (name === 'href' || name === 'src') {
          const value = el.attribs[name]
            .split('')
            .filter(c => c.charCodeAt(0) > 32)
            .join('')
            .toLowerCase();
          if (
            /^(javascript|vbscript):/.test(value) ||
            (value.startsWith('data:') && !value.startsWith('data:image/'))
          ) {
            node.removeAttr(name);
          }
        }
      }
    });

    return article
      .find('p')
      .map((_, el) => $.html(el))
      .get()
      .join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const html = await this.request(
      `${this.site}/novel?q=${encodeURIComponent(searchTerm)}&page=${pageNo}`,
    );
    return this.parseList(html);
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'views',
      options: [
        { label: 'По просмотрам', value: 'views' },
        { label: 'По дате обновления', value: 'last_chapter_id' },
        { label: 'По дате добавления', value: 'published_at' },
        { label: 'По названию', value: 'name' },
        { label: 'По рейтингу', value: 'rating' },
        { label: 'По подпискам', value: 'subscriptions' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new RanobeMir();
