import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class LSHNovel implements Plugin.PluginBase {
  id = 'lshnovel';
  name = 'Liebe Schnee Hiver Novel';
  icon = 'multisrc/wpmangastream/icons/lshnovel.png';
  site = 'https://lshnovel.com/';
  version = '1.0.0';

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}series/?page=${pageNo}`;

    if (filters.genres.value.length) {
      link += filters.genres.value.map(i => `&genre[]=${i}`).join('');
    }

    if (filters.type.value.length)
      link += filters.type.value.map(i => `&lang[]=${i}`).join('');

    link += '&status=' + filters.status;

    link += '&order=' + filters.order;

    const headers = new Headers();
    const body = await fetchApi(link, { headers }).then(result =>
      result.text(),
    );

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('article.bs').each(function () {
      const novelName = loadedCheerio(this).find('.ntitle').text().trim();
      let image = loadedCheerio(this).find('img');
      const novelCover = image.attr('data-src') || image.attr('src');

      const novelUrl = loadedCheerio(this).find('a').attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        url: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const url = novelUrl;
    const headers = new Headers();
    const result = await fetchApi(url, { headers });
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      url,
      chapters: [],
    };

    novel.name = loadedCheerio('.entry-title').text();

    novel.cover =
      loadedCheerio('img.wp-post-image').attr('data-src') ||
      loadedCheerio('img.wp-post-image').attr('src');

    loadedCheerio('div.spe > span').each(function () {
      const detailName = loadedCheerio(this).find('b').text().trim();
      const detail = loadedCheerio(this).find('b').remove().end().text().trim();

      switch (detailName) {
        case 'Yazar:':
          novel.author = detail;
          break;
        case 'Seviye:':
          novel.status = detail;
          break;
      }
    });

    novel.genres = loadedCheerio('.genxed').text().trim().replace(/\s/g, ',');

    loadedCheerio('div[itemprop="description"]  h3,p.a,strong').remove();
    novel.summary = loadedCheerio('div[itemprop="description"]')
      .find('br')
      .replaceWith('\n')
      .end()
      .text();

    let chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('.eplister')
      .find('li')
      .each(function () {
        const chapterName =
          loadedCheerio(this).find('.epl-num').text() +
          ' - ' +
          loadedCheerio(this).find('.epl-title').text();

        const releaseDate = loadedCheerio(this).find('.epl-date').text().trim();

        const chapterUrl = loadedCheerio(this).find('a').attr('href');

        if (!chapterUrl) return;

        chapter.push({
          name: chapterName,
          releaseTime: releaseDate,
          url: chapterUrl,
        });
      });

    novel.chapters = chapter.reverse();

    return novel;
  }
  async parseChapter(chapterUrl: string): Promise<string> {
    const headers = new Headers();
    const result = await fetchApi(chapterUrl, { headers });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('.epcontent').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo?: number | undefined,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}?s=${searchTerm}`;
    const headers = new Headers();
    const result = await fetchApi(url, { headers });
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('article.bs').each(function () {
      const novelName = loadedCheerio(this).find('.ntitle').text().trim();
      const novelCover = loadedCheerio(this).find('img').attr('src');
      const novelUrl = loadedCheerio(this).find('a').attr('href');
      if (!novelUrl) return;

      novels.push({
        name: novelName,
        url: novelUrl,
        cover: novelCover,
      });
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    order: {
      value: 'popular',
      label: 'Önerilen',
      options: [
        { label: 'Varsayılan', value: '' },

        { label: 'A-Z', value: 'title' },

        { label: 'Z-A', value: 'titlereverse' },

        { label: 'Son Yüklemeler', value: 'update' },

        { label: 'Son Eklenenler', value: 'latest' },

        { label: 'Bestimiz', value: 'popular' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Statü',
      value: '',
      options: [
        { label: 'Tümü', value: '' },

        { label: 'Ongoing', value: 'ongoing' },

        { label: 'Hiatus', value: 'hiatus' },

        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      value: [],
      label: 'Tür',
      options: [
        { label: 'Çeviri Novel', value: 'ceviri-novel' },

        { label: 'Liz-Chan', value: 'liz-chan' },

        { label: 'Manhwa', value: 'manhwa' },

        { label: 'Orijinal Novel', value: 'orijinal-novel' },

        { label: 'Web Novel', value: 'web-novel' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genres: {
      value: [],
      label: 'Kategori',
      options: [
        { label: '+18', value: '18' },

        { label: 'Action', value: 'action' },

        { label: 'Adult', value: 'adult' },

        { label: 'Aksiyon', value: 'aksiyon' },

        { label: 'BL', value: 'bl' },

        { label: 'Comedy', value: 'comedy' },

        { label: 'Doğaüstü', value: 'dogaustu' },

        { label: 'Dram', value: 'dram' },

        { label: 'Drama', value: 'drama' },

        { label: 'Ecchi', value: 'ecchi' },

        { label: 'Fantastik', value: 'fantastik' },

        { label: 'Fantasy', value: 'fantasy' },

        { label: 'Gizem', value: 'gizem' },

        { label: 'Harem', value: 'harem' },

        { label: 'Historical', value: 'historical' },

        { label: 'Josei', value: 'josei' },

        { label: 'Macera', value: 'macera' },

        { label: 'Manhwa', value: 'manhwa' },

        { label: 'Martial Arts', value: 'martial-arts' },

        { label: 'Mature', value: 'mature' },

        { label: 'Novel', value: 'novel' },

        { label: 'Okul', value: 'okul' },

        { label: 'Psikolojik', value: 'psikolojik' },

        { label: 'Psychological', value: 'psychological' },

        { label: 'Reverse Harem', value: 'reverse-harem' },

        { label: 'Romance', value: 'romance' },

        { label: 'Romantik', value: 'romantik' },

        { label: 'Shoujo', value: 'shoujo' },

        { label: 'Slice Of Life', value: 'slice-of-life' },

        { label: 'Smut', value: 'smut' },

        { label: 'Supernatural', value: 'supernatural' },

        { label: 'Tarihi', value: 'tarihi' },

        { label: 'Tragedy', value: 'tragedy' },

        { label: 'Yaoi', value: 'yaoi' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new LSHNovel();
