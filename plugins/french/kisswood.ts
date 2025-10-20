import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class KissWoodPlugin implements Plugin.PluginBase {
  id = 'kisswood';
  name = 'KissWood';
  icon = 'src/fr/kisswood/icon.png';
  site = 'https://kisswood.eu';
  version = '1.0.0';

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    const body = await r.text();
    const $ = load(body);
    return $;
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
      status: NovelStatus.Ongoing,
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
        !chapterUrl.includes('/category/tour-des-mondes/') &&
        // Removal of duplicates
        !chapters.some(chapter => this.site + chapter.path === chapterUrl)
      ) {
        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
        });
      }
    });
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    const elements: string[] = $('.entry-content')
      .contents()
      .map((_, el) => $.html(el))
      .get();

    let hrIndexes: number[] = elements
      .map((elem, index) => (elem.includes('<hr>') ? index : -1))
      .filter(index => index !== -1);

    if (hrIndexes.length === 0) {
      hrIndexes = [
        0,
        elements.findIndex(
          element =>
            element.includes('https://fr.tipeee.com/kisswood/') ||
            element.includes('>Sommaire</a>') ||
            element.includes('>Chapitre Suivant</a>') ||
            element.includes('———————————————————————————-') ||
            element.includes('share=facebook'),
        ),
      ];
    } else if (hrIndexes.length === 1) {
      hrIndexes.unshift(0);
    } else {
      hrIndexes[0] += 1;
    }
    return elements.slice(hrIndexes[0], hrIndexes[1]).join('\n');
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
