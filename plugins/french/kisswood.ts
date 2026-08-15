import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const challengeTitles = new Set([
  'bot verification',
  'you are being redirected...',
  'un instant...',
  'just a moment...',
  'redirecting...',
]);

async function fetchCheckedHtml(
  url: string,
  init?: Parameters<typeof fetchApi>[1],
): Promise<string> {
  const response = await fetchApi(url, init);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  const html = await response.text();
  const title = html
    .match(/<title[^>]*>(.*?)<\/title>/is)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (title && challengeTitles.has(title))
    throw new Error(`Bot challenge while loading ${url}`);
  return html;
}

class KissWoodPlugin implements Plugin.PluginBase {
  id = 'kisswood';
  name = 'KissWood';
  icon = 'src/fr/kisswood/icon.png';
  site = 'https://kisswood.eu';
  version = '1.0.3';

  private async findMovedChapter(chapterPath: string): Promise<string | null> {
    const slug = chapterPath.split('/').filter(Boolean).pop() || '';
    const match = slug.match(/^(.*?)-chapitre-(\d+)/i);
    if (!match) return null;
    const query = `${match[1].replace(/-/g, ' ')} chapitre ${match[2]}`;
    const response = await fetchApi(
      `${this.site}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&type=post&subtype=post&per_page=20`,
    );
    if (!response.ok) return null;
    const results = (await response.json()) as {
      title?: string;
      url?: string;
    }[];
    const replacement = results.find(result =>
      new RegExp(`chapitre\\D*${match[2]}(?:\\D|$)`, 'i').test(
        result.title || '',
      ),
    )?.url;
    if (!replacement) return null;
    const url = new URL(replacement, this.site);
    return url.origin === new URL(this.site).origin ? url.toString() : null;
  }

  async getCheerio(url: string): Promise<CheerioAPI> {
    return load(await fetchCheckedHtml(url));
  }

  async getNovelsCovers(
    novels: Plugin.NovelItem[],
    listUrlCover: string[],
  ): Promise<Plugin.NovelItem[]> {
    await Promise.all(
      novels.map(async (novel, index) => {
        const urlCover = listUrlCover[index];
        if (urlCover) {
          novel.cover = this.findCoverImage(await this.getCheerio(urlCover));
        }
      }),
    );
    return novels;
  }

  regexAuthors = [/Auteur :([^\n]*)/, /Auteur\u00A0:([^\n]*)/];

  async getNovelInfo(
    novel: Plugin.SourceNovel,
    url: string,
  ): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(url);

    const textArray: string[] = $('.entry-content p')
      .map((_, element) => $(element).text().trim())
      .get()
      .join('\n')
      .split('\n');

    const index = textArray.findIndex(element =>
      [
        'Traducteur Anglais- Français',
        'Titre en français',
        '———',
        'Titre :',
        'Lien vers le premier chapitre',
        '____________',
        'Auteur : ',
      ].some(marker => element.includes(marker)),
    );

