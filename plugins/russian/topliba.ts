import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { fetchApi } from '@libs/fetch';
import { load as parseHTML } from 'cheerio';

class TopLiba implements Plugin.PluginBase {
  id = 'TopLiba';
  name = 'ТопЛиба';
  site = 'https://topliba.com';
  version = '1.0.0';
  icon = 'src/ru/topliba/icon.png';
  _token = '';

  async fetchNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
    searchTerm?: string,
  ): Promise<Plugin.NovelItem[]> {
    const data = new URLSearchParams({
      order_field: showLatestNovels ? 'date' : filters?.sort?.value || 'rating',
      p: page,
    });

    if (searchTerm) data.append('q', searchTerm);
    const body = await fetchApi(this.site + '/?' + data.toString()).then(res =>
      res.text(),
    );
    const novels: Plugin.NovelItem[] = [];

    this._token = body.match(/<meta name="_token" content="(.*?)"/)?.[1];

    const elements = body.match(/<img class="cover" data-original=".*>/g) || [];
    elements.forEach(element => {
      const [, path, name] =
        element.match(/data-original=".*covers\/(.*?)_.*title="(.*?)"/) || [];
      if (path && name) {
        novels.push({
          name,
          cover: this.site + '/covers/' + path + '.jpg',
          path,
        });
      }
    });

    return novels;
  }

  popularNovels = this.fetchNovels;

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const defaultOptions: any = {
      showLatestNovels: false,
      filters: {},
    };
    return this.fetchNovels(page, defaultOptions, searchTerm);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.resolveUrl(novelPath, true)).then(res =>
      res.text(),
    );
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div > h1').text().trim(),
      cover: this.site + '/covers/' + novelPath + '.jpg',
      summary: loadedCheerio('.description').text().trim(),
      author: loadedCheerio('.book-author > a').text().trim(),
      genres: loadedCheerio('.book-genres > div > a')
        .map((index, element) => loadedCheerio(element).text())
        .get()
        .join(','),
    };

    const chaptersHTML = await fetchApi(this.resolveUrl(novelPath)).then(res =>
      res.text(),
    );

    this._token =
      chaptersHTML.match(/<meta name="_token" content="(.*?)"/)?.[1] ||
      body.match(/<meta name="_token" content="(.*?)"/)?.[1] ||
      this._token;

    const chapters: Plugin.ChapterItem[] = [];
    const elements =
      chaptersHTML.match(
        /<li class="padding-\d+" data-capter="\d+">([\s\S]*?)</g,
      ) || [];
    elements.forEach((chapter, chapterIndex) => {
      const [, padding, capter, name] =
        chapter.match(
          /class="padding-(\d+)" data-capter="(\d+)">([\s\S]*?)</,
        ) || [];

      if (padding && capter && name) {
        const id =
          padding === '0' ? capter : padding + '-' + (parseInt(capter, 10) - 1);

        chapters.push({
          name: name.trim(),
          path: novelPath + '?' + id,
          releaseTime: null,
          chapterNumber: chapterIndex + 1,
        });
      }
    });

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [bookID, chapterID] = chapterPath.split('?');
    if (!this._token) {
      const chaptersHTML = await fetchApi(this.resolveUrl(bookID)).then(res =>
        res.text(),
      );
      this._token = chaptersHTML.match(
        /<meta name="_token" content="(.*?)"/,
      )?.[1];
    }

    const chapterText = await fetchApi(this.resolveUrl(bookID) + '/chapter', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: this.resolveUrl(bookID),
        Origin: this.site,
      },
      method: 'POST',
      body: new URLSearchParams({
        chapter: chapterID,
        _token: this._token,
      }).toString(),
    }).then(res => res.text());

    return chapterText;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + (isNovel ? '/books/' + path : '/reader/' + path.split('?')[0]);

  filters = {
    sort: {
      label: 'Сортировка:',
      value: 'rating',
      options: [
        { label: 'По рейтингу', value: 'rating' },
        { label: 'По популярности', value: 'num_downloads' },
        { label: 'По году выхода', value: 'year' },
        { label: 'По дате добавления', value: 'date' },
        { label: 'По названию', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new TopLiba();
