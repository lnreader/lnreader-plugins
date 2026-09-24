import { load } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';

type WordPressPage = {
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

const chapterSlug =
  /(?:chapitre|prologue|epilogue|interlude|bonus|postface|preface)/i;

class JGardenPlugin implements Plugin.PluginBase {
  id = 'jgarden';
  name = 'J-Garden';
  icon = 'src/fr/jgarden/icon.png';
  site = 'https://j-garden.fr/';
  version = '1.0.5';

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.origin !== new URL(this.site).origin)
      throw new Error('Cannot resolve a foreign origin');
    return url.toString();
  }

  private slugFromLink(link: string): string | undefined {
    try {
      const url = new URL(link, this.site);
      if (url.origin !== new URL(this.site).origin) return undefined;
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1];
    } catch {
      return undefined;
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    if (!/[/+]json\b/i.test(response.headers.get('content-type') || ''))
      throw new Error(`Expected a JSON response for ${path}`);
    return response.json() as Promise<T>;
  }

  private parseCatalogue(html: string): Plugin.NovelItem[] {
    const $ = load(html);
    const novels = new Map<string, Plugin.NovelItem>();
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const path = href ? this.slugFromLink(href) : undefined;
      const image = $(element).find('img').first();
      const name =
        $(element).text().trim() ||
        image.attr('alt')?.trim() ||
        this.nameFromSlug(path || '');
      const coverSrc = image.attr('src');
      const width = Number(image.attr('width'));
      const height = Number(image.attr('height'));
      // The catalogue renders wide series banners (e.g. 2567×487), not the
      // portrait book covers. A landscape image zoomed into a portrait card
      // looks broken, so fall back to the default cover instead.
      const isBanner =
        Number.isFinite(width) && Number.isFinite(height) && width > height;
      const cover =
        coverSrc && !isBanner ? this.resolveUrl(coverSrc) : defaultCover;
      if (path && name) novels.set(path, { name, path, cover });
    });
    return Array.from(novels.values());
  }

  // The catalogue only carries wide series banners; the actual portrait book
  // cover lives on each novel's own page. Fetch it there so the list shows a
  // real cover instead of a zoomed banner or the fallback placeholder.
  private async fetchCover(slug: string): Promise<string> {
    try {
      const pages = await this.getJson<{ content: { rendered: string } }[]>(
        `/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=content`,
      );
      const content = pages[0]?.content?.rendered;
      if (!content) return defaultCover;
      const $ = load(content);
      let cover = '';
      $('img').each((_, element) => {
        if (cover) return;
        const src = $(element).attr('src');
        if (!src) return;
        const width = Number($(element).attr('width'));
        const height = Number($(element).attr('height'));
        const portrait =
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          height >= width;
        if (portrait) cover = this.resolveUrl(src);
      });
      return cover || defaultCover;
    } catch {
      return defaultCover;
    }
  }

  private nameFromSlug(slug: string): string {
    return slug
      .split('-')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private chapterSequence(name: string, path: string) {
    const source = `${name} ${path}`;
    const volume = Number(
      source.match(/(?:tome|volume|vol\.?|v|t)[\s_-]*(\d+)/i)?.[1] || 0,
    );
    // Within each volume: preface, prologue, numbered chapters, interlude,
    // bonus, epilogue, then postface. Unrecognised links retain DOM order.
    const specialKinds = [
      ['preface', 0],
      ['prologue', 1],
      ['interlude', 3],
      ['bonus', 4],
      ['epilogue', 5],
      ['postface', 6],
    ] as const;
    const special = specialKinds.find(([label]) =>
      new RegExp(`(?:^|[\\s_-])${label}(?:$|[\\s_-])`, 'i').test(source),
    );
    const chapter = source.match(
      /(?:chapitre|chapter|ch\.?)[\s_-]*(\d+(?:[.,]\d+)?)/i,
    );
    return {
      volume,
      kind: special?.[1] ?? (chapter ? 2 : 7),
      chapter: Number(chapter?.[1].replace(',', '.') || 0),
    };
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const sections = await Promise.allSettled(
      ['jg-ln', 'jg-web-novel'].map(async section => {
        const pages = await this.getJson<unknown>(
          `/wp-json/wp/v2/pages?slug=${section}&_fields=content`,
        );
        if (
          !Array.isArray(pages) ||
          !pages.every(
            page =>
              page !== null &&
              typeof page === 'object' &&
              (page as Record<string, unknown>).content !== null &&
              typeof (page as Record<string, unknown>).content === 'object' &&
              typeof (page as { content: Record<string, unknown> }).content
                .rendered === 'string',
          )
        )
          throw new Error(`Invalid catalogue section: ${section}`);
        return pages as Pick<WordPressPage, 'content'>[];
      }),
    );
    const catalogues = sections.flatMap(section =>
      section.status === 'fulfilled' ? [section.value] : [],
    );
    if (!catalogues.length) throw new Error('Failed to load catalogue');
    const novels = new Map<string, Plugin.NovelItem>();
    for (const section of catalogues.flat()) {
      for (const novel of this.parseCatalogue(section.content.rendered)) {
        novels.set(novel.path, novel);
      }
    }
    const list = Array.from(novels.values());
    const covers = await Promise.allSettled(
      list.map(novel => this.fetchCover(novel.path)),
    );
    return list.map((novel, index) => ({
      ...novel,
      cover:
        covers[index]?.status === 'fulfilled'
          ? covers[index].value
          : defaultCover,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = this.resolveUrl(novelPath);
    const slug = this.slugFromLink(novelUrl) || novelPath;
    const pages = await this.getJson<WordPressPage[]>(
      `/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=slug,link,title,content`,
    );
    const page = pages[0];
    if (!page) throw new Error('Novel not found');

    const $ = load(page.content.rendered);
    const chapters = new Map<
      string,
      { chapter: Plugin.ChapterItem; index: number }
    >();
    const firstChapter = $('a[href]')
      .filter((_, element) => {
        const href = $(element).attr('href');
        const chapterPath = href ? this.slugFromLink(href) : undefined;
        return Boolean(chapterPath && chapterSlug.test(chapterPath));
      })
      .first();

    $('a[href]').each((index, element) => {
      const href = $(element).attr('href');
      const path = href ? this.slugFromLink(href) : undefined;
      const name = $(element).text().trim();
      if (path && name && chapterSlug.test(path) && !chapters.has(path)) {
        chapters.set(path, { chapter: { name, path }, index });
      }
    });

    const details = $('body *')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .join(' ');
    const status =
      /\b(?:termin(?:é|ée|e)|completed|complete|fini)(?![A-Za-zÀ-ÖØ-öø-ÿ0-9_])/i.test(
        details,
      )
        ? NovelStatus.Completed
        : /\b(?:hiatus|en pause|pause)\b/i.test(details)
          ? NovelStatus.OnHiatus
          : /\b(?:en cours|ongoing|publication)\b/i.test(details)
            ? NovelStatus.Ongoing
            : NovelStatus.Unknown;

    return {
      path: page.slug,
      name: load(page.title.rendered).text().trim(),
      cover: $('img').first().attr('src')
        ? this.resolveUrl($('img').first().attr('src')!)
        : defaultCover,
      summary: firstChapter.prevAll().text().trim(),
      status,
      chapters: (() => {
        const items = Array.from(chapters.values()).map(entry => ({
          ...entry,
          sequence: this.chapterSequence(
            entry.chapter.name,
            entry.chapter.path,
          ),
        }));
        // When only some chapters carry a volume marker (e.g. v1/v2 books
        // alongside untagged side stories), the site's DOM order is the
        // reading order; keep it instead of interleaving by chapter number.
        const mixedVolumes =
          items.some(item => item.sequence.volume > 0) &&
          items.some(item => item.sequence.volume === 0);
        items.sort((left, right) => {
          if (mixedVolumes) return left.index - right.index;
          return (
            left.sequence.volume - right.sequence.volume ||
            left.sequence.kind - right.sequence.kind ||
            left.sequence.chapter - right.sequence.chapter ||
            left.index - right.index
          );
        });
        return items.map(({ chapter }, index) => ({
          ...chapter,
          chapterNumber: index + 1,
        }));
      })(),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterUrl = this.resolveUrl(chapterPath);
    const slug = this.slugFromLink(chapterUrl) || chapterPath;
    let posts = await this.getJson<
      Pick<WordPressPage, 'content' | 'title' | 'link'>[]
    >(
      `/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=content,title,link`,
    );
    if (posts.length === 0) {
      const resolved = await fetchApi(this.resolveUrl(chapterPath));
      const canonicalSlug = this.slugFromLink(resolved.url);
      if (canonicalSlug && canonicalSlug !== slug) {
        posts = await this.getJson(
          `/wp-json/wp/v2/posts?slug=${encodeURIComponent(canonicalSlug)}&_fields=content,title,link`,
        );
      }
    }
    const post = posts[0];
    if (!post) throw new Error('Chapter not found');

    const $ = load(post.content.rendered);
    const content = $('.elementor-widget-theme-post-content').first();
    const chapter = content.length ? content : $('body');
    chapter
      .find(
        'script, style, nav, .sharedaddy, .share, [class*="share"], [id*="share"]',
      )
      .remove();
    chapter
      .find('*')
      .filter((_, element) => !$(element).text().trim())
      .remove();
    const html = chapter.html()?.trim() || '';
    if (chapter.text().trim().length < 200)
      throw new Error('No readable chapter content found');
    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const query = normalize(searchTerm);
    return (await this.popularNovels(1)).filter(novel =>
      normalize(novel.name).includes(query),
    );
  }
}

export default new JGardenPlugin();
