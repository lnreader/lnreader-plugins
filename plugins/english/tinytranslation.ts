import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const PLACEHOLDER_COVER = /404\.png|cover-404|noimagefound/i;
// Chapters are `/<group>/<chapter>/`; the group is usually the series slug.
const CHAPTER_PATH = /^\/(?!series\/)[^/]+\/[^/]+\/?$/;
const LIST_STATUS: Record<string, string> = {
  'on-going': NovelStatus.Ongoing,
  completed: NovelStatus.Completed,
  dropped: NovelStatus.Cancelled,
};

type ListedNovel = Plugin.NovelItem & { status?: string };

class TinyTranslation implements Plugin.PluginBase {
  id = 'tinytranslation';
  name = 'TinyTranslation';
  site = 'https://www.tinytranslation.xyz';
  icon = 'src/en/tinytranslation/icon.png';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok) {
      throw Object.assign(
        new Error(`TinyTranslation: HTTP ${response.status}.`),
        {
          status: response.status,
        },
      );
    }
    return response;
  }

  /** Converts an href or path into a canonical `/series/<slug>/` path. */
  private seriesPath(href: string | undefined): string | undefined {
    if (!href) return undefined;
    const parts = new URL(href, this.site).pathname.split('/').filter(Boolean);
    return parts[0] === 'series' && parts[1]
      ? `/series/${parts[1]}/`
      : undefined;
  }

  /** The site's full catalogue: one page, grouped by status, no pagination. */
  private async catalogue(): Promise<ListedNovel[]> {
    const $ = loadCheerio(
      await (await this.request(`${this.site}/list-novels/`)).text(),
    );
    const novels: ListedNovel[] = [];
    const seen = new Set<string>();
    let status: string | undefined;
    $('h3, ul.series-posts-list').each((_, el) => {
      if ($(el).is('h3')) {
        status = LIST_STATUS[$(el).text().trim().toLowerCase()];
        return;
      }
      $(el)
        .find('a[href]')
        .each((_, link) => {
          const path = this.seriesPath($(link).attr('href'));
          const name = $(link).text().trim().replace(/\s+/g, ' ');
          if (!path || !name || seen.has(path)) return;
          seen.add(path);
          novels.push({ name, path, cover: defaultCover, status });
        });
    });
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    return this.catalogue();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(novelPath))).text(),
    );

    const name =
      $('h1.wp-block-post-title').first().text().trim() ||
      $('h2.title-content').first().text().trim() ||
      'Untitled';

    const coverSrc = $('.separator img').first().attr('src');
    const cover =
      coverSrc && !PLACEHOLDER_COVER.test(coverSrc)
        ? new URL(coverSrc, this.site).href
        : defaultCover;

    // The details block is the parent of the "Details:" heading. Its layout
    // differs between novels, so the fields are read by their labels.
    const details = $('h5')
      .filter((_, el) => /^details:$/i.test($(el).text().trim()))
      .first()
      .parent();
    const detailsHtml = details.html() || '';
    const labels = loadCheerio(
      detailsHtml.replace(/<br\s*\/?>/gi, '\n'),
    ).text();
    const author = /^\s*Author\s*:[ \t]*(.+)$/im.exec(labels)?.[1]?.trim();
    const genres = /^\s*Genre\s*:[ \t]*(.+)$/im
      .exec(labels)?.[1]
      ?.trim()
      .replace(/[\s,]+$/, '');

    const synopsisHtml =
      /Synopsis:[\s\S]*?<\/h5>([\s\S]*?)(?=<h5|$)/i.exec(detailsHtml)?.[1] ||
      '';
    const synopsis = loadCheerio(
      synopsisHtml
        .replace(/\s*\n\s*/g, ' ')
        .replace(/<br\s*\/?>|<\/p>/gi, '\n'),
    );
    synopsis('u')
      .filter((_, el) => /raw source/i.test(synopsis(el).text()))
      .remove();
    const summary = synopsis
      .root()
      .text()
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');

    // Chapters sit in one or more <ul> lists after the "Chapter:" heading
    // (one per volume on some novels), ending at the next heading. Their links
    // do not always sit under the series slug, so position is what matters.
    const origin = new URL(this.site).origin;
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const chapterHeading = $('h5')
      .filter((_, el) => /^chapter\b.*:$/i.test($(el).text().trim()))
      .first()
      .get(0);
    if (chapterHeading) {
      const nodes = $('*').toArray();
      const following = nodes.slice(nodes.indexOf(chapterHeading) + 1);
      for (const el of following) {
        if ($(el).is('h1, h2, h3, h4, h5, h6')) break;
        if (!$(el).is('ul')) continue;
        $(el)
          .find('a[href]')
          .each((_, link) => {
            const parsed = new URL($(link).attr('href')!, this.site);
            if (parsed.origin !== origin || !CHAPTER_PATH.test(parsed.pathname))
              return;
            if (seen.has(parsed.pathname)) return;
            seen.add(parsed.pathname);
            const chapterName = $(link).text().trim().replace(/\s+/g, ' ');
            if (!chapterName) return;
            const number = /chapter\s+(\d+(?:\.\d+)?)/i.exec(chapterName)?.[1];
            chapters.push({
              name: chapterName,
              path: parsed.pathname,
              chapterNumber: number ? Number(number) : undefined,
            });
          });
      }
    }

    if (!chapters.length)
      throw new Error('TinyTranslation: no chapters were found on this page.');

    const seriesPath = this.seriesPath(novelPath);
    const status = await this.catalogue()
      .then(novels => novels.find(novel => novel.path === seriesPath)?.status)
      .catch(() => undefined);

    return {
      path: novelPath,
      name,
      cover,
      author,
      genres,
      status,
      summary: summary || undefined,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = loadCheerio(
      await (await this.request(this.resolveUrl(chapterPath))).text(),
    );
    const scoped = $('.entry-content .content').first();
    const content = scoped.length ? scoped : $('.content').first();
    content
      .find(
        'h2.title-content, script, style, noscript, iframe, form, .navigate, #google_translate_element, .google_translate_element, .post-views, .tooltip, .adsbygoogle',
      )
      .remove();
    content
      .find('p')
      .filter((_, el) => /please bookmark this series/i.test($(el).text()))
      .remove();
    const chapter = content.html() || '';
    if (loadCheerio(chapter).text().trim().length < 200)
      throw new Error('TinyTranslation: no readable chapter text was found.');
    return chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const tokens = searchTerm
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!tokens.length || pageNo > 1) return [];

    // The catalogue is a single page, so every result fits on page one and
    // later pages are empty.
    const novels = await this.catalogue();
    return novels.filter(novel => {
      const name = novel.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    });
  }

  resolveUrl(path: string): string {
    return new URL(path, this.site).href;
  }
}

export default new TinyTranslation();
