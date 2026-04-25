import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class NovelBuddy implements Plugin.PagePlugin {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  api = 'https://api.novelbuddy.com/';
  version = '2.1.3';
  icon = 'src/en/novelbuddy/icon.png';

  parseNovels(body: Response): Plugin.NovelItem[] {
    return body.data.items.map(item => ({
      name: item.name,
      path: new URL(item.url, this.site).pathname.substring(1),
      cover: item.cover,
    }));
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { genre, min_ch, max_ch, status, demo, orderBy, keyword } = filters;

    // Chapter bounds must be an integer between 0 and 10,000 or api cri
    const parseNumber = (val?: string) => {
      if (!val?.trim()) return;

      const n = Number(val);
      return Number.isInteger(n) && n >= 0 && n <= 10000
        ? String(n)
        : undefined;
    };

    const rawParams: Record<string, string | undefined> = {
      genres: genre.value.include?.join(',') || undefined,
      exclude: genre.value.exclude?.join(',') || undefined,
      min_ch: parseNumber(min_ch.value),
      max_ch: parseNumber(max_ch.value),
      status: String(status.value),
      demographic: demo.value?.join(',') || undefined,
      sort: String(orderBy.value),
      page: String(pageNo),
      limit: '24',
      q: keyword.value || undefined,
    };

    // Filter out the undefined values
    const params = Object.fromEntries(
      Object.entries(rawParams).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    if (!initialManga) throw new Error('Could not find initialManga data');

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: initialManga.name || 'Untitled',
      cover: initialManga.cover,
      author: initialManga.authors?.map(a => a.name).join(', ') || '',
      artist: initialManga.artists?.map(a => a.name).join(', ') || '',
      genres: initialManga.genres?.map(g => g.name).join(',') || '',
      chapters: [],
      totalPages: 1,
    };

    const rawStatus = initialManga.status;
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
      unknown: NovelStatus.Unknown,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const summary = $(initialManga.summary || '');
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');

    novel.summary =
      summary
        .text()
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        ?.replace(/\n{3,}/g, '\n\n')
        .trim() || 'Summary Not Found';

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    // Fetch full chapter list from API
    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    let allChapters: Plugin.ChapterItem[] = [];
    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      allChapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      allChapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    const chaptersPerPage = 50;
    novel.totalPages = Math.ceil(allChapters.length / chaptersPerPage);
    novel.chapters = allChapters
      .slice(0, chaptersPerPage)
      .map(c => ({ ...c, page: '1' }));

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;

    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    let allChapters: Plugin.ChapterItem[] = [];
    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      allChapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      allChapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: new URL(chapter.url, this.site).pathname.substring(1),
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    const pageNo = parseInt(page);
    const chaptersPerPage = 50;
    const start = (pageNo - 1) * chaptersPerPage;
    const end = start + chaptersPerPage;

    return {
      chapters: allChapters.slice(start, end).map(c => ({ ...c, page })),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data: ChapterScript = JSON.parse(script);
    const initialChapter = data.props.pageProps.initialChapter;
    if (!initialChapter) throw new Error('Could not find chapter content');

    let content = initialChapter.content;

    if (content) {
      // Remove Webnovel watermarks/ads
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );

      // Remove obfuscated freewebnovel watermarks using an ULTRA COMPREHENSIVE regex (Safe for GitHub Actions)
      const fwnRegex = new RegExp('[fF\\ud835\\udc1f\\ud835\\udc53\\ud835\\udc87\\ud835\\udcbb\\ud835\\udcef\\ud835\\udd23\\ud835\\udd57\\ud835\\udd8b\\ud835\\uddbf\\ud835\\uddf3\\ud835\\ude27\\ud835\\ude5b\\ud835\\ude8f\\ud835\\udc05\\ud835\\udc39\\ud835\\udc6d\\ud835\\udca1\\ud835\\udcd5\\ud835\\udd09\\ud835\\udd3d\\ud835\\udd71\\ud835\\udda5\\ud835\\uddd9\\ud835\\ude0d\\ud835\\ude41\\ud835\\ude75][rR\\ud835\\udc2b\\ud835\\udc5f\\ud835\\udc93\\ud835\\udcc7\\ud835\\udcfb\\ud835\\udd2f\\ud835\\udd63\\ud835\\udd97\\ud835\\uddcb\\ud835\\uddff\\ud835\\ude33\\ud835\\ude67\\ud835\\ude9b\\ud835\\udc11\\ud835\\udc45\\ud835\\udc79\\ud835\\udcad\\ud835\\udce1\\ud835\\udd15\\ud835\\udd49\\ud835\\udd7d\\ud835\\uddb1\\ud835\\udde5\\ud835\\ude19\\ud835\\ude4d\\ud835\\ude81][eE\\ud835\\udc1e\\ud835\\udc52\\ud835\\udc86\\ud835\\udcba\\ud835\\udcee\\ud835\\udd22\\ud835\\udd56\\ud835\\udd8a\\ud835\\uddbe\\ud835\\uddf2\\ud835\\ude26\\ud835\\ude5a\\ud835\\ude8e\\ud835\\udc04\\ud835\\udc38\\ud835\\udc6c\\ud835\\udca0\\ud835\\udcd4\\ud835\\udd08\\ud835\\udd3c\\ud835\\udd70\\ud835\\udda4\\ud835\\uddd8\\ud835\\ude0c\\ud835\\ude40\\ud835\\ude74\\u0259\\u04d9\\u2147\\uab32\\ua793\\u22f4\\ud835\\udec6\\ud835\\udedc\\ud835\\udf00\\ud835\\udf16\\ud835\\udf3a\\ud835\\udf50\\ud835\\udf74\\ud835\\udf8a\\ud835\\udfae\\ud835\\udfc4\\u2c89\\uab9b\\ud801\\udc29\\ua792\\u2c88\\u2377]+[wW\\ud835\\udc30\\ud835\\udc64\\ud835\\udc98\\ud835\\udccc\\ud835\\udd00\\ud835\\udd34\\ud835\\udd68\\ud835\\udd9c\\ud835\\uddd0\\ud835\\ude04\\ud835\\ude38\\ud835\\ude6c\\ud835\\udea0\\ud835\\udc16\\ud835\\udc4a\\ud835\\udc7e\\ud835\\udcb2\\ud835\\udce6\\ud835\\udd1a\\ud835\\udd4e\\ud835\\udd82\\ud835\\uddb6\\ud835\\uddea\\ud835\\ude1e\\ud835\\ude52\\ud835\\ude86\\ua761\\u0561\\u1e81\\uab83\\u1e83\\u2375\\u0175\\u1e87\\u1e85\\u1e98\\u1e89\\u2c73][eE\\ud835\\udc1e\\ud835\\udc52\\ud835\\udc86\\ud835\\udcba\\ud835\\udcee\\ud835\\udd22\\ud835\\udd56\\ud835\\udd8a\\ud835\\uddbe\\ud835\\uddf2\\ud835\\ude26\\ud835\\ude5a\\ud835\\ude8e\\ud835\\udc04\\ud835\\udc38\\ud835\\udc6c\\ud835\\udca0\\ud835\\udcd4\\ud835\\udd08\\ud835\\udd3c\\ud835\\udd70\\ud835\\udda4\\ud835\\uddd8\\ud835\\ude0c\\ud835\\ude40\\ud835\\ude74\\u0259\\u04d9\\u2147\\uab32\\ua793\\u22f4\\ud835\\udec6\\ud835\\udedc\\ud835\\udf00\\ud835\\udf16\\ud835\\udf3a\\ud835\\udf50\\ud835\\udf74\\ud835\\udf8a\\ud835\\udfae\\ud835\\udfc4\\u2c89\\uab9b\\ud801\\udc29\\ua792\\u2c88\\u2377][bB\\ud835\\udc1b\\ud835\\udc4f\\ud835\\udc83\\ud835\\udcb7\\ud835\\udceb\\ud835\\udd1f\\ud835\\udd53\\ud835\\udd87\\ud835\\uddbb\\ud835\\uddef\\ud835\\ude23\\ud835\\ude57\\ud835\\ude8b\\ud835\\udc01\\ud835\\udc35\\ud835\\udc69\\ud835\\udc9d\\ud835\\udcd1\\ud835\\udd05\\ud835\\udd39\\ud835\\udd6d\\ud835\\udda1\\ud835\\uddd5\\ud835\\ude09\\ud835\\ude3d\\ud835\\ude71\\uab9f\\u13cf\\u266d\\u1473\\u1488\\uff42\\u159a\\u1579\\u157a\\u24d1\\u1e03\\u1e05\\u048d\\u044a\\u1e07\\u0183\\u0253\\u0185\\u15af\\u0184\\u042c\\u1472\\u00fe\\u0182\\u249d\\u042a][nN\\ud835\\udc27\\ud835\\udc5b\\ud835\\udc8f\\ud835\\udcc3\\ud835\\udcf7\\ud835\\udd2b\\ud835\\udd5f\\ud835\\udd93\\ud835\\uddc7\\ud835\\uddfb\\ud835\\ude2f\\ud835\\ude63\\ud835\\ude97\\ud835\\udc0d\\ud835\\udc41\\ud835\\udc75\\ud835\\udca9\\ud835\\udcdd\\ud835\\udd11\\ud835\\udd45\\ud835\\udd79\\ud835\\uddad\\ud835\\udde1\\ud835\\ude15\\ud835\\ude49\\ud835\\ude7d\\u0578\\u057c\\u05d7\\u1952\\u24dd\\u03ae\\u01f9\\u1d12\\u0144\\u00f1\\u1f97\\u03b7\\u1e45\\u0148\\u1e47\\u0272\\u0146\\u1e4b\\u1e49\\u0572\\u0e96\\u054c\\u019e\\u014b\\u24a9\\u0e20\\u0e01\\u0273\\u043f\\u0149\\u043b\\u0509\\u0220][oO\\ud835\\udc28\\ud835\\udc5c\\ud835\\udc90\\ud835\\udcc4\\ud835\\udcf8\\ud835\\udd2c\\ud835\\udd60\\ud835\\udd94\\ud835\\uddc8\\ud835\\uddfc\\ud835\\ude30\\ud835\\ude64\\ud835\\ude98\\ud835\\udc0e\\ud835\\udc42\\ud835\\udc76\\ud835\\udcaa\\ud835\\udcde\\ud835\\udd12\\ud835\\udd46\\ud835\\udd7a\\ud835\\uddae\\ud835\\udde2\\ud835\\ude16\\ud835\\ude4a\\ud835\\ude7e\\u0c02\\u0c02\\u0d02\\u0d82\\u0ae6\\u0be6\\u06f5\\u2134\\uab3d\\u10ff\\u09e6\\u0b66\\u12d0\\u101d\\u2c9f\\u1040\\ud801\\udc2c\\ud801\\udcea\\ud83c\\uddf4\\u2364\\u25cb\\u03d9\\ud83c\\udd7e\\u24de\\u0473\\u19d0\\u1972\\u00f0\\uff4f\\u0c20\\u199e\\u0553\\u00f2\\u04e9\\u04e7\\u00f3\\u00ba\\u014d\\u00f4\\u01d2\\u020f\\u014f\\u1ed3\\u022d\\u1e4f\\u1f44\\u1e51\\u1e53\\u022f\\u022b\\u0e4f\\u1d0f\\u0151\\u00f6\\u047b\\u043e\\u12d0\\u01ed\\u0231\\u09e6\\u0b66\\u0665\\u0c66\\u0ce6\\u0d66\\u0e50\\u0ed0\\u03bf\\u0585\\u1d11\\u0966\\u0a66\\u1ecf\\u01a1\\u1edd\\u1edb\\u1ee1\\u1edf\\u1ee3\\u1ecd\\u1ed9\\u01eb\\u00f8\\u01ff\\u0275\\u056e\\u1f40\\u1f41\\u03cc\\u1f78\\u1f79\\u1f42\\u1f43\\u1f45][vV\\ud835\\udc2f\\ud835\\udc63\\ud835\\udc97\\ud835\\udccb\\ud835\\udcff\\ud835\\udd33\\ud835\\udd67\\ud835\\udd9b\\ud835\\uddcf\\ud835\\ude03\\ud835\\ude37\\ud835\\ude6b\\ud835\\ude9f\\ud835\\udc15\\ud835\\udc49\\ud835\\udc7d\\ud835\\udcb1\\ud835\\udce5\\ud835\\udd19\\ud835\\udd4d\\ud835\\udd81\\ud835\\uddb5\\ud835\\udde9\\ud835\\ude1d\\ud835\\ude51\\ud835\\ude85\\u2228\\u2304\\u22c1\\u2174\\uaba9\\u1200\\u24e5\\ud835\\udf10\\ud835\\udf4a\\u1e7d\\u1e7f\\u0c6e\\u0e07\\u0475\\u05e2\\u1d20\\u03bd\\u05d8\\u1d65\\u0477\\u17f4\\u1601][eE\\ud835\\udc1e\\ud835\\udc52\\ud835\\udc86\\ud835\\udcba\\ud835\\udcee\\ud835\\udd22\\ud835\\udd56\\ud835\\udd8a\\ud835\\uddbe\\ud835\\uddf2\\ud835\\ude26\\ud835\\ude5a\\ud835\\ude8e\\ud835\\udc04\\ud835\\udc38\\ud835\\udc6c\\ud835\\udca0\\ud835\\udcd4\\ud835\\udd08\\ud835\\udd3c\\ud835\\udd70\\ud835\\udda4\\ud835\\uddd8\\ud835\\ude0c\\ud835\\ude40\\ud835\\ude74\\u0259\\u04d9\\u2147\\uab32\\ua793\\u22f4\\ud835\\udec6\\ud835\\udedc\\ud835\\udf00\\ud835\\udf16\\ud835\\udf3a\\ud835\\udf50\\ud835\\udf74\\ud835\\udf8a\\ud835\\udfae\\ud835\\udfc4\\u2c89\\uab9b\\ud801\\udc29\\ua792\\u2c88\\u2377][lL\\ud835\\udc25\\ud835\\udc59\\ud835\\udc8d\\ud835\\udcc1\\ud835\\udcf5\\ud835\\udd29\\ud835\\udd5d\\ud835\\udd91\\ud835\\uddc5\\ud835\\uddf9\\ud835\\ude2d\\ud835\\ude61\\ud835\\ude95\\ud835\\udc0b\\ud835\\udc3f\\ud835\\udc73\\ud835\\udca7\\ud835\\udcdb\\ud835\\udd0f\\ud835\\udd43\\ud835\\udd77\\ud835\\uddab\\ud835\\udddf\\ud835\\ude13\\ud835\\ude47\\ud835\\ude7b\\u24db\\uff4c\\u0140\\u013a\\u013e\\u1e37\\u1e39\\u013c\\u04c0\\u2113\\u1e3d\\u1e3b\\u0142\\uff9a\\u026d\\u019a\\u026b\\u2c61\\\\|\\u0196\\u24a7\\u0285\\u01c0\\u05d5\\u05df\\u0399\\u0406\\uff5c\\u1da9\\u04cf\\u0131\\ud835\\udea4\\u0269\\u1fbe\\ud835\\udeca\\ud835\\udf04\\ud835\\udf3e\\ud835\\udfb2](?:.?[cC\\ud835\\udc1c\\ud835\\udc50\\ud835\\udc84\\ud835\\udcb8\\ud835\\udcec\\ud835\\udd20\\ud835\\udd54\\ud835\\udd88\\ud835\\uddbc\\ud835\\uddf0\\ud835\\ude24\\ud835\\ude58\\ud835\\ude8c\\ud835\\udc02\\ud835\\udc36\\ud835\\udc6a\\ud835\\udc9e\\ud835\\udcd2\\ud835\\udd06\\ud835\\udd3a\\ud835\\udd6e\\ud835\\udda2\\ud835\\uddd6\\ud835\\ude0a\\ud835\\ude3e\\ud835\\ude72\\ud835\\udf4c\\u217d\\u1d04\\u03f2\\u2ca5\\u0441\\uabaf\\ud801\\udc3d\\u0109\\u24d2\\u0107\\u010d\\u010b\\u00e7\\u0481\\u0188\\u1e09\\u023c\\u2184\\u0441\\u122d\\u1d04\\u03f2\\u04ab\\ua49d\\u03c2\\u027d\\u03db\\ud835\\ude72\\u1466\\u19da\\u20b5\\ud83c\\udde8\\u1974\\u14bc\\u217d][oO\\ud835\\udc28\\ud835\\udc5c\\ud835\\udc90\\ud835\\udcc4\\ud835\\udcf8\\ud835\\udd2c\\ud835\\udd60\\ud835\\udd94\\ud835\\uddc8\\ud835\\uddfc\\ud835\\ude30\\ud835\\ude64\\ud835\\ude98\\ud835\\udc0e\\ud835\\udc42\\ud835\\udc76\\ud835\\udcaa\\ud835\\udcde\\ud835\\udd12\\ud835\\udd46\\ud835\\udd7a\\ud835\\uddae\\ud835\\udde2\\ud835\\ude16\\ud835\\ude4a\\ud835\\ude7e\\u0c02\\u0c02\\u0d02\\u0d82\\u0ae6\\u0be6\\u06f5\\u2134\\uab3d\\u10ff\\u09e6\\u0b66\\u12d0\\u101d\\u2c9f\\u1040\\ud801\\udc2c\\ud801\\udcea\\ud83c\\uddf4\\u2364\\u25cb\\u03d9\\ud83c\\udd7e\\u24de\\u0473\\u19d0\\u1972\\u00f0\\uff4f\\u0c20\\u199e\\u0553\\u00f2\\u04e9\\u04e7\\u00f3\\u00ba\\u014d\\u00f4\\u01d2\\u020f\\u014f\\u1ed3\\u022d\\u1e4f\\u1f44\\u1e51\\u1e53\\u022f\\u022b\\u0e4f\\u1d0f\\u0151\\u00f6\\u047b\\u043e\\u12d0\\u01ed\\u0231\\u09e6\\u0b66\\u0665\\u0c66\\u0ce6\\u0d66\\u0e50\\u0ed0\\u03bf\\u0585\\u1d11\\u0966\\u0a66\\u1ecf\\u01a1\\u1edd\\u1edb\\u1ee1\\u1edf\\u1ee3\\u1ecd\\u1ed9\\u01eb\\u00f8\\u01ff\\u0275\\u056e\\u1f40\\u1f41\\u03cc\\u1f78\\u1f79\\u1f42\\u1f43\\u1f45][mM\\ud835\\udc26\\ud835\\udc5a\\ud835\\udc8e\\ud835\\udcc2\\ud835\\udcf6\\ud835\\udd2a\\ud835\\udd5e\\ud835\\udd92\\ud835\\uddc6\\ud835\\uddfa\\ud835\\ude2e\\ud835\\ude62\\ud835\\ude96\\ud835\\udc0c\\ud835\\udc40\\ud835\\udc74\\ud835\\udca8\\ud835\\udcdc\\ud835\\udd10\\ud835\\udd44\\ud835\\udd78\\ud835\\uddac\\ud835\\udde0\\ud835\\ude14\\ud835\\ude48\\ud835\\ude7c\\u20a5\\u1d6f\\ud835\\udd92\\ud835\\udc26\\ud835\\uddc6\\ud835\\udd2a\\ud835\\udd5e\\ud835\\udd5e\\ud835\\udcc2\\u24dc\\uff4d\\u0d28\\u1662\\u0d69\\u1e3f\\u1e41\\u217f\\u03fb\\u1e43\\u1320\\u0271\\u17f3\\u1d86])?', 'giu');
      content = content.replace(fwnRegex, '');
    }

    return content;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      'q': searchTerm,
      'limit': '24',
      'page': page.toString(),
    });

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  filters = {
    orderBy: {
      value: 'views',
      label: 'Order by',
      options: [
        { label: 'Default Order', value: '' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Latest Updated', value: 'latest' },
        { label: 'Most Popular', value: 'popular' },
        { label: 'A-Z', value: 'alphabetical' },
        { label: 'Highest Rating', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
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
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: {
        include: [],
        exclude: [],
      },
      label: 'Genres (OR, not AND)',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Action Adventure', value: 'action-adventure' },
        { label: 'ActionAdventure', value: 'actionadventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventcure', value: 'adventcure' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Adventurer', value: 'adventurer' },
        { label: 'Anime u0026 Comics', value: 'anime-u0026-comics' },
        { label: 'Bender', value: 'bender' },
        { label: 'Booku0026Literature', value: 'booku0026literature' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comed', value: 'comed' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'ComedySlice of Life', value: 'comedyslice-of-life' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'dventure', value: 'dventure' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Easterni', value: 'easterni' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Ecchi Fantasy', value: 'ecchi-fantasy' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantas', value: 'fantas' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'FantasyAction', value: 'fantasyaction' },
        { label: 'Game', value: 'game' },
        { label: 'Games', value: 'games' },
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
        { label: 'lice of Life', value: 'lice-of-life' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial', value: 'martial' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Myster', value: 'myster' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Mystery.Adventure', value: 'mystery.adventure' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnatio', value: 'reincarnatio' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romanc', value: 'romanc' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance.Adventure', value: 'romance.adventure' },
        { label: 'Romance.Harem', value: 'romance.harem' },
        { label: 'Romance.Smut', value: 'romance.smut' },
        { label: 'RomanceAction', value: 'romanceaction' },
        { label: 'RomanceAdventure', value: 'romanceadventure' },
        { label: 'RomanceHarem', value: 'romanceharem' },
        { label: 'Romancei', value: 'romancei' },
        { label: 'Romancem', value: 'romancem' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Seinen Wuxia', value: 'seinen-wuxia' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Lif', value: 'slice-of-lif' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Slice of Lifel', value: 'slice-of-lifel' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Superna', value: 'superna' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    min_ch: {
      value: '',
      label: 'Minimum Chapters',
      type: FilterTypes.TextInput,
    },
    max_ch: {
      value: '',
      label: 'Maximum Chapters',
      type: FilterTypes.TextInput,
    },
    type: {
      value: '',
      label: 'Types',
      options: [
        { label: 'All Types', value: '' },
        { label: 'Japanese comics', value: 'manga' },
        { label: 'Korean comics', value: 'manhwa' },
        { label: 'Chinese comics', value: 'manhua' },
      ],
      type: FilterTypes.Picker,
    },
    demo: {
      value: [],
      label: 'Demographics',
      options: [
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Josei', value: 'josei' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelBuddy();

type Response = {
  data: {
    items: Items[];
  };
};

type ChapterResponse = {
  success: boolean;
  data?: {
    chapters?: Items[];
  };
};

type Items = {
  id: string;
  url: string;
  name: string;
  alt_name?: string;
  cover?: string;
  slug: string;
  updated_at?: string;
  updatedAt?: string;
};

type NovelScript = {
  props: {
    pageProps: {
      initialManga: Manga;
    };
  };
};

type Manga = {
  id: string;
  url: string;
  name?: string;
  altName?: string;
  cover: string;
  status: string;
  ratingStats?: {
    average: number;
  };
  summary?: string;
  artists?: {
    name: string;
    slug: string;
  }[];
  authors?: {
    name: string;
    slug: string;
  }[];
  genres?: {
    name: string;
    slug: string;
  }[];
  chapters?: Items[];
};

type ChapterScript = {
  props: {
    pageProps: {
      initialChapter: Chapter;
    };
  };
};

type Chapter = {
  name: string;
  content: string;
};
