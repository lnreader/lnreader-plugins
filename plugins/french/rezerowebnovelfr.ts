import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

const NOVEL_METADATA: Record<string, { name: string; summary: string }> = {
  '/histoire-principale/': {
    name: 'Re:Zero - Histoire Principale',
    summary: 'Histoire principale de Re:Zero traduite en français.',
  },
  '/histoires-annexes/': {
    name: 'Re:Zero - Histoires Annexes',
    summary:
      'Histoires annexes (Side Stories) de Re:Zero traduites en français.',
  },
  '/if-stories/': {
    name: 'Re:Zero - IF Stories',
    summary:
      'Histoires alternatives (IF Stories) de Re:Zero traduites en français.',
  },
};

const NOVEL_COVER =
  'https://rezerowebnovelfr.wordpress.com/wp-content/uploads/2021/03/sans-titre-1.png';

function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let roman = '';
  let n = num;
  for (const [value, symbol] of romanMap) {
    while (n >= value) {
      roman += symbol;
      n -= value;
    }
  }
  return roman;
}

function getArcRomanPrefix(matchStr: string): string {
  const num = parseInt(matchStr, 10);
  if (isNaN(num)) {
    return matchStr.toUpperCase();
  }
  return toRoman(num);
}

class ReZeroWebNovelFrPlugin implements Plugin.PluginBase {
  id = 'rezerowebnovelfr';
  name = 'Re:Zero Web Novel FR';
  icon = 'src/fr/rezerowebnovelfr/icon.png';
  site = 'https://rezerowebnovelfr.wordpress.com';
  version = '1.0.0';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: { 'Accept-Encoding': 'deflate' },
    });
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    return Object.entries(NOVEL_METADATA).map(([path, meta]) => ({
      name: meta.name,
      cover: NOVEL_COVER,
      path: path,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    const $ = await this.getCheerio(this.site + novelPath);
    novel.name = $('h1.entry-title').text().trim();
    novel.author = 'Tappei Nagatsuki';
    novel.status = NovelStatus.Ongoing;

    const meta = NOVEL_METADATA[novelPath];
    if (meta) {
      novel.name = meta.name;
      novel.cover = NOVEL_COVER;
      novel.summary = meta.summary;
    }

    const chapters: Plugin.ChapterItem[] = [];

    const tryAddChapter = (
      href: string | undefined,
      name: string,
      prefix = '',
    ) => {
      if (!href || !href.includes(this.site)) return;
      const cleanHref = href.split('?')[0];
      const dateMatch = cleanHref.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (dateMatch && name) {
        const path = cleanHref.replace(this.site, '');
        if (!chapters.some(c => c.path === path)) {
          const releaseDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          let cleanName = name;
          if (novelPath === '/if-stories/') {
            cleanName = name
              .replace(/^(Lire|lire|LIRE|LIRE LE)\s+/i, '')
              .trim();
          }
          chapters.push({
            name: prefix + cleanName,
            path,
            releaseTime: releaseDate,
          });
        }
      }
    };

    if (novelPath === '/histoire-principale/') {
      const arcUrls: string[] = [];
      $('.entry-content .wp-block-button a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes(this.site)) {
          arcUrls.push(href);
        }
      });

      const pages = await Promise.all(
        arcUrls.map(async arcUrl => {
          try {
            const page$ = await this.getCheerio(arcUrl);
            return { page$, arcUrl };
          } catch (e) {
            return null;
          }
        }),
      );

      for (const result of pages) {
        if (!result) continue;
        const { page$, arcUrl } = result;

        // Extract arc designation from URL, e.g. "arc-viii-vincent-vollachia" -> "Arc VIII"
        const arcMatch = arcUrl
          .replace(this.site, '')
          .match(/^\/arc-([^-/]+)/i);
        const arcPrefix = arcMatch
          ? `Arc ${getArcRomanPrefix(arcMatch[1])} - `
          : '';

        page$('div.entry-content ul li a, div.entry-content ol li a').each(
          (i, el) => {
            const href = page$(el).attr('href');
            const name = page$(el).text().trim();
            tryAddChapter(href, name, arcPrefix);
          },
        );
      }
    } else if (novelPath === '/histoires-annexes/') {
      // All arcs are on a single page; h2 elements mark each arc section.
      let currentArcPrefix = '';
      const children = $('div.entry-content').children().toArray();
      for (const el of children) {
        if (el.type !== 'tag') continue;
        const tag = el.tagName.toLowerCase();
        if (tag === 'h2') {
          // Extract arc number, e.g. "Arc 1 - Memory Snow" or "ARC I" -> "Arc I - "
          const h2Text = $(el).text().trim();
          const arcMatch = h2Text.match(/arc\s+([ivxlcdm]+|\d+)/i);
          currentArcPrefix = arcMatch
            ? `Arc ${getArcRomanPrefix(arcMatch[1])} - `
            : `${h2Text} - `;
        } else {
          $(el)
            .find('a')
            .each((_j, a) => {
              const href = $(a).attr('href');
              const name = $(a).text().trim();
              tryAddChapter(href, name, currentArcPrefix);
            });
        }
      }
    } else {
      $('.entry-content a').each((i, el) => {
        const href = $(el).attr('href');
        const name = $(el).text().trim();
        tryAddChapter(href, name);
      });
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    // Remove ads, social sharing widgets, like widgets
    $(
      'div.entry-content .sharedaddy, div.entry-content .wpcnt, div.entry-content #jp-post-flair, div.entry-content div[id^="atatags-"]',
    ).remove();

    const title = $('h1.entry-title').html() || '';
    const chapter = $('div.entry-content').html() || '';
    return title + chapter;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const popularNovels = this.popularNovels(1);

    const novels = (await popularNovels).filter(novel =>
      novel.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .includes(
          searchTerm
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim(),
        ),
    );

    return novels;
  }
}

export default new ReZeroWebNovelFrPlugin();
