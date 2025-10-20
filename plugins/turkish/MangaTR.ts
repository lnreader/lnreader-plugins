import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class MangaTR implements Plugin.PluginBase {
  id = 'mangatr';
  name = 'MangaTR';
  icon = 'src/tr/mangatr/icon.png';
  site = 'https://manga-tr.com/';
  version = '1.0.0';

  opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
    },
  };

  /**
   * @param novelPath
   * @returns novel metadata and its first page
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('#tables').text(),
      cover: loadedCheerio(
        '#myCarousel > div.container > div.col-lg-4.col-sm-4 > img',
      ).attr('src'),
      status: loadedCheerio(
        '#tab1 > table:nth-child(2) > tbody > tr:nth-child(2) > td:nth-last-child(2) > a',
      ).text(),
      chapters: [],
      author: loadedCheerio(
        '#tab1 > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(1) > a',
      )
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join(','),
      artist: loadedCheerio(
        '#tab1 > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(2) > a',
      )
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join(','),
      genres: loadedCheerio(
        '#tab1 > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(3) > a',
      )
        .map((i, el) => loadedCheerio(el).text())
        .get()
        .join(','),
    };

    const summary = loadedCheerio('#tab1 > div.well');
    // remove h3 and div from children
    summary.children().remove('h3, div');
    novel.summary = summary.text().trim();

    const chapters: Plugin.ChapterItem[] = [];

    // path = manga-the-last-adventurer.html
    // title = the-last-adventurer
    const title = novelPath.split('.html')[0].slice(6);

    const url = `${this.site}cek/fetch_pages_manga.php?manga_cek=${title}`;

    // make post request to url with form data page=1
    const response = await fetchApi(url, {
      ...this.opts,
      body: 'page=1',
    });

    const page1 = parseHTML(await response.text());

    const firstPage = 1;
    const lastPage = parseInt(
      page1('a[title="Last"]').first().attr('data-page') ?? '1',
    );

    let pageDatas = await Promise.all(
      Array.from({ length: lastPage - firstPage }, (_, i) => {
        return fetchApi(url, {
          ...this.opts,
          body: `page=${firstPage + i + 1}`,
        }).then(r => r.text());
      }),
    ).then(pages => pages.map(p => parseHTML(p)));

    pageDatas = [page1, ...pageDatas];

    // Most titles have the year number in them (e.g. (2021)) and chapter titles do not, so remove
    const novelTitle = novel.name
      .toLocaleLowerCase()
      .replace(/\([0-9]+\)/g, '')
      .trim();

    // Go through each page and get the chapters
    for (const page of pageDatas) {
      // For each chapter
      page('body > ul > table > tbody > tr').each((_, el) => {
        const chap = page(el);

        const chapTitle1 = chap.find('td:nth-child(1) > a').text();
        const updatedChapTitle1 = chapTitle1
          .toLocaleLowerCase()
          .replace(novelTitle, 'Ch')
          .trim();
        const chapTitle2 = chap.find('td:nth-child(1) > div').text();

        const chapPath = chap.find('td:nth-child(1) > a').attr('href') ?? '';

        if (chapPath === '') return;

        chapters.push({
          name:
            chapTitle2 !== ''
              ? `${updatedChapTitle1}: ${chapTitle2}`
              : updatedChapTitle1,
          path: chapPath,
          chapterNumber: parseFloat(chapTitle1.replace(/[^0-9.]/g, '')),
        });
      });
    }

    if (chapters.length > 0) {
      novel.chapters = chapters.reverse();
    }
    return novel;
  }

  popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.append('page', pageNo.toString());
    if (showLatestNovels == true) {
      params.append('sort', 'last_update');
      params.append('sort_type', 'DESC');
    } else {
      params.append('durum', filters.status.value.toString()); // status
      params.append('ceviri', ''); // translation status
      params.append('yas', filters.age.value.toString()); // age
      params.append('icerik', '2'); // content type -> always novel (2)
      params.append('tur', filters.genre.value.toString()); // genre (only 1)
      params.append('sort', filters.sort.value.toString());
      params.append('sort_type', filters.sort_type.value.toString());
    }

    const url = `${this.site}manga-list-sayfala.html?${params.toString()}`;

    const parseNovels = (loadedCheerio: CheerioAPI): Plugin.NovelItem[] => {
      return loadedCheerio(
        '#myCarousel > div.container > div:nth-child(3) > div.col-lg-9.col-md-8 > div.col-md-12',
      )
        .map((_, el) => {
          const novel = loadedCheerio(el);
          return {
            name: novel.find('#tables').text(),
            path: novel.find('#tables > a').attr('href') ?? '',
            cover: novel.find('img.img-thumb').first().attr('src') ?? '',
          };
        })
        .toArray();
    };

    return fetchApi(url)
      .then(r => r.text())
      .then(body => {
        const loadedCheerio = parseHTML(body);
        return parseNovels(loadedCheerio);
      });
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());
    const loadedCheerio = parseHTML(body);

    const content = loadedCheerio('#well');

    return content.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // Not paginated, so we should paginate results ourselves to prevent overloading
    const ITEMS_PER_PAGE = 50;

    const params = new URLSearchParams();
    params.append('icerik', searchTerm);

    const url = `${this.site}arama.html?${params.toString()}`;

    const parseNovels = async (
      loadedCheerio: CheerioAPI,
    ): Promise<Plugin.NovelItem[]> => {
      const novels: Plugin.NovelItem[] = [];

      let curr = 0;

      for (const el of loadedCheerio('div.char > a + span').toArray()) {
        // Done!
        if (novels.length === ITEMS_PER_PAGE) break;
        // Skip if not a novel
        if (
          loadedCheerio(el).text().trim().toLowerCase() != 'novel' &&
          loadedCheerio(el).next().text().trim().toLowerCase() != 'novel'
        ) {
          continue;
        }
        // Skip for pagination
        if ((pageNo - 1) * ITEMS_PER_PAGE > curr) {
          curr++;
          continue;
        }

        const novelCheerio = loadedCheerio(el).prev();

        const mangaSlug = novelCheerio.attr('manga-slug') ?? '';

        novels.push({
          name: novelCheerio.text(),
          path: novelCheerio.attr('href') ?? '',
          cover: mangaSlug, // NOTE: This slug gets replaced with the actual cover image later (see below)
        });
      }

      // Get all cover images in parallel
      return await Promise.all(
        novels.map(async novel => {
          const url = `${this.site}app/manga/controllers/cont.pop.php`;
          const response = await fetchApi(url, {
            ...this.opts,
            body: `slug=${novel.cover}`,
          });
          const body = await response.text();
          const imgCheerio = parseHTML(body);
          const img = imgCheerio('img').first().attr('src');

          novel.cover = img;
          return novel;
        }),
      );
    };

    return fetchApi(url)
      .then(r => r.text())
      .then(body => {
        const loadedCheerio = parseHTML(body);
        return parseNovels(loadedCheerio);
      });
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }

  filters = {
    sort: {
      value: 'views',
      label: 'Sırala',
      options: [
        { label: 'Adı', value: 'name' },
        { label: 'Popülarite', value: 'views' },
        { label: 'Son Güncelleme', value: 'last_update' },
      ],
      type: FilterTypes.Picker,
    },
    sort_type: {
      value: 'DESC',
      label: 'Sırala Türü',
      options: [
        { label: 'ASC', value: 'ASC' },
        { label: 'DESC', value: 'DESC' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: '',
      label: 'Durum',
      options: [
        { label: 'Hepsi', value: '' },
        { label: 'Yayınlanması Tamamlanan', value: '1' },
        { label: 'Devam Eden', value: '2' },
      ],
      type: FilterTypes.Picker,
    },
    translation: {
      value: '',
      label: 'Çeviri Durumu',
      options: [
        { label: 'Hepsi', value: '' },
        { label: 'Çevirisi Tamamlanan', value: '1' },
        { label: 'Devam Eden', value: '4' },
        { label: 'Bırakılan', value: '2' },
        { label: 'Olmayan', value: '3' },
      ],
      type: FilterTypes.Picker,
    },
    age: {
      value: '',
      label: 'Yas',
      options: [
        { label: 'Hepsi', value: '' },
        { label: '+16', value: '16' },
        { label: '+18', value: '18' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Tür',
      options: [
        { label: 'Hepsi', value: '' },
        { label: '4 Koma', value: '4_Koma' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Aliens', value: 'Aliens' },
        { label: 'Art', value: 'Art' },
        { label: 'Biography', value: 'Biography' },
        { label: 'Bishoujo', value: 'Bishoujo' },
        { label: 'Bishounen', value: 'Bishounen' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Crime', value: 'Crime' },
        { label: 'Demons', value: 'Demons' },
        { label: 'Doujinshi', value: 'Doujinshi' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Gore', value: 'Gore' },
        { label: 'Harem', value: 'Harem' },
        { label: 'History', value: 'History' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Isekai', value: 'Isekai' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Magic', value: 'Magic' },
        { label: 'Manhua', value: 'Manhua' },
        { label: 'Manhwa', value: 'Manhwa' },
        { label: 'Martial', value: 'Martial' },
        { label: 'Mecha', value: 'Mecha' },
        { label: 'Military', value: 'Military' },
        { label: 'Miscellaneous', value: 'Miscellaneous' },
        { label: 'Monster', value: 'Monster' },
        { label: 'Musical', value: 'Musical' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Novel', value: 'Novel' },
        { label: 'Nudity', value: 'Nudity' },
        { label: 'One Shot', value: 'One_Shot' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'School', value: 'School' },
        { label: 'Sci fi', value: 'Sci_fi' },
        { label: 'Short', value: 'Short' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Shoujo Ai', value: 'Shoujo_Ai' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Shounen Ai', value: 'Shounen_Ai' },
        { label: 'Slice of life', value: 'Slice of life' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Space', value: 'Space' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Thriller', value: 'Thriller' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Türkçe Novel', value: 'Türkçe Novel' },
        { label: 'Vampires', value: 'Vampires' },
        { label: 'Violence', value: 'Violence' },
        { label: 'War', value: 'War' },
        { label: 'Webtoon', value: 'Webtoon' },
        { label: 'Western', value: 'Western' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new MangaTR();
