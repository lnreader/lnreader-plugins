import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type PortableSpan = {
  _type: 'span';
  text: string;
  marks?: string[];
};

type PortableBlock =
  | {
      _type: 'block';
      style?: string;
      children?: PortableSpan[];
    }
  | { _type: 'horizontalLine' }
  | { _type: 'image'; asset?: { _ref?: string } }
  | { _type: string };

type SanityVolume = {
  title: string;
  volkeyword: string;
  mainImage?: { asset?: { url?: string } };
  banner?: { asset?: { url?: string } };
  progress?: number;
  releaseDate?: string;
  synopsis?: PortableBlock[];
  chapters?: {
    chkeyword: string;
    title: string;
  }[];
};

type SanityAllVolumesEntry = {
  title: string;
  volkeyword: string;
  mainImage?: { asset?: { url?: string } };
};

type NextData<T> = { props: { pageProps: T } };

type HomePageProps = { allVolumes?: SanityAllVolumesEntry[] };
type VolumePageProps = { vol?: SanityVolume; statusCode?: number };
type ChapterPageProps = {
  chapter?: { content?: PortableBlock[] };
  statusCode?: number;
};

/** One novel per volume — each is published as its own distinct book. */
type CatalogueEntry = {
  volkeyword: string;
  name: string;
  cover: string;
  releaseDate: string;
};

class AnimeAnyway implements Plugin.PluginBase {
  id = 'animeanyway';
  name = 'Anime Anyway';
  icon = 'src/en/animeanyway/icon.png';
  site = 'https://animeanyway.com/';
  version = '1.0.0';

  /**
   * The site's own volume titles ("Year 3 Vol. 4") don't name the franchise,
   * unlike "High School Syndrome" which is already self-explanatory — prefix
   * just the former so both are recognisable in a novel list.
   */
  private readonly yearVolumePattern = /^Year\s+\d+\s+Vol\.?\s*\d+/i;

  /**
   * Sanity's image CDN URL for a Portable Text image block, which only carries
   * an asset reference ("image-<id>-<w>x<h>-<format>"), not a resolved URL —
   * unlike mainImage/banner elsewhere on the site, which come pre-resolved.
   * Project id and dataset are this site's own fixed identifiers.
   */
  private readonly sanityImageBase =
    'https://cdn.sanity.io/images/m1xj6lbt/production/';

  private cataloguePromise: Promise<CatalogueEntry[]> | null = null;

  /** Extracts the Next.js page data every server-rendered page embeds. */
  private async fetchPageData<T>(path: string): Promise<T | undefined> {
    const response = await fetchApi(`${this.site}${path}`);
    const html = await response.text();
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) return undefined;