    novel.summary = (index !== -1 ? textArray.slice(0, index) : textArray)
      .join('\n')
      .replace('Synopsis :', '');
    novel.author = this.extractInfo(textArray.join('\n'), this.regexAuthors);
    novel.cover = this.findCoverImage($);
    return novel;
  }

  findCoverImage($: CheerioAPI): string {
    return (
      $('div p img').first().attr('src') ||
      $('figure a img').first().attr('src') ||
      $('figure img').first().attr('src') ||
      defaultCover
    );
  }

  extractInfo(text: string, regexes: RegExp[]): string {
    for (const regex of regexes) {
      const match = regex.exec(text);
      if (match !== null) {
        return match[1].trim();
      }
    }
    return '';
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const novels: Plugin.NovelItem[] = [];
    const $ = await this.getCheerio(this.site);
    const listUrlCover: string[] = [];
    $('nav div div ul li ul li').each((i, elem) => {
      if ($(elem).text().trim() === 'Sommaire') {
        const novelName = $(elem)
          .closest('ul')
          .siblings('a')
          .first()
          .text()
          .trim();
        const novelUrl = $(elem).find('a').attr('href');

        if (novelUrl && novelName) {
          const urlCover = $(elem).parent().find('a').attr('href');
          if (urlCover) {
            listUrlCover.push(urlCover);
          } else {
            listUrlCover.push('');
          }

          const novel = {
            name: novelName,
            path: novelUrl.replace(this.site, ''),
            cover: defaultCover,
          };
          novels.push(novel);
        }
      }
    });
    return await this.getNovelsCovers(novels, listUrlCover);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
      status: NovelStatus.Unknown,
    };

    const $ = await this.getCheerio(this.site + novelPath);
    let novelUrl = null;

    $('nav div div ul li ul li').each((i, elem) => {
      if ($(elem).find('a').attr('href') === this.site + novelPath) {
        novelUrl = $(elem).parent().find('a').first().attr('href');
        novel.name = $(elem).closest('ul').siblings('a').first().text().trim();
        return;
      }
    });

    if (novelUrl) {
      novel = await this.getNovelInfo(novel, novelUrl);
    }

    const chapterSelectors = [
      '.entry-content ul li a',
      '.entry-content ul li ul li a',
      '.entry-content p a',
      '.entry-content li a',
      '.entry-content blockquote a',
    ].join(', ');

    const chapters: Plugin.ChapterItem[] = [];
    const chapterPaths = new Set<string>();
    $(chapterSelectors).each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).attr('href')?.replace('http://', 'https://');
      if (
        chapterUrl &&
        chapterName &&
        chapterUrl.includes(this.site) &&
        // We remove the unnecessary links to Facebook, X, and the homepage from the chapters.
        !chapterUrl.includes('share=facebook') &&
        !chapterUrl.includes('share=x') &&
        !chapterUrl.includes('/category/traductions/') &&
        !chapterUrl.includes('/category/tour-des-mondes/')
      ) {
        const path = chapterUrl.replace(this.site, '');
        if (chapterPaths.has(path)) return;
        chapterPaths.add(path);
        chapters.push({
          name: chapterName,
          path,
        });
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let body: string;
    try {
      body = await fetchCheckedHtml(this.site + chapterPath);
    } catch (error) {
      const replacement = await this.findMovedChapter(chapterPath);
      if (!replacement) throw error;
      body = await fetchCheckedHtml(replacement);
    }

    const $ = load(body);
    const chapter = $('.entry-content').first().clone();
    chapter
      .find(
        'script, style, ins, iframe, .ads, .sharedaddy, [class*="sharing"], [id*="sharing"]',
      )
      .remove();

    const elements = chapter
      .contents()
      .map((_, element) => $.html(element))
      .get();
    const separators = elements
      .map((element, index) => (/<hr\b/i.test(element) ? index : -1))
      .filter(index => index !== -1);
    const markerIndex = elements.findIndex(
      element =>
        !/<img\b/i.test(element) &&
        [
          'https://fr.tipeee.com/kisswood/',
          '>Sommaire</a>',
          '>Chapitre Suivant</a>',
          '———————————————————————————-',
          'share=facebook',
        ].some(marker => element.includes(marker)),
    );
    const start = separators.length > 1 ? separators[0] + 1 : 0;
    const end =
      separators.length > 1
        ? separators[1]
        : separators.length === 1
          ? separators[0]
          : markerIndex >= 0
            ? markerIndex
            : elements.length;
    const content = elements.slice(start, end).join('\n');
    const parsedContent = load(content);
    if (
      parsedContent.text().replace(/\s+/g, ' ').trim().length < 200 &&
      !parsedContent('img').length
    )
      throw new Error('No readable chapter content found');
    return content;
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

export default new KissWoodPlugin();
