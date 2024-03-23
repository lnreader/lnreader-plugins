import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { NovelStatus } from '@libs/novelStatus';

class NovelkiPL implements Plugin.PluginBase {
  id = 'novelki.pl';
  name = 'Novelki';
  icon = 'src/pl/novelki/icon.png';
  site = 'https://novelki.pl';
  version = '1.0.3';

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    //So far is working, If the author of the site changes it, it will have to be changed.
    let link = this.site + '/projekty?filter=t';
    link += '&genre=' + filters.genres.value;
    link += '&status=' + filters.status.value;
    link += '&type=' + filters.type.value;
    link += '&page=' + page;

    const body = await fetchApi(link).then(res => {
      if (res.url == `${this.site}/guest`)
        throw new Error('Failed to load novels (open in web view and login)');
      return res.text();
    });
    const loadedCheerio = parseHTML(body);
    const load = loadedCheerio('#projects > div');

    //if(load.length == 0) throw new Error("Failed to load page (open in web view and login)");

    const novels: Plugin.NovelItem[] = load
      .map((index, element) => ({
        name: loadedCheerio(element)
          .find('.card-title')
          .attr('title') as string,
        cover:
          this.site + loadedCheerio(element).find('.card-img-top').attr('src'),
        path: loadedCheerio(element).find('a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    loadedCheerio('p.h5').each((i, e) => {
      const text = loadedCheerio(e).text().trim();
      if (text.includes('Autor:')) novel.author = text.split(':')[1].trim();
      if (text.includes('Status projektu:')) {
        switch (`${text.split(':')[1].trim()}`.toLowerCase()) {
          case 'wstrzymany':
            novel.status = NovelStatus.OnHiatus;
            break;
          case 'zakończony':
            novel.status = NovelStatus.Completed;
            break;
          case 'aktywny':
            novel.status = NovelStatus.Ongoing;
            break;
          case 'porzucony':
            novel.status = NovelStatus.Cancelled;
            break;
          case 'zlicencjonowany':
            novel.status = NovelStatus.Licensed;
            break;
          default:
            novel.status = NovelStatus.Unknown;
            break;
        }
      }
    });
    novel.name = loadedCheerio('div.col-sm-12.col-md-6.col-lg-8.mb-5')
      .find('h3')
      .text()
      .trim();
    novel.cover = this.site + loadedCheerio('.img-fluid').attr('src'); // TODO: return not only undefined

    novel.genres = loadedCheerio('span.badge')
      .map((i, e) => loadedCheerio(e).text())
      .get()
      .join(', ');

    novel.summary = loadedCheerio('.h5:contains("Opis:")')
      .next('p')
      .next('p')
      .text()
      .trim();

    //TODO: Dodać tłumacza danej serii :D

    let chapters: Plugin.ChapterItem[] = [];

    let chaptersList = loadedCheerio('.chapters > .col-md-3 > div').get();
    chaptersList.forEach((e, i) => {
      let urlChapters = loadedCheerio(e).find('a').attr('href') || '';

      const chapter: Plugin.ChapterItem = {
        name: loadedCheerio(e).find('a')?.text().trim(),
        path: urlChapters,
        releaseTime: loadedCheerio(e)
          .find('.card-footer > span')
          .text()
          .trim()
          .split('-')
          .reverse()
          .join('-'),
        chapterNumber: chaptersList.length - i,
      };
      chapters.push(chapter);
    });

    novel.chapters = chapters.reverse();
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    var pattern = /\/projekty\/([^\/]+)\/([^\/]+)/;
    let codeChapter = pattern.exec(chapterPath) || '';
    const body = await fetchApi(
      `${this.site}/api/reader/chapters/${codeChapter[2]}`,
    ).then(res => {
      if (res.url == `${this.site}/guest`)
        throw new Error('Failed to load chapter (open in web view and login)');
      return res.json();
    });

    const chapterText = body.data.content;
    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(
      `${this.site}/projekty?filter=t&title=${searchTerm}+&page=${page}`,
    ).then(res => {
      if (res.url == `${this.site}/guest`)
        throw new Error('Failed to search novels (open in web view and login)');
      return res.text();
    });
    const loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = loadedCheerio('#projects > div')
      .map((index, element) => ({
        name: loadedCheerio(element)
          .find('.card-title')
          .attr('title') as string,
        cover:
          this.site + loadedCheerio(element).find('.card-img-top').attr('src'),
        path: loadedCheerio(element).find('a').attr('href') || '',
      }))
      .get()
      .filter(novel => novel.name && novel.path);

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    // if your plugin has images and they won't load
    // this is the function to fiddle with
    return fetchFile(url);
  }
  filters = {
    genres: {
      value: '',
      label: 'Genre',
      options: [
        { label: 'Wybierz gatunek', value: '' },
        { label: 'Adaptacja do anime', value: '35' },
        { label: 'Adaptacja do dramy', value: '40' },
        { label: 'Adaptacja do mangi', value: '36' },
        { label: 'Akcja', value: '1' },
        { label: 'Boys Love', value: '22' },
        { label: 'Bromans', value: '33' },
        { label: 'Dojrzały', value: '11' },
        { label: 'Dramat', value: '10' },
        { label: 'Ecchi', value: '29' },
        { label: 'Fantasy', value: '2' },
        { label: 'Gender Bender', value: '28' },
        { label: 'Girls Love', value: '23' },
        { label: 'Harem', value: '8' },
        { label: 'Hentai', value: '43' },
        { label: 'Historyczny', value: '30' },
        { label: 'Horror', value: '15' },
        { label: 'Isekai', value: '44' },
        { label: 'Josei', value: '27' },
        { label: 'Komedia', value: '3' },
        { label: 'Mecha', value: '16' },
        { label: 'Nadprzyrodzone', value: '9' },
        { label: 'Okruchy życia', value: '18' },
        { label: 'Oneshot', value: '41' },
        { label: 'Parodia', value: '19' },
        { label: 'Przygodowy', value: '4' },
        { label: 'Psychologiczny', value: '12' },
        { label: 'Reinkarnacja', value: '42' },
        { label: 'Romans', value: '7' },
        { label: 'RPG', value: '17' },
        { label: 'Sci-fi', value: '21' },
        { label: 'Seinen', value: '26' },
        { label: 'Shoujo', value: '25' },
        { label: 'Shounen', value: '24' },
        { label: 'Smut', value: '31' },
        { label: 'Sport', value: '32' },
        { label: 'Świat gry', value: '5' },
        { label: 'Szkolne życie', value: '20' },
        { label: 'Sztuki walki', value: '6' },
        { label: 'Tajemnica', value: '14' },
        { label: 'Tragedia', value: '13' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'Wybierz status', value: '' },
        { label: 'Zakończony', value: '0' },
        { label: 'Aktywny', value: '1' },
        { label: 'Porzucony', value: '2' },
        { label: 'Wstrzymany', value: '3' },
        { label: 'Zlicencjonowany', value: '4' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      label: 'Type',
      value: '',
      options: [
        { label: 'Wybierz typ', value: '' },
        { label: 'Nie zdefiniowano', value: '0' },
        { label: 'Light Novel', value: '1' },
        { label: 'Wuxia', value: '2' },
        { label: 'Xianxia', value: '3' },
        { label: 'Web Novel', value: '4' },
        { label: 'Autorska', value: '5' },
        { label: 'Inne', value: '6' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelkiPL();