    const parsed = JSON.parse(match[1]) as NextData<T>;
    return parsed.props?.pageProps;
  }

  private displayName(title: string) {
    return this.yearVolumePattern.test(title)
      ? `Classroom of the Elite: ${title}`
      : title;
  }

  /**
   * The catalogue is the homepage's own volume list, one novel per volume —
   * each is published as its own book on the site, so that's what's exposed
   * here too. Cached for the session (shared promise, retried on failure).
   */
  private async getCatalogue(): Promise<CatalogueEntry[]> {
    if (this.cataloguePromise) return this.cataloguePromise;

    this.cataloguePromise = (async () => {
      const home = await this.fetchPageData<HomePageProps>('');
      const volumes = home?.allVolumes ?? [];

      return volumes.map(volume => ({
        volkeyword: volume.volkeyword,
        name: this.displayName(volume.title),
        cover: volume.mainImage?.asset?.url ?? defaultCover,
        releaseDate: '',
      }));
    })();

    try {
      return await this.cataloguePromise;
    } catch (error) {
      this.cataloguePromise = null;
      throw error;
    }
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const catalogue = await this.getCatalogue();
    let ordered = catalogue;

    if (showLatestNovels) {
      // Release dates aren't on the homepage listing, only on each volume
      // page — the catalogue is small, so fetch them all to sort "latest".
      await Promise.all(
        catalogue.map(async entry => {
          const vol = await this.fetchPageData<VolumePageProps>(
            entry.volkeyword,
          );
          entry.releaseDate = vol?.vol?.releaseDate ?? '';
        }),
      );
      ordered = [...catalogue].sort((a, b) =>
        b.releaseDate.localeCompare(a.releaseDate),
      );
    }

    return ordered.map(entry => ({
      name: entry.name,
      path: entry.volkeyword,
      cover: entry.cover,
    }));
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private score(name: string, term: string): number {
    const a = this.normalize(name);
    const b = this.normalize(term);
    if (!a || !b) return 0;

    if (a === b) return 1000;
    if (a.startsWith(b)) return 900;
    if (a.includes(b)) return 800;

    const queryTokens = b.split(' ').filter(Boolean);
    const matched = queryTokens.filter(token => a.includes(token)).length;
    if (matched === queryTokens.length) return 700;
    if (matched > 0) return Math.round((matched / queryTokens.length) * 500);
    return 0;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1 || !searchTerm.trim()) return [];

    const catalogue = await this.getCatalogue();
    return catalogue
      .map(entry => ({ entry, score: this.score(entry.name, searchTerm) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ entry }) => ({
        name: entry.name,
        path: entry.volkeyword,
        cover: entry.cover,
      }));
  }

  /** Reconstructs a Sanity CDN URL from a Portable Text image asset ref. */
  private resolveImageRef(ref?: string): string | undefined {
    const match = ref?.match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/);
    if (!match) return undefined;
    return `${this.sanityImageBase}${match[1]}-${match[2]}.${match[3]}`;
  }

  private renderPortableText(blocks: PortableBlock[] | undefined): string {
    if (!blocks) return '';

    const parts: string[] = [];
    for (const block of blocks) {
      if (block._type === 'horizontalLine') {
        parts.push('<hr>');
      } else if (block._type === 'image') {
        const src = this.resolveImageRef(
          (block as { asset?: { _ref?: string } }).asset?._ref,
        );
        if (src) parts.push(`<img src="${src}">`);
      } else if (block._type === 'block') {
        const b = block as {
          style?: string;
          children?: PortableSpan[];
        };
        const tag = b.style === 'h2' ? 'h2' : 'p';
        const inner = (b.children ?? [])
          .map(span => {
            let text = span.text ?? '';
            if (span.marks?.includes('strong'))
              text = `<strong>${text}</strong>`;
            if (span.marks?.includes('em')) text = `<em>${text}</em>`;
            return text;
          })
          .join('');
        if (inner.trim()) parts.push(`<${tag}>${inner}</${tag}>`);
      }
      // Unrecognized block types are skipped rather than thrown on.
    }
    return parts.join('\n');
  }

  private plainTextFromPortableText(blocks: PortableBlock[] | undefined) {
    if (!blocks) return undefined;
    const text = blocks
      .filter(
        (block): block is { _type: 'block'; children?: PortableSpan[] } =>
          block._type === 'block',
      )
      .map(block => (block.children ?? []).map(span => span.text).join(''))
      .filter(line => line.trim())
      .join('\n\n');
    return text || undefined;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelPath,
      cover: defaultCover,
      status: NovelStatus.Ongoing,
      chapters: [],
    };

    const data = await this.fetchPageData<VolumePageProps>(novelPath);
    const vol = data?.vol;
    if (!vol) {
      novel.summary = 'This novel is not available on Anime Anyway.';
      return novel;
    }

    novel.name = this.displayName(vol.title);
    novel.cover = vol.mainImage?.asset?.url ?? defaultCover;
    novel.summary = this.plainTextFromPortableText(vol.synopsis);
    novel.chapters = (vol.chapters ?? []).map((chapter, index) => ({
      name: chapter.title,
      path: `${novelPath}/${chapter.chkeyword}`,
      chapterNumber: index + 1,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const data = await this.fetchPageData<ChapterPageProps>(chapterPath);
    const content = data?.chapter?.content;
    if (!content)
      return '<p>This chapter is not available on Anime Anyway.</p>';

    const html = this.renderPortableText(content);
    return html || '<p>This chapter appears to be empty.</p>';
  }

  resolveUrl = (path: string) => `${this.site}${path}`;
}

export default new AnimeAnyway();
