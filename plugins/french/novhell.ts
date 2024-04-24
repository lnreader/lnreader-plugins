import { CheerioAPI, load } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovhellPlugin implements Plugin.PluginBase {
  id = 'novhell';
  name = 'Novhell';
  icon = 'src/fr/novhell/icon.png';
  site = 'https://novhell.org';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: { 'Accept-Encoding': 'deflate' },
    });
    const body = await r.text();
    const $ = load(body);
    return $;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const novels: Plugin.NovelItem[] = [];
    let novel: Plugin.NovelItem;
    let url = this.site;
    let $ = await this.getCheerio(url);
    $('article div div div figure').each((i, elem) => {
      let novelName = $(elem)
        .find('figcaption span strong')
        .first()
        .text()
        .trim();
      if (!novelName || novelName.trim() === '') {
        novelName = $(elem).find('figcaption a strong').first().text().trim();
      }
      const novelCover = $(elem).find('a img').attr('src');
      const novelUrl = $(elem).find('a').attr('href');

      if (novelUrl && novelName) {
        novel = {
          name: novelName,
          cover: novelCover,
          path: novelUrl.replace(this.site, ''),
        };
        novels.push(novel);
      }
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    let $ = await this.getCheerio(this.site + novelPath);

    novel.name =
      $('meta[property="og:title"]')
        .attr('content')
        ?.replace('- NovHell', '') || '';
    novel.cover =
      $('section div div div div div img').first().attr('src') || defaultCover;
    novel.status = NovelStatus.Ongoing;
    novel.author = $("strong:contains('Ecrit par ')")
      .parent()
      .text()
      .replace('Ecrit par ', '')
      .trim();

    if (!novel.author) {
      novel.author = $("div p:contains('Auteur')")
        .text()
        .replace('Auteur', '')
        .replace(':', '')
        .trim();
    }
    if (!novel.author) {
      novel.author = $("div p:contains('Ecrit par :')")
        .text()
        .replace('Ecrit par :', '')
        .trim();
    }
    novel.genres = $("strong:contains('Genre')")
      .parent()
      .text()
      .replace('Genre', '')
      .replace(':', '')
      .trim();
    if (!novel.genres) {
      novel.genres = $("div p:contains('Genre')")
        .text()
        .replace('Genre', '')
        .replace(':', '')
        .trim();
    }
    novel.summary = $("strong:contains('Synopsis')")
      .parent()
      .parent()
      .text()
      .replace('Synopsis', '')
      .replace('Synopsis', '')
      .replace(':', '')
      .trim();
    let chapters: Plugin.ChapterItem[] = [];

    $('main div article div div section div div div div div p a').each(
      (i, elem) => {
        // Replace non-breaking spaces with a 'normal' space.
        const chapterName = $(elem)
          .text()
          .replace(/\u00A0/g, ' ')
          .trim();
        const chapterUrl = $(elem).attr('href');
        // Check if the chapter URL exists and contains the site name.
        if (chapterUrl && chapterUrl.includes(this.site)) {
          const regex = /Chapitre (\d+)/g;
          let chapterNumber = 0;
          let match;
          while ((match = regex.exec(chapterName)) !== null) {
            const number = parseInt(match[1]);
            chapterNumber += number;
          }
          chapters.push({
            name: chapterName,
            path: chapterUrl.replace(this.site, ''),
            chapterNumber: chapterNumber,
          });
        }
      },
    );

    // Sort the chapters array based on the chapter numbers.
    // We retrieve the chapters in the order 1-6-11-16-21-......
    novel.chapters = chapters.sort((chapterA, chapterB) => {
      if (
        chapterA.chapterNumber !== undefined &&
        chapterB.chapterNumber !== undefined
      ) {
        return chapterA.chapterNumber - chapterB.chapterNumber;
      }
      if (chapterA.chapterNumber === undefined) {
        return 1;
      } else {
        return -1;
      }
    });
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    const sections = $('main article div div section');
    if (sections) {
      const numberOfSection = sections.length;
      const title = sections.eq(numberOfSection - 3);
      const chapitre = sections.eq(numberOfSection - 2);
      if (title && chapitre) {
        return (title.html() || '') + (chapitre.html() || '');
      }
    }
    return '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    let popularNovels = this.popularNovels(1, {
      showLatestNovels: true,
      filters: undefined,
    });

    let novels = (await popularNovels).filter(novel =>
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

  async fetchImage(url: string): Promise<string | undefined> {
    // if your plugin has images and they won't load
    // this is the function to fiddle with
    return fetchFile(url);
  }
}

export default new NovhellPlugin();
