import { Cheerio, CheerioAPI, load, Element } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class XiaowazPlugin implements Plugin.PluginBase {
  id = 'xiaowaz';
  name = 'Xiaowaz';
  icon = 'src/fr/xiaowaz/icon.png';
  site = 'https://xiaowaz.fr';
  version = '1.0.1';
  static novels: Plugin.NovelItem[] | undefined;

  async getCheerio(url: string): Promise<CheerioAPI> {
    let retries = 5; // when fetching for images the sites sometimes terminates the connection
    let returnError: any;
    while (retries > 0) {
      try {
        const r = await fetchApi(url);
        const body = await r.text();
        const $ = load(body);
        return $;
      } catch (error) {
        console.error(error);
        returnError = error;
        retries--;
        // wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(returnError ? returnError : 'Error fetching the page');
  }

  async getAllNovels(): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    let novel: Plugin.NovelItem;
    const $ = await this.getCheerio(this.site);

    const categories: Cheerio<Element>[] = [
      $('li.page_item').find('a:contains("Séries")').parent(),
      $('li.page_item').find('a:contains("Créations")').parent(),
      $('li.page_item').find('a:contains("†")').parent(),
    ];

    categories.forEach(cheerio => {
      cheerio.find('ul.children li').each((i, elem) => {
        const novelName = $(elem).first().text().trim().replace('✔', '');
        const novelUrl = $(elem).find('a').attr('href');

        // Douluo Dalu is no good
        if (novelUrl && novelName && novelName !== 'Douluo Dalu') {
          novel = {
            name: novelName,
            path: novelUrl.replace(this.site, ''),
          };
          novels.push(novel);
        }
      });
    });
    return novels;
  }

  async getNovelsCovers(
    novels: Plugin.NovelItem[],
  ): Promise<Plugin.NovelItem[]> {
    await Promise.all(
      novels.map(async novel => {
        const $novel = await this.getCheerio(this.site + novel.path);
        novel.cover =
          $novel('img[fetchpriority = "high"]').first().attr('src') ||
          $novel('img.aligncenter').first().attr('src') ||
          defaultCover;
      }),
    );
    return novels;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const PAGE_SIZE = 5;

    if (!XiaowazPlugin.novels) XiaowazPlugin.novels = await this.getAllNovels();
    let novels: Plugin.NovelItem[] = XiaowazPlugin.novels;

    const totalPages = Math.ceil(novels.length / PAGE_SIZE);
    if (pageNo > totalPages) return [];

    // splitting novel list to make fewer requests for getting images
    novels = novels.slice(PAGE_SIZE * (pageNo - 1), PAGE_SIZE * pageNo);

    return await this.getNovelsCovers(novels);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    const $ = await this.getCheerio(this.site + novelPath);

    novel.name = $('.card_title').text().trim();
    novel.cover =
      $('img[fetchpriority = "high"]').first().attr('src') ||
      $('img.aligncenter').first().attr('src') ||
      defaultCover;

    novel.status = NovelStatus.Ongoing;
    if (novel.name.charAt(novel.name.length - 1) === '✔') {
      novel.status = NovelStatus.Completed;
      novel.name = novel.name.slice(0, -1);
    } else if (novelPath.startsWith('/series-abandonnees')) {
      novel.status = NovelStatus.Cancelled;
    }

    const entryContentText = $('.entry-content').text();
    novel.author = this.getAuthor(entryContentText);
    novel.genres = this.getGenres(entryContentText);
    if (novelPath.startsWith('/oeuvres-originales')) {
      novel.genres += novel.genres ? ', Oeuvre originale' : 'Oeuvre originale';
    }

    const listeParagraphe: string[] = [];

    const PARAGRAPH_EXCLUDE_LIST = [
      'Écrit par',
      'Ecrit par',
      'Sorties régulières',
      'Auteur\u00A0:',
      'Statut VO\u00A0:',
      'Nom utilisé\u00A0:',
      'Auteur original\u00A0:',
      'Auteur original de l’oeuvre',
      '851 chapitres en',
      'Index\u00A0:',
    ];

    $('.entry-content > p').each((index, element) => {
      const balise = $(element);

      // remove chapter links
      if (balise.find('a[href*="xiaowaz.fr/articles"]').length !== 0)
        return false;

      const textbalise = balise.text();
      if (PARAGRAPH_EXCLUDE_LIST.some(keyword => textbalise.includes(keyword)))
        return false;

      if (
        !textbalise.includes('Genre') &&
        !textbalise.includes('Synopsis') &&
        //Managing the novel 'Rebirth of The Thief Who Roamed The World' to remove these three fields.
        !textbalise.includes('重生之賊行天下') &&
        !textbalise.includes('Rebirth of The Thief Who Roamed The World') &&
        !textbalise.includes(
          'Romance, Comédie, Action, VRMMO, Réincarnation, Futuriste',
        )
      )
        listeParagraphe.push(textbalise);
    });
    novel.summary = listeParagraphe.join('\n').trim();

    //Search for chapter links within ul/li tags; otherwise, within p/a tags,
    //but not both at the same time because otherwise, on the TDG page, it redirects to a PDF download link.
    let pathChapter = $('.entry-content ul li a');
    if (pathChapter.length === 0) {
      pathChapter = $('.entry-content p a');
    }

    const chapters: Plugin.ChapterItem[] = [];
    pathChapter.each((i, elem) => {
      const chapterName = $(elem).text().trim();
      const chapterUrl = $(elem).attr('href');
      if (chapterUrl && chapterUrl.includes(this.site) && chapterName) {
        chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
        });
      }
    });

    novel.chapters = chapters;
    return novel;
  }

  getAuthor(text: string) {
    const regexAuthors = [
      /Écrit par([^\n]*). Traduction/i,
      /Écrit par([^\n]*)./i,
      /Auteur original de l’œuvre\u00A0:([^\n]*)VO/i,
      /Auteur\u00A0:([^\n]*)sur/,
      /Auteur\u00A0:([^\n]*)/,
      /Auteure\u00A0:\u00A0([^\n]*)/,
      /Auteur original de l’oeuvre\u00A0:([^\n]*)/i,
      /Auteur original\u00A0:([^\n]*)/i,
    ];

    for (const regex of regexAuthors) {
      const match = regex.exec(text);
      if (match !== null) {
        return match[1].trim();
      }
    }

    return '';
  }

  getGenres(text: string) {
    // We handle several cases where there are multiple spellings for the word 'genre'. Genre, Genre :, Genres, Genres:
    const regex = /Genre((?:.*?\n)*?)\s*Synopsis\s*/;
    const match = regex.exec(text);
    let genre = '';
    if (match !== null) {
      genre = match[1]
        .replace('\u00A0', ' ')
        .replace('s :', '')
        .replace(':', '')
        .trim();
      if (genre.startsWith('s\n')) {
        genre = genre.replace(/^./, '').trim();
      }
    }
    return genre;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);

    const startTag = $('.wp-post-navigation');
    const endTag = $('.abh_box.abh_box_down.abh_box_business');

    const elementsBetweenTags: string[] = [];
    let footnotesElement: string | null = null;

    if (startTag.length > 0 && endTag.length > 0) {
      let currentElement = startTag.next();
      while (currentElement.length > 0 && !currentElement.is(endTag)) {
        if (
          currentElement.find('p > a[href="https://ko-fi.com/wazouille"]')
            .length > 0
        ) {
          break;
        }
        if (currentElement.hasClass('footnote_container_prepare')) {
          footnotesElement = $.html(currentElement);
        } else {
          let htmlCurrentElement = $.html(currentElement);
          htmlCurrentElement =
            htmlCurrentElement === '<p>&nbsp;</p>'
              ? '<p/>'
              : htmlCurrentElement;
          elementsBetweenTags.push(htmlCurrentElement);
        }
        currentElement = currentElement.next();
      }
    }

    // Place footnotes at the end of the chapter, not at the beginning
    if (footnotesElement) {
      elementsBetweenTags.push(footnotesElement);
    }

    return elementsBetweenTags.join('\n').trim();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    if (!XiaowazPlugin.novels) XiaowazPlugin.novels = await this.getAllNovels();
    const popularNovels = XiaowazPlugin.novels;

    // Normalize the text to remove accents and other special characters
    // This ensures that the search term and novel names are compared accurately
    const novels = popularNovels.filter(novel =>
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

    return await this.getNovelsCovers(novels);
  }
}

export default new XiaowazPlugin();
