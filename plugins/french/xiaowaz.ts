import { CheerioAPI, load } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class XiaowazPlugin implements Plugin.PluginBase {
  id = 'xiaowaz';
  name = 'Xiaowaz';
  icon = 'src/fr/xiaowaz/icon.png';
  site = 'https://xiaowaz.fr';
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
    $('li.page_item.page-item-866.page_item_has_children ul.children li').each(
      (i, elem) => {
        let novelName = $(elem).first().text().trim();
        if (novelName.charAt(novelName.length - 1) === '✔') {
          novelName = novelName.slice(0, -1);
        }
        const novelUrl = $(elem).find('a').attr('href');

        if (novelUrl && novelName) {
          novel = {
            name: novelName,
            cover: defaultCover,
            path: novelUrl.replace(this.site, ''),
          };
          novels.push(novel);
        }
      },
    );
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Sans titre',
    };

    let $ = await this.getCheerio(this.site + novelPath);

    novel.name = $('.card_title').text().trim();
    novel.cover =
      $('.entry-content p img').first().attr('src') ||
      $('.entry-content h4 img').first().attr('src') ||
      defaultCover;

    novel.status = NovelStatus.Ongoing;
    if (novel.name.charAt(novel.name.length - 1) === '✔') {
      novel.status = NovelStatus.Completed;
      novel.name = novel.name.slice(0, -1);
    }

    const entryContentText = $('.entry-content').text();
    novel.author = this.getAuthor(entryContentText);
    novel.genres = this.getGenres(entryContentText);

    const listeParagraphe: string[] = [];

    const PARAGRAPH_EXCLUDE_LIST = [
      'Écrit par',
      'Ecrit par',
      'Sorties régulières le mardi et vendredi\u00A0!',
      'Auteur\u00A0:',
      'Statut VO\u00A0:',
      'Nom utilisé\u00A0:',
      'Auteur original\u00A0:',
      'Auteur original de l’oeuvre',
      '851 chapitres en',
    ];

    $('.entry-content p').each((index, element) => {
      const balise = $(element);
      const textbalise = balise.text();
      if (
        PARAGRAPH_EXCLUDE_LIST.some(keyword => textbalise.includes(keyword))
      ) {
        return false;
      }
      if (
        !textbalise.includes('Genre') &&
        !textbalise.includes('Synopsis') &&
        //Managing the novel 'Rebirth of The Thief Who Roamed The World' to remove these three fields.
        !textbalise.includes('重生之賊行天下') &&
        !textbalise.includes('Rebirth of The Thief Who Roamed The World') &&
        !textbalise.includes(
          'Romance, Comédie, Action, VRMMO, Réincarnation, Futuriste',
        )
      ) {
        listeParagraphe.push(textbalise);
      }
    });
    novel.summary = listeParagraphe.join('\n').trim();

    //Search for chapter links within ul/li tags; otherwise, within p/a tags,
    //but not both at the same time because otherwise, on the TDG page, it redirects to a PDF download link.
    var pathChapter = $('.entry-content ul li a');
    if (pathChapter.length === 0) {
      pathChapter = $('.entry-content p a');
    }

    let chapters: Plugin.ChapterItem[] = [];
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
      /Auteur original de l’œuvre\u00A0:([^\n]*)VO/i,
      /Auteur\u00A0:([^\n]*)sur/,
      /Auteur\u00A0:([^\n]*)/,
      /Auteure\u00A0:\u00A0([^\n]*)/,
      /Auteur original de l’oeuvre\u00A0:([^\n]*)/i,
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

export default new XiaowazPlugin();
