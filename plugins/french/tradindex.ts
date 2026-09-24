import { load } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

const catalogueTypes = ['Web Novel', 'Light Novel', 'Manhwa'];
const chapterPathPattern =
  /^(?:https?:\/\/trad-index\.com)?\/oeuvre\/([^/?#]+)\/chapitre\/(\d+(?:[.,]\d+)?)/;

class TradIndexPlugin implements Plugin.PluginBase {
  id = 'tradindex';
  name = 'Trad-Index';
  icon = 'src/fr/tradindex/icon.png';
  site = 'https://trad-index.com/';
  version = '1.0.8';

  // The app injects its own device User-Agent; send a desktop one so the
  // server-rendered catalogue/chapter pages stay identical on mobile.
  private readonly browserHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  };

  resolveUrl(path: string, isNovel = false): string {
    const url = new URL(path, this.site);
    if (url.origin !== new URL(this.site).origin)
      throw new Error('Cannot resolve a foreign origin');
    const cleanPath = url.pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/^oeuvre\//, '');
    if (isNovel) return new URL(`/oeuvre/${cleanPath}`, this.site).href;

    const [slug, chapterNumber] = cleanPath
      .replace(/\/chapitre\//, '/')
      .split('/');
    return new URL(`/oeuvre/${slug}/chapitre/${chapterNumber}`, this.site).href;
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0);
    }
    return 100 * (attempt + 1);
  }

  private async fetchHtml(path: string, retry = false): Promise<string> {
    const attempts = retry ? 4 : 1;
    const url = new URL(path, this.site).href;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetchApi(url, { headers: this.browserHeaders });
      if (response.ok) return response.text();
      if (
        !retry ||
        (response.status !== 429 && response.status < 500) ||
        attempt === attempts - 1
      )
        throw new Error(`Failed to load ${path}`);
      await new Promise(resolve =>
        setTimeout(resolve, this.retryDelay(response, attempt)),
      );
    }
    throw new Error(`Failed to load ${path}`);
  }

  private async catalogueSections(paths: string[]): Promise<string[]> {
    const results = await Promise.allSettled(
      paths.map(path => this.fetchHtml(path)),
    );
    const pages = results.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (!pages.length) throw new Error('Failed to load catalogue');
    return pages;
  }

  private parseCards(html: string): Plugin.NovelItem[] {
    const $ = load(html);
    const novels = new Map<string, Plugin.NovelItem>();
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href') || '';
      const match = href.match(
        /^(?:https?:\/\/trad-index\.com)?\/oeuvre\/([^/?#]+)\/?$/,
      );
      if (!match) return;

      const name = $(element)
        .find('[class*="line-clamp"]')
        .first()
        .text()
        .trim();
      if (!name) return;
      const cover = $(element).find('img').first().attr('src');
      novels.set(match[1], {
        name,
        path: match[1],
        cover: cover ? new URL(cover, this.site).href : defaultCover,
      });
    });
    return Array.from(novels.values());
  }

  private cataloguePath(type: string, pageNo: number, searchTerm?: string) {
    const query = searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : '';
    return `/catalogue?type=${encodeURIComponent(type)}${query}&page=${pageNo}`;
  }

  private chapterItems(html: string, slug: string): Plugin.ChapterItem[] {
    const $ = load(html);
    const chapters = new Map<string, Plugin.ChapterItem>();
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href') || '';
      const match = href.match(chapterPathPattern);
      if (!match || match[1] !== slug) return;

      const number = Number(match[2].replace(',', '.'));
      if (!Number.isFinite(number)) return;
      const path = `${slug}/${match[2]}`;
      chapters.set(path, {
        name: $(element).text().trim() || `Chapitre ${match[2]}`,
        path,
        chapterNumber: number,
      });
    });
    return Array.from(chapters.values());
  }

  private async fetchChapterPages(
    html: string,
    slug: string,
  ): Promise<Plugin.ChapterItem[]> {
    const $ = load(html);
    let lastPage = 1;
    $('a[href*="onglet=chapitres"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      const page = Number(
        new URL(href, this.resolveUrl(slug, true)).searchParams.get('page'),
      );
      if (Number.isInteger(page)) lastPage = Math.max(lastPage, page);
    });

    const pages = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, index) =>
        this.fetchHtml(
          `/oeuvre/${slug}?onglet=chapitres&tri=desc&page=${index + 2}`,
          true,
        ),
      ),
    );
    const chapters = new Map<string, Plugin.ChapterItem>();
    for (const pageHtml of [html, ...pages]) {
      for (const chapter of this.chapterItems(pageHtml, slug)) {
        chapters.set(chapter.path, chapter);
      }
    }
    return Array.from(chapters.values()).sort(
      (left, right) => (left.chapterNumber || 0) - (right.chapterNumber || 0),
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const sitePage = Math.max(1, pageNo);
    const pages = await this.catalogueSections(
      catalogueTypes.map(type => this.cataloguePath(type, sitePage)),
    );
    const novels = Array.from(
      new Map(
        pages
          .flat()
          .flatMap(html => this.parseCards(html))
          .map(novel => [novel.path, novel]),
      ).values(),
    );
    if (sitePage === 1 && !novels.length)
      throw new Error('Trad-Index catalogue returned no work cards');
    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const pages = await this.catalogueSections(
      catalogueTypes.map(type => this.cataloguePath(type, pageNo, searchTerm)),
    );
    return Array.from(
      new Map(
        pages
          .flatMap(html => this.parseCards(html))
          .map(novel => [novel.path, novel]),
      ).values(),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = this.resolveUrl(novelPath, true);
    const slug = new URL(novelUrl).pathname.replace(/^\/oeuvre\//, '');
    const html = await this.fetchHtml(novelUrl, true);
    const $ = load(html);
    const details = $('body').text().replace(/\s+/g, ' ');
    const formatStatus = details.match(
      /(Web Novel|Light Novel|Manhwa)\s*·\s*([^\n]+)/i,
    );
    const getDetail = (label: string) => {
      let value: string | undefined;
      $('*').each((_, element) => {
        const text = $(element).text().trim();
        const match = text.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i'));
        if (match) {
          value = match[1].trim();
          return false;
        }
      });
      return value;
    };
    const synopsisHeading = $('h1,h2,h3')
      .filter(
        (_, element) => $(element).text().trim().toLowerCase() === 'synopsis',
      )
      .first();

    return {
      path: slug,
      name: $('h1').first().text().trim(),
      cover: $('img[alt^="Couverture de"]').first().attr('src')
        ? new URL(
            $('img[alt^="Couverture de"]').first().attr('src')!,
            this.site,
          ).href
        : defaultCover,
      summary: synopsisHeading.nextAll('p').first().text().trim() || undefined,
      author: getDetail('Auteur'),
      artist: getDetail('Traducteur'),
      genres: getDetail('Genres'),
      status: /terminé/i.test(formatStatus?.[2] || '')
        ? NovelStatus.Completed
        : /en cours/i.test(formatStatus?.[2] || '')
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown,
      chapters: await this.fetchChapterPages(html, slug),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(
      this.resolveUrl(chapterPath).replace(this.site.slice(0, -1), ''),
    );
    const $ = load(html);
    const main = $('main').first();
    const stopPattern =
      /traduit par|traducteur|navigation|partager|signaler|commentaires?/i;
    let stopped = false;
    const prose: string[] = [];
    main
      .find(
        'h1, h2, h3, h4, h5, h6, p, nav, form, [class*="comment"], [class*="share"], [class*="report"], [class*="translator"]',
      )
      .each((_, element) => {
        const part = $(element);
        if (stopped) return false;
        if (stopPattern.test(part.text())) {
          stopped = true;
          return false;
        }
        if (
          element.tagName === 'p' &&
          (part.hasClass('narration') || part.hasClass('dialogue'))
        )
          prose.push($.html(element));
      });

    const content = prose.join('');
    if (load(content).text().trim().length < 200)
      throw new Error('No readable chapter content found');
    return content;
  }
}

export default new TradIndexPlugin();
