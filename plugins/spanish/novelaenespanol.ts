import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const PAGE_SIZE = 20;
// The site never caps the chapter query, but ask for a little more than the
// advertised count so late additions are not cut off.
const CHAPTER_MARGIN = 50;
const CATALOGUE_TTL = 5 * 60 * 1000;
// Lines the site appends to every synopsis without any content behind them.
const EMPTY_SYNOPSIS_LINE = /^(?:nombres asociados|autor\s*\(es\))$/i;

type CatalogueEntry = {
  cat_title: string;
  cat_img: string;
  cat_link: string;
  cat_date: string;
  chapters: string;
  likes: string;
  completed: string;
  author: string;
};

type ChapterRow = {
  ID: string;
  post_name: string;
  post_title: string;
};

let catalogueCache: { time: number; entries: CatalogueEntry[] } | undefined;

const decodeText = (text: string): string =>
  parseHTML(`<div>${text}</div>`)('div').text().trim();

const plainText = (text: string): string => {
  let value = text.toLowerCase();
  if (typeof value.normalize === 'function') {
    value = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  return value;
};

// The catalogue links to each novel's intro post (`/<slug>/novela-ligera/..`),
// while the novel page with the chapter list lives at `/novela-ligera/<slug>/`.
const toNovelPath = (url: string): string => {
  const slug = url.replace(/^https?:\/\/[^/]+\//, '').split('/')[0];
  return `/novela-ligera/${slug}/`;
};

class NovelaEnEspanolPlugin implements Plugin.PluginBase {
  id = 'novelaenespanol';
  name = 'NovelaenEspanol';
  icon = 'src/es/novelaenespanol/icon.png';
  site = 'https://novelaenespanol.com';
  version = '1.0.0';

  filters = {
    order: {
      value: 'likes',
      label: 'Ordenar por',
      options: [
        { label: 'Más populares', value: 'likes' },
        { label: 'Más recientes', value: 'date' },
        { label: 'Más capítulos', value: 'chapters' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Estado',
      options: [
        { label: 'Todos', value: 'all' },
        { label: 'En curso', value: 'ongoing' },
        { label: 'Terminado', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  async getHtml(url: string, init?: Parameters<typeof fetchApi>[1]) {
    const response = await fetchApi(url, init);
    if (!response.ok) {
      throw new Error(`NovelaenEspanol: HTTP ${response.status}.`);
    }
    return response.text();
  }

  // The search page embeds the whole novel catalogue as a JSON array, which
  // the site's own browse and search pages filter in the browser.
  async getCatalogue(): Promise<CatalogueEntry[]> {
    if (catalogueCache && Date.now() - catalogueCache.time < CATALOGUE_TTL) {
      return catalogueCache.entries;
    }
    const body = await this.getHtml(`${this.site}/search/`);
    const json = body.match(/let cat = (\[[\s\S]*?\]);\s*let /)?.[1];
    if (!json) {
      throw new Error(
        'NovelaenEspanol: no se encontró el catálogo de novelas.',
      );
    }
    const entries: CatalogueEntry[] = JSON.parse(json);
    catalogueCache = { time: Date.now(), entries };
    return entries;
  }

  toNovelItems(entries: CatalogueEntry[]): Plugin.NovelItem[] {
    return entries.map(entry => ({
      name: decodeText(entry.cat_title),
      path: toNovelPath(entry.cat_link),
      cover: entry.cat_img || defaultCover,
    }));
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let order = filters?.order?.value || 'likes';
    if (showLatestNovels) order = 'date';
    const status = filters?.status?.value || 'all';

    let entries = (await this.getCatalogue()).slice();
    if (status === 'completed') {
      entries = entries.filter(entry => entry.completed === '1');
    } else if (status === 'ongoing') {
      entries = entries.filter(entry => entry.completed !== '1');
    }

    if (order === 'date') {
      entries.sort((a, b) => (a.cat_date < b.cat_date ? 1 : -1));
    } else if (order === 'chapters') {
      entries.sort((a, b) => Number(b.chapters) - Number(a.chapters));
    } else {
      entries.sort((a, b) => Number(b.likes) - Number(a.likes));
    }

    const start = (pageNo - 1) * PAGE_SIZE;
    return this.toNovelItems(entries.slice(start, start + PAGE_SIZE));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = plainText(searchTerm.trim());
    const matches = (await this.getCatalogue()).filter(
      entry =>
        plainText(decodeText(entry.cat_title)).includes(term) ||
        plainText(entry.author || '').includes(term),
    );
    const start = (pageNo - 1) * PAGE_SIZE;
    return this.toNovelItems(matches.slice(start, start + PAGE_SIZE));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await this.getHtml(this.site + novelPath);
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        loadedCheerio('.category-title').first().text().trim() || 'Untitled',
      cover: loadedCheerio('img.category-img').attr('src') || defaultCover,
    };

    const author = loadedCheerio('.cat-author [itemprop=creator]')
      .first()
      .text()
      .trim();
    if (author) novel.author = author;

    const status = loadedCheerio('.cat-status span').first();
    if (status.hasClass('completed')) novel.status = NovelStatus.Completed;
    else if (status.hasClass('ongoing')) novel.status = NovelStatus.Ongoing;

    const genres: string[] = [];
    loadedCheerio('.post_tags a, .attribute a').each((_, el) => {
      const genre = loadedCheerio(el).text().trim();
      if (genre && !genres.includes(genre)) genres.push(genre);
    });
    if (genres.length) novel.genres = genres.join(', ');

    const summary = loadedCheerio('.category-exerpt.description p')
      .map((_, el) => loadedCheerio(el).text().trim())
      .get()
      .filter(line => line && !EMPTY_SYNOPSIS_LINE.test(line))
      .join('\n\n');
    if (summary) novel.summary = summary;

    const data = loadedCheerio('.js-cat-data').first();
    const categoryId = data.attr('data-category');
    const slug = data.attr('data-slug');
    if (!categoryId || !slug) {
      throw new Error('NovelaenEspanol: no se encontró la lista de capítulos.');
    }
    const count = Number(data.attr('data-count')) || 0;

    // The page only prints the newest 30 chapters; the full list comes from
    // the same query the site's own pager uses.
    const chaptersBody = await this.getHtml(
      `${this.site}/wp-content/themes/ranobe-novels/template-parts/category/chapters-query.php`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: this.site + novelPath,
        },
        body: `cat_id=${categoryId}&limit=${count + CHAPTER_MARGIN}&offset=0`,
      },
    );
    const rows: ChapterRow[] = JSON.parse(chaptersBody) || [];

    // The site lists the newest chapter first.
    novel.chapters = rows.reverse().map((row, index) => ({
      name: decodeText(row.post_title),
      path: `/${slug}/novela-ligera/${row.post_name}/`,
      chapterNumber: index + 1,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await this.getHtml(this.site + chapterPath);
    const loadedCheerio = parseHTML(body);
    const content = loadedCheerio('.js-full-content').first();
    if (!content.length) {
      throw new Error('NovelaenEspanol: no se encontró el texto del capítulo.');
    }

    content.find('script, noscript, style, ins, iframe').remove();
    // The first heading repeats the chapter title.
    content.children('h2').first().remove();
    // The site closes every chapter with an SEO footer (a heading, the
    // author and translator credits and a last heading).
    content.children('h3').each((_, el) => {
      const heading = loadedCheerio(el);
      if (/^Leer .+ en Español/i.test(heading.text().trim())) {
        heading.nextAll().remove();
        heading.remove();
      }
    });

    return content.html() || '';
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new NovelaEnEspanolPlugin();
