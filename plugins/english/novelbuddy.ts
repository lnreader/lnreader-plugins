import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy.io';
  site = 'https://novelbuddy.io/';
  version = '1.0.4';
  icon = 'src/en/novelbuddy/icon.png';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.book-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.title').text();
      const novelCover =
        'https:' + loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele)
        .find('.title a')
        .attr('href')
        ?.substring(1);

      if (!novelUrl) return;

      const novel = { name: novelName, cover: novelCover, path: novelUrl };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    // create empty query params
    const params = new URLSearchParams();

    // apply all filters
    params.append('sort', filters.orderBy.value.toString());
    params.append('status', filters.status.value.toString());
    if (filters.genre.value instanceof Array) {
      filters.genre.value.forEach(genre => {
        params.append('genre[]', genre.toString());
      });
    }
    params.append('q', filters.keyword.value.toString());
    params.append('page', pageNo.toString());

    const url = `${this.site}search?${params.toString()}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
  
    const $ = parseHTML(body);
  
    const coverSrc =
      $('.img-cover img').attr('data-src') ||
      $('.img-cover img').attr('src') ||
      '';
  
    const normalizeUrl = (url?: string): string => {
      if (!url) return '';
      if (url.startsWith('//')) return `https:${url}`;
      if (url.startsWith('/')) return `${this.site}${url.replace(/^\//, '')}`;
      return url;
    };
  
    const normalizeText = (text: string): string =>
      text.replace(/\s+/g, ' ').replace(/\s*,\s*$/, '').trim();
  
    const getLinkTextList = (root: ReturnType<typeof $>): string[] =>
      root
        .find('a')
        .map((_, el) => normalizeText($(el).text()))
        .toArray()
        .filter(Boolean);
  
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: normalizeText($('.name h1').first().text()) || 'Untitled',
      cover: normalizeUrl(coverSrc),
      summary: normalizeText($('.section-body.summary .content').text()),
      chapters: [],
    };
  
    $('.meta.box p').each((_, el) => {
      const row = $(el);
      const label = normalizeText(row.find('strong').first().text());
      const linkTexts = getLinkTextList(row);
  
      switch (label) {
        case 'Authors :':
          novel.author = linkTexts.join(', ');
          break;
  
        case 'Artists :':
        case 'Artist :':
          novel.artist = linkTexts.join(', ');
          break;
  
        case 'Status :':
          novel.status = linkTexts[0] || normalizeText(row.text().replace(label, ''));
          break;
  
        case 'Genres :':
          novel.genres = linkTexts.join(',');
          break;
      }
    });
  
    const ratingText = normalizeText($('.rating .score').first().text()).replace(
      /[^0-9.]/g,
      '',
    );
    const rating = Number.parseFloat(ratingText);
    if (!Number.isNaN(rating)) {
      novel.rating = rating;
    }
  
    const scriptText = $('script')
      .map((_, el) => $(el).html() || '')
      .toArray()
      .join('\n');
  
    const novelIdMatch = scriptText.match(/bookId\s*=\s*(\d+)\s*;/);
    if (!novelIdMatch) {
      return novel;
    }
  
    const novelId = novelIdMatch[1];
  
    const getChapters = async (id: string): Promise<Plugin.ChapterItem[]> => {
      const chapterListUrl = `${this.site}api/manga/${id}/chapters?source=detail`;
      const chapterResponse = await fetchApi(chapterListUrl);
      const chapterHtml = await chapterResponse.text();
  
      const $$ = parseHTML(chapterHtml);
      const chapters: Plugin.ChapterItem[] = [];
  
      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
  
      const dateRegex = new RegExp(
        `(${months.join('|')})\\s+(\\d{1,2}),\\s+(\\d{4})`,
        'i',
      );
  
      $$('li').each((_, el) => {
        const item = $$(el);
  
        const chapterName = normalizeText(item.find('.chapter-title').text());
        const releaseDateText = normalizeText(item.find('.chapter-update').text());
        const chapterHref = item.find('a').attr('href');
  
        if (!chapterHref) return;
  
        const chapterPath = chapterHref.startsWith('/')
          ? chapterHref.slice(1)
          : chapterHref;
  
        const chapterItem: Plugin.ChapterItem = {
          name: chapterName || 'Untitled',
          path: chapterPath,
        };
  
        const dateMatch = dateRegex.exec(releaseDateText);
        if (dateMatch) {
          const year = Number.parseInt(dateMatch[3], 10);
          const month = months.indexOf(dateMatch[1].toLowerCase());
          const day = Number.parseInt(dateMatch[2], 10);
  
          if (month >= 0) {
            chapterItem.releaseTime = new Date(year, month, day).toISOString();
          }
        } else if (releaseDateText) {
          chapterItem.releaseTime = releaseDateText;
        }
  
        const chapterNumberMatch = chapterName.match(
          /chapter\s+(\d+(?:\.\d+)?)/i,
        );
        if (chapterNumberMatch) {
          chapterItem.chapterNumber = Number.parseFloat(chapterNumberMatch[1]);
        }
  
        chapters.push(chapterItem);
      });
  
      return chapters;
    };
  
    novel.chapters = (await getChapters(novelId)).reverse();
  
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('#listen-chapter').remove();
    loadedCheerio('#google_translate_element').remove();

    const chapterText = loadedCheerio('.chapter__content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?q=${encodeURIComponent(searchTerm)}&page=${page}`;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  filters = {
    orderBy: {
      value: 'views',
      label: 'Order by',
      options: [
        { label: 'Views', value: 'views' },
        { label: 'Updated At', value: 'updated_at' },
        { label: 'Created At', value: 'created_at' },
        { label: 'Name', value: 'name' },
        { label: 'Rating', value: 'rating' },
      ],
      type: FilterTypes.Picker,
    },
    keyword: {
      value: '',
      label: 'Keywords',
      type: FilterTypes.TextInput,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: [],
      label: 'Genres (OR, not AND)',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Action Adventure', value: 'action-adventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventcure', value: 'adventcure' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Adventurer', value: 'adventurer' },
        { label: 'Bender', value: 'bender' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan Fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantas', value: 'fantas' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender', value: 'gender' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'HaremAction', value: 'haremaction' },
        { label: 'Haremv', value: 'haremv' },
        { label: 'Historica', value: 'historica' },
        { label: 'Historical', value: 'historical' },
        { label: 'History', value: 'history' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial', value: 'martial' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Mystery Adventure', value: 'mystery-adventure' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance Adventure', value: 'romance-adventure' },
        { label: 'Romance Harem', value: 'romance-harem' },
        { label: 'Romancem', value: 'romancem' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Superna', value: 'superna' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelBuddy();
