import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { gcm } from '@libs/aes';

class WTRLAB implements Plugin.PluginBase {
  id = 'WTRLAB';
  name = 'WTR-LAB';
  site = 'https://wtr-lab.com/';
  version = '1.1.6';
  icon = 'src/en/wtrlab/icon.png';
  sourceLang = 'en/';
  baggage = '';
  trace = '';

  get headers(): Record<string, string> {
    return {
      baggage: this.baggage,
      'sentry-trace': this.trace,
    };
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + this.sourceLang + 'novel-list?';

    const params = new URLSearchParams();
    params.append('orderBy', filters.orderBy.value);
    params.append('order', filters.order.value);
    params.append('status', filters.status.value);
    params.append('release_status', filters.release_status.value);
    params.append('addition_age', filters.addition_age.value);
    params.append('page', page.toString());

    if (filters.search.value) {
      params.append('text', filters.search.value);
    }

    if (
      filters.genres.value?.include &&
      filters.genres.value.include.length > 0
    ) {
      params.append('gi', filters.genres.value.include.join(','));
      params.append('gc', filters.genre_operator.value);
    }
    if (
      filters.genres.value?.exclude &&
      filters.genres.value.exclude.length > 0
    ) {
      params.append('ge', filters.genres.value.exclude.join(','));
    }

    if (filters.tags.value?.include && filters.tags.value.include.length > 0) {
      params.append('ti', filters.tags.value.include.join(','));
      params.append('tc', filters.tag_operator.value);
    }
    if (filters.tags.value?.exclude && filters.tags.value.exclude.length > 0) {
      params.append('te', filters.tags.value.exclude.join(','));
    }

    if (filters.folders.value) {
      params.append('folders', filters.folders.value);
    }
    if (filters.library_exclude.value) {
      params.append('le', filters.library_exclude.value);
    }

    if (filters.min_chapters.value) {
      params.append('count_value', filters.min_chapters.value);
    }
    if (filters.min_rating.value) {
      params.append('minr', filters.min_rating.value);
    }
    if (filters.min_review_count.value) {
      params.append('minrc', filters.min_review_count.value);
    }

    if (showLatestNovels) {
      const response = await fetchApi(this.site + 'api/home/recent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page: page }),
      });

      const recentNovel: JsonNovel = await response.json();

      // Parse novels from JSON
      const novels: Plugin.NovelItem[] = recentNovel.data.map(
        (datum: Datum) => ({
          name: datum.serie.data.title || datum.serie.slug || '',
          cover: datum.serie.data.image,
          path:
            this.sourceLang +
              'serie-' +
              datum.serie.raw_id +
              '/' +
              datum.serie.slug || '',
        }),
      );

      return novels;
    } else {
      const finderPage = await fetchApi(this.site + 'en/novel-finder').then(
        res => res.text(),
      );
      const finderCheerio = parseHTML(finderPage);
      const nextData = finderCheerio('#__NEXT_DATA__').html();
      if (!nextData) {
        throw new Error('Could not find __NEXT_DATA__ on novel finder page');
      }
      const buildId = JSON.parse(nextData).buildId;

      link = `${this.site}_next/data/${buildId}/en/novel-finder.json?${params.toString()}`;

      const response = await fetchApi(link);
      const json = await response.json();
      const seenIds = new Set();

      const novels: Plugin.NovelItem[] = json.pageProps.series
        .filter((novel: Datum) => {
          if (seenIds.has(novel.raw_id)) {
            return false;
          }
          seenIds.add(novel.raw_id);
          return true;
        })
        .map((novel: Datum) => ({
          name: novel.data.title,
          cover: novel.data.image,
          path: `${this.sourceLang}serie-${novel.raw_id}/${novel.slug}`,
        }));

      return novels;
    }
  }

  async fetchTokens() {
    const body = await fetchApi(this.site + this.sourceLang).then(res =>
      res.text(),
    );
    const $ = parseHTML(body);

    this.baggage = $('meta[name="baggage"]').attr('content') ?? '';
    this.trace = $('meta[name="sentry-trace"]').attr('content') ?? '';
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const baggage = loadedCheerio('meta[name="baggage"]').attr('content');
    const trace = loadedCheerio('meta[name="sentry-trace"]').attr('content');

    if (baggage && trace) {
      this.baggage = baggage;
      this.trace = trace;
    } else if (!this.baggage || !this.trace) {
      await this.fetchTokens();
    }

    const nextDataElement = loadedCheerio('#__NEXT_DATA__');
    const nextDataText = nextDataElement.html();

    let rawId: number | null = null;
    let slug: string | null = null;
    let chapterCount = 0;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.text-uppercase').text(),
      summary: loadedCheerio('.lead').text().trim(),
    };

    if (nextDataText) {
      try {
        const jsonData = JSON.parse(nextDataText);
        const serieData = jsonData?.props?.pageProps?.serie?.serie_data;

        // console.log('Parsed novel JSON data:', serieData);

        if (serieData) {
          novel.name = serieData.data?.title || '';
          novel.cover = serieData.data?.image || '';
          novel.summary = serieData.data?.description || '';
          novel.author = serieData.data?.author || '';
          rawId = serieData.raw_id || null;
          slug = serieData.slug || null;

          switch (serieData.status) {
            case 0:
              novel.status = 'Ongoing';
              break;
            case 1:
              novel.status = 'Completed';
              break;
            default:
              novel.status = 'Unknown';
          }
        }
      } catch (error) {
        console.error('Failed to parse __NEXT_DATA__:', error);
      }
    }

    if (!novel.name) {
      novel.name =
        loadedCheerio('h1.text-uppercase').text() ||
        loadedCheerio('h1.long-title').text() ||
        loadedCheerio('.title-wrap h1').text().trim();
    }

    if (!novel.cover) {
      novel.cover =
        loadedCheerio('.image-wrap img').attr('src') ||
        loadedCheerio('.img-wrap > img').attr('src');
    }

    if (!novel.summary) {
      novel.summary =
        loadedCheerio('.description').text().trim() ||
        loadedCheerio('.desc-wrap .description').text().trim() ||
        loadedCheerio('.lead').text().trim();
    }

    const genres =
      loadedCheerio('td:contains("Genre")')
        .next()
        .find('a')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .trim(),
        )
        .toArray() ||
      loadedCheerio('.genre')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .trim(),
        )
        .toArray() ||
      loadedCheerio('.genres .genre')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .trim(),
        )
        .toArray();

    if (genres.length > 0) {
      novel.genres = genres
        .map(g => g.replace(/,$/, '').trim())
        .filter(genre => genre && genre.length > 0)
        .join(', ');
    }

    const tags =
      loadedCheerio('td:contains("Tags")')
        .next()
        .find('a')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .replace(/,$/, '')
            .trim(),
        )
        .toArray() ||
      loadedCheerio('.tag')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .replace(/,$/, '')
            .trim(),
        )
        .toArray() ||
      loadedCheerio('.tags .tag')
        .map((i, el) =>
          loadedCheerio(el)
            .text()
            .replace(/<!--.*?-->/g, '')
            .replace(/,$/, '')
            .trim(),
        )
        .toArray();

    // console.log('Found tags from HTML:', tags);

    if (tags.length > 0) {
      const existingGenres = novel.genres ? novel.genres.split(', ') : [];
      // console.log('Existing genres:', existingGenres);
      const allGenres = [...existingGenres, ...tags].filter(
        genre => genre && genre.length > 0,
      );
      const uniqueGenres = allGenres.filter(
        (genre, index) => allGenres.indexOf(genre) === index,
      );
      novel.genres = uniqueGenres.join(', ');
      // console.log('Combined genres:', novel.genres);
    }

    if (!novel.author) {
      novel.author =
        loadedCheerio('td:contains("Author")')
          .next()
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('td:contains("Author") + td')
          .text()
          .replace(/[\t\n]/g, '')
          .trim();
    }

    if (!novel.status) {
      novel.status =
        loadedCheerio('td:contains("Status")')
          .next()
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('td:contains("Status") + td')
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('.detail-line:contains("•")')
          .text()
          .match(/•\s*(\w+)/)?.[1] ||
        '';
    }

    const urlMatch = novelPath.match(/(?:serie|novel)-?(\d+)\/([^/]+)/);
    if (urlMatch) {
      rawId = parseInt(urlMatch[1]);
      slug = urlMatch[2];
    }

    const chapterCountText =
      loadedCheerio('.detail-line:contains("Chapters")').text() ||
      loadedCheerio('div:contains("Chapters")').text();
    const chapterCountMatch = chapterCountText.match(/(\d+)\s+Chapters?/i);
    if (chapterCountMatch) {
      chapterCount = parseInt(chapterCountMatch[1]);
    }
    if (chapterCount === 0 && nextDataText) {
      try {
        const jsonData = JSON.parse(nextDataText);

        chapterCount =
          jsonData?.props?.pageProps?.serie?.serie_data?.chapter_count ?? 0;
      } catch (error) {
        console.error(
          'Failed to parse chapter_count from __NEXT_DATA__:',
          error,
        );
      }
    }
    let chapters: Plugin.ChapterItem[] = [];

    if (rawId && slug) {
      try {
        chapters = await this.fetchAllChapters(rawId, slug);
      } catch (error) {
        console.error('Failed to fetch chapters via API:', error);
        chapters = [];
      }
    } else {
      console.warn('Could not extract rawId or slug from page', {
        rawId,
        slug,
      });
    }

    novel.chapters = chapters;

    return novel;
  }

  async decrypt(encrypted: string, encKey: string) {
    try {
      // t is set to false here; true if arr:
      // If true we parse as json
      let t = !1,
        u = encrypted;
      // t true if arr:, str: straight, else error
      encrypted.startsWith('arr:')
        ? ((t = !0), (u = encrypted.substring(4)))
        : encrypted.startsWith('str:') && (u = encrypted.substring(4));
      const r = u.split(':');
      if (3 !== r.length) throw Error('Invalid encrypted data format');

      // Remove base64, setup vars
      const [iv, tag, ciphertext] = r.map(part =>
          Uint8Array.from(atob(part), e => e.charCodeAt(0)),
        ),
        combined = new Uint8Array(ciphertext.length + tag.length);

      // Make the ciphertext + tag format expected for decryption
      combined.set(ciphertext), combined.set(tag, ciphertext.length);

      // Decrypt with encKey
      // Convert the key to bytes (first 32 characters of encKey)
      const keyBytes = new TextEncoder().encode(encKey.slice(0, 32));

      // Create AES-GCM cipher instance
      const aes = gcm(keyBytes, iv);

      // Decrypt the combined ciphertext
      const decrypted = aes.decrypt(combined);

      // Convert decrypted bytes to string
      const m = new TextDecoder().decode(decrypted);

      // const D = new TextEncoder().encode(encKey.slice(0, 32));
      // const d = await crypto.subtle.importKey(
      //   'raw',
      //   D,
      //   { name: 'AES-GCM' },
      //   !1,
      //   ['decrypt'],
      // );
      // const h = await crypto.subtle.decrypt(
      //   { name: 'AES-GCM', iv: iv },
      //   d,
      //   combined,
      // );
      // const m = new TextDecoder().decode(h);

      // If it was arr:, parse as json
      if (t) return JSON.parse(m);
      // Otherwise (str:) return straight
      return m;
    } catch (error) {
      console.error('Client-side decryption error:', error);
      const msg = { 'error': `<p>Client-side decryption error:</p>${error}` };
      return msg;
    }
  }

  async getKey($: CheerioAPI): Promise<string> {
    // Fetch the novel's data in JSON format
    const searchKey = 'TextEncoder().encode("';

    const URLs: string[] = [];
    let code: string | undefined;
    let index = -1;

    // Find URL with API Key
    const scripts = $('head').find('script').toArray();
    for (const el of scripts) {
      const src = $(el).attr('src');
      if (!src) continue;
      if (URLs.includes(src)) continue;
      URLs.push(src);
    }

    for (const src of URLs) {
      const script = await fetchApi(`${this.site}${src}`);
      const raw = await script.text();
      index = raw.indexOf(searchKey);
      if (index >= 0) {
        code = raw;
        break;
      }
    }
    if (!code) {
      throw new Error('Failed to find Encryption Key');
    }
    // Get right segment of code
    const encKey = code.substring(index + 22, index + 54);
    return encKey;
  }

  async translate(data: string[]): Promise<string[]> {
    const contained = data.map((line, i) => `<a i=${i}>${line}</a>`);

    const response = await fetchApi(
      'https://translate-pa.googleapis.com/v1/translateHtml',
      {
        'credentials': 'omit',
        'headers': {
          'content-type': 'application/json+protobuf',
          // Generic public API key source also uses
          // Seen all over google
          'X-Goog-API-Key': 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520',
        },
        'referrer': 'https://wtr-lab.com/',
        'body': `[[${JSON.stringify(contained)},"zh-CN","en"],"te_lib"]`,
        'method': 'POST',
      },
    );
    const translated = await response.json();
    const out = translated && translated[0] ? translated[0] : [];
    return out as string[];
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    let rawId: number | null = null;
    let chapterNo: number | null = null;
    let loadedCheerio = null;

    const urlMatch = chapterPath.match(
      /(?:serie|novel)-?(\d+)\/[^/]+\/chapter-(\d+)/,
    );
    if (urlMatch) {
      rawId = parseInt(urlMatch[1], 10);
      chapterNo = parseInt(urlMatch[2], 10);
      // console.log('Extracted from URL - rawId:', rawId, 'chapterNo:', chapterNo);
    }

    if (!rawId || !chapterNo) {
      const body = await fetchApi(url).then(res => res.text());

      loadedCheerio = parseHTML(body);
      const chapterJson = loadedCheerio('#__NEXT_DATA__').html() + '';
      const jsonData: NovelJson = JSON.parse(chapterJson);

      // const chapterID = jsonData.props.pageProps.serie.chapter.id;
      rawId = jsonData.props.pageProps.serie.chapter.raw_id;
      chapterNo = jsonData.props.pageProps.serie.chapter.order;
    }

    if (!rawId || !chapterNo) {
      const errorMsg = `Missing required parameters for API call from URL '${chapterPath}' - rawId: ${rawId}, chapterNo: ${chapterNo}. Please check the URL format.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const translationTypes = ['ai', 'web'];

    let eLog = '';
    let parsedJson;

    for (const type of translationTypes) {
      const apiResponse = await fetchApi(`${this.site}api/reader/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        referrer: url,
        body: JSON.stringify({
          translate: type,
          language: this.sourceLang.replace('/', ''),
          raw_id: rawId,
          chapter_no: chapterNo,
          retry: false,
          force_retry: false,
        }),
      });

      parsedJson = await apiResponse.json();
      if (!apiResponse.ok) {
        if (parsedJson.error) {
          eLog = parsedJson.error;
          continue;
        }
      } else if (!parsedJson.error) {
        break;
      }
    }
    if (parsedJson.success == false) {
      const errorMsg = parsedJson.message;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    let chapterContent = parsedJson.data.data.body;
    const chapterGlossary: ChapterContent['glossary_data'] | undefined =
      parsedJson?.data?.data?.glossary_data;

    let htmlString = '';

    if (
      chapterContent.toString().startsWith('arr:') ||
      chapterContent.toString().startsWith('str:')
    ) {
      if (!loadedCheerio) {
        const body = await fetchApi(url).then(res => res.text());

        loadedCheerio = parseHTML(body);
      }
      const encKey = await this.getKey(loadedCheerio);
      chapterContent = await this.decrypt(chapterContent, encKey);
      if (Object.prototype.hasOwnProperty.call(chapterContent, 'error')) {
        htmlString += `<p>${chapterContent.error.toString()}</p>`;
        return htmlString;
      }
      chapterContent = await this.translate(chapterContent);
      htmlString += `<p><small>This is being translated from your device via google translate (source's method) - Login via web view to try for ai translations</small></p>`;
    }

    if (eLog !== '') {
      htmlString += `<p style="color:darkred;">${eLog}</p>`;
    }

    const dictionary = chapterGlossary?.terms?.map(t => t[0]) || [];

    for (let text of chapterContent) {
      if (dictionary.length > 0) {
        text = text.replaceAll(
          /(?:wtr-lab\s+)?※([0-9]+)[⛬〓]/g,
          (m: string, index: string) => dictionary[parseInt(index)] || m,
        );
      }
      htmlString += `<p>${text}</p>`;
    }

    return htmlString;
  }

  async fetchAllChapters(
    rawId: number,
    slug: string,
  ): Promise<Plugin.ChapterItem[]> {
    const allChapters: Plugin.ChapterItem[] = [];
    const batchSize = 500;
    let start = 1;
    let hasMore = true;

    while (hasMore) {
      const end = start + batchSize - 1;

      try {
        const response = await fetchApi(
          `${this.site}api/chapters/${rawId}?start=${start}&end=${end}`,
          {
            headers: {
              ...this.headers,
            },
          },
        );

        const data = await response.json();
        const chapters = data.chapters ?? data.data?.chapters ?? [];

        if (!Array.isArray(chapters) || chapters.length === 0) {
          hasMore = false;
          break;
        }

        const batchChapters: Plugin.ChapterItem[] = chapters.map(
          (apiChapter: ApiChapter) => ({
            name:
              apiChapter.title ||
              apiChapter.name ||
              `Chapter ${apiChapter.order}`,
            path: `${this.sourceLang}serie-${rawId}/${slug}/chapter-${apiChapter.order}`,
            releaseTime: apiChapter.updated_at?.substring(0, 10),
            chapterNumber: apiChapter.order,
          }),
        );

        allChapters.push(...batchChapters);

        if (chapters.length < batchSize) {
          hasMore = false;
          break;
        }

        start += batchSize;
      } catch (error) {
        console.error(`Failed to fetch chapters ${start}-${end}:`, error);
        hasMore = false;
        break;
      }
    }

    return allChapters.sort(
      (a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0),
    );
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const filters = this.filters;
    filters.search.value = searchTerm;
    return this.popularNovels(page, { showLatestNovels: false, filters });
  }

  filters = {
    search: {
      value: '',
      label: 'Search',
      type: FilterTypes.TextInput,
    },
    orderBy: {
      value: 'update',
      label: 'Order by',
      options: [
        { label: 'Update Date', value: 'update' },
        { label: 'Addition Date', value: 'date' },
        { label: 'Random', value: 'random' },
        { label: 'Weekly View', value: 'weekly_rank' },
        { label: 'Monthly View', value: 'monthly_rank' },
        { label: 'All-Time View', value: 'view' },
        { label: 'Name', value: 'name' },
        { label: 'Reader', value: 'reader' },
        { label: 'Chapter', value: 'chapter' },
        { label: 'Rating', value: 'rating' },
        { label: 'Review Count', value: 'total_rate' },
        { label: 'Vote Count', value: 'vote' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      value: 'desc',
      label: 'Order',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
    release_status: {
      value: 'all',
      label: 'Release Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Released', value: 'released' },
        { label: 'On Voting', value: 'voting' },
      ],
      type: FilterTypes.Picker,
    },
    addition_age: {
      value: 'all',
      label: 'Addition Age',
      options: [
        { label: 'All', value: 'all' },
        { label: '< 2 Days', value: 'day' },
        { label: '< 1 Week', value: 'week' },
        { label: '< 1 Month', value: 'month' },
      ],
      type: FilterTypes.Picker,
    },
    min_chapters: {
      value: '',
      label: 'Minimum Chapters',
      type: FilterTypes.TextInput,
    },
    min_rating: {
      value: '',
      label: 'Minimum Rating (0.0-5.0)',
      type: FilterTypes.TextInput,
    },
    min_review_count: {
      value: '',
      label: 'Minimum Review Count',
      type: FilterTypes.TextInput,
    },
    genre_operator: {
      value: 'and',
      label: 'Genre (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: { include: [], exclude: [] },
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Erciyuan', value: 'erciyuan' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender-Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Josei', value: 'josei' },
        { label: 'Martial-Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School-Life', value: 'school-life' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo-Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen-Ai', value: 'shounen-ai' },
        { label: 'Slice-Of-Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban-Life', value: 'urban-life' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    tag_operator: {
      value: 'and',
      label: 'Tag (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },

    tags: {
      label: 'Tags',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Abandoned Children', value: '1' },
        { label: 'Ability Steal', value: '2' },
        { label: 'Absent Parents', value: '3' },
        { label: 'Abusive Characters', value: '4' },
        { label: 'Academy', value: '5' },
        { label: 'Accelerated Growth', value: '6' },
        { label: 'Acting', value: '7' },
        { label: 'Adapted from Manga', value: '8' },
        { label: 'Adapted from Manhua', value: '9' },
        { label: 'Adapted to Anime', value: '10' },
        { label: 'Adapted to Drama', value: '11' },
        { label: 'Adapted to Drama CD', value: '12' },
        { label: 'Adapted to Game', value: '13' },
        { label: 'Adapted to Manga', value: '14' },
        { label: 'Adapted to Manhua', value: '15' },
        { label: 'Adapted to Manhwa', value: '16' },
        { label: 'Adapted to Movie', value: '17' },
        { label: 'Adapted to Visual Novel', value: '18' },
        { label: 'Adopted Children', value: '19' },
        { label: 'Adopted Protagonist', value: '20' },
        { label: 'Adultery', value: '21' },
        { label: 'Adventurers', value: '22' },
        { label: 'Affair', value: '23' },
        { label: 'Age Progression', value: '24' },
        { label: 'Age Regression', value: '25' },
        { label: 'Aggressive Characters', value: '26' },
        { label: 'Alchemy', value: '27' },
        { label: 'Aliens', value: '28' },
        { label: 'All-Girls School', value: '29' },
        { label: 'Alternate World', value: '30' },
        { label: 'Amnesia', value: '31' },
        { label: 'Amusement Park', value: '32' },
        { label: 'Anal', value: '33' },
        { label: 'Ancient China', value: '34' },
        { label: 'Ancient Times', value: '35' },
        { label: 'Androgynous Characters', value: '36' },
        { label: 'Androids', value: '37' },
        { label: 'Angels', value: '38' },
        { label: 'Animal Characteristics', value: '39' },
        { label: 'Animal Rearing', value: '40' },
        { label: 'Anti-Magic', value: '41' },
        { label: 'Anti-social Protagonist', value: '42' },
        { label: 'Antihero Protagonist', value: '43' },
        { label: 'Antique Shop', value: '44' },
        { label: 'Apartment Life', value: '45' },
        { label: 'Apathetic Protagonist', value: '46' },
        { label: 'Apocalypse', value: '47' },
        { label: 'Appearance Changes', value: '48' },
        { label: 'Appearance Different from Actual Age', value: '49' },
        { label: 'Archery', value: '50' },
        { label: 'Aristocracy', value: '51' },
        { label: 'Arms Dealers', value: '52' },
        { label: 'Army', value: '53' },
        { label: 'Army Building', value: '54' },
        { label: 'Arranged Marriage', value: '55' },
        { label: 'Array', value: '822' },
        { label: 'Arrogant Characters', value: '56' },
        { label: 'Artifact Crafting', value: '57' },
        { label: 'Artifacts', value: '58' },
        { label: 'Artificial Intelligence', value: '59' },
        { label: 'Artists', value: '60' },
        { label: 'Assassins', value: '61' },
        { label: 'Astrologers', value: '62' },
        { label: 'Autism', value: '63' },
        { label: 'Automatons', value: '64' },
        { label: 'Average-looking Protagonist', value: '65' },
        { label: 'Award-winning Work', value: '66' },
        { label: 'Awkward Protagonist', value: '67' },
        { label: 'Bands', value: '68' },
        { label: 'Based on a Movie', value: '69' },
        { label: 'Based on a Song', value: '70' },
        { label: 'Based on a TV Show', value: '71' },
        { label: 'Based on a Video Game', value: '72' },
        { label: 'Based on a Visual Novel', value: '73' },
        { label: 'Based on an Anime', value: '74' },
        { label: 'Basketball', value: '809' },
        { label: 'Battle Academy', value: '75' },
        { label: 'Battle Competition', value: '76' },
        { label: 'BDSM', value: '77' },
        { label: 'Beast Companions', value: '78' },
        { label: 'Beastkin', value: '79' },
        { label: 'Beasts', value: '80' },
        { label: 'Beautiful Female Lead', value: '81' },
        { label: 'Bestiality', value: '82' },
        { label: 'Betrayal', value: '83' },
        { label: 'Bickering Couple', value: '84' },
        { label: 'Biochip', value: '85' },
        { label: 'Bisexual Protagonist', value: '86' },
        { label: 'Black Belly', value: '87' },
        { label: 'Blackmail', value: '88' },
        { label: 'Blacksmith', value: '89' },
        { label: 'Bleach', value: '770' },
        { label: 'Blind Dates', value: '90' },
        { label: 'Blind Protagonist', value: '91' },
        { label: 'Blood Manipulation', value: '92' },
        { label: 'Bloodlines', value: '93' },
        { label: 'Body Swap', value: '94' },
        { label: 'Body Tempering', value: '95' },
        { label: 'Body-double', value: '96' },
        { label: 'Bodyguards', value: '97' },
        { label: 'Books', value: '98' },
        { label: 'Bookworm', value: '99' },
        { label: 'Boss-Subordinate Relationship', value: '100' },
        { label: 'Brainwashing', value: '101' },
        { label: 'Breast Fetish', value: '102' },
        { label: 'Broken Engagement', value: '103' },
        { label: 'Brother Complex', value: '104' },
        { label: 'Brotherhood', value: '105' },
        { label: 'Buddhism', value: '106' },
        { label: 'Bullying', value: '107' },
        { label: 'Business Management', value: '108' },
        { label: 'Business Wars', value: '806' },
        { label: 'Businessmen', value: '109' },
        { label: 'Butlers', value: '110' },
        { label: 'Calm Protagonist', value: '111' },
        { label: 'Cannibalism', value: '112' },
        { label: 'Card Games', value: '113' },
        { label: 'Carefree Protagonist', value: '114' },
        { label: 'Caring Protagonist', value: '115' },
        { label: 'Cautious Protagonist', value: '116' },
        { label: 'Celebrities', value: '117' },
        { label: 'Character Growth', value: '118' },
        { label: 'Charismatic Protagonist', value: '119' },
        { label: 'Charming Protagonist', value: '120' },
        { label: 'Chat Rooms', value: '121' },
        { label: 'Cheats', value: '122' },
        { label: 'Chefs', value: '123' },
        { label: 'Child Abuse', value: '124' },
        { label: 'Child Protagonist', value: '125' },
        { label: 'Childcare', value: '126' },
        { label: 'Childhood Friends', value: '127' },
        { label: 'Childhood Love', value: '128' },
        { label: 'Childhood Promise', value: '129' },
        { label: 'Childish Protagonist', value: '130' },
        { label: 'Chuunibyou', value: '131' },
        { label: 'Clan Building', value: '132' },
        { label: 'Class Awakening', value: '827' },
        { label: 'Classic', value: '133' },
        { label: 'Clever Protagonist', value: '134' },
        { label: 'Clingy Lover', value: '135' },
        { label: 'Clones', value: '136' },
        { label: 'Clubs', value: '137' },
        { label: 'Clumsy Love Interests', value: '138' },
        { label: 'Co-Workers', value: '139' },
        { label: 'Cohabitation', value: '140' },
        { label: 'Cold Love Interests', value: '141' },
        { label: 'Cold Protagonist', value: '142' },
        { label: 'Collection of Short Stories', value: '143' },
        { label: 'College/University', value: '144' },
        { label: 'Coma', value: '145' },
        { label: 'Comedic Undertone', value: '146' },
        { label: 'Coming of Age', value: '147' },
        { label: 'Complex Family Relationships', value: '148' },
        { label: 'Conditional Power', value: '149' },
        { label: 'Conferred Gods', value: '800' },
        { label: 'Confident Protagonist', value: '150' },
        { label: 'Confinement', value: '151' },
        { label: 'Conflicting Loyalties', value: '152' },
        { label: 'Contracts', value: '153' },
        { label: 'Cooking', value: '154' },
        { label: 'Copy', value: '807' },
        { label: 'Corruption', value: '155' },
        { label: 'Cosmic Wars', value: '156' },
        { label: 'Cosplay', value: '157' },
        { label: 'Couple Growth', value: '158' },
        { label: 'Court Official', value: '159' },
        { label: 'Cousins', value: '160' },
        { label: 'Cowardly Protagonist', value: '161' },
        { label: 'Crafting', value: '162' },
        { label: 'Crime', value: '163' },
        { label: 'Criminals', value: '164' },
        { label: 'Cross-dressing', value: '165' },
        { label: 'Crossover', value: '166' },
        { label: 'Cruel Characters', value: '167' },
        { label: 'Cryostasis', value: '168' },
        { label: 'Cultivation', value: '169' },
        { label: 'Cunnilingus', value: '170' },
        { label: 'Cunning Protagonist', value: '171' },
        { label: 'Curious Protagonist', value: '172' },
        { label: 'Curses', value: '173' },
        { label: 'Cute Children', value: '174' },
        { label: 'Cute Protagonist', value: '175' },
        { label: 'Cute Story', value: '176' },
        { label: 'Cyberpunk 2077', value: '783' },
        { label: 'Dancers', value: '177' },
        { label: 'Dao Companion', value: '178' },
        { label: 'Dao Comprehension', value: '179' },
        { label: 'Daoism', value: '180' },
        { label: 'Dark', value: '181' },
        { label: 'Dark Fantasy', value: '789' },
        { label: 'DC Universe', value: '778' },
        { label: 'Dead Protagonist', value: '182' },
        { label: 'Death', value: '183' },
        { label: 'Death of Loved Ones', value: '184' },
        { label: 'Debts', value: '185' },
        { label: 'Delinquents', value: '186' },
        { label: 'Delusions', value: '187' },
        { label: 'Demi-Humans', value: '188' },
        { label: 'Demon Lord', value: '189' },
        { label: 'Demon Slayer', value: '812' },
        { label: 'Demonic Cultivation Technique', value: '190' },
        { label: 'Demons', value: '191' },
        { label: 'Dense Protagonist', value: '192' },
        { label: 'Depictions of Cruelty', value: '193' },
        { label: 'Depression', value: '194' },
        { label: 'Destiny', value: '195' },
        { label: 'Detective Conan', value: '804' },
        { label: 'Detectives', value: '196' },
        { label: 'Determined Protagonist', value: '197' },
        { label: 'Devoted Love Interests', value: '198' },
        { label: 'Devouring', value: '797' },
        { label: 'Different Social Status', value: '199' },
        { label: 'Disabilities', value: '200' },
        { label: 'Discrimination', value: '201' },
        { label: 'Disfigurement', value: '202' },
        { label: 'Dishonest Protagonist', value: '203' },
        { label: 'Distrustful Protagonist', value: '204' },
        { label: 'Divination', value: '205' },
        { label: 'Divine Protection', value: '206' },
        { label: 'Divorce', value: '207' },
        { label: 'DnD', value: '794' },
        { label: 'Doctors', value: '208' },
        { label: 'Dolls/Puppets', value: '209' },
        { label: 'Domestic Affairs', value: '210' },
        { label: 'Doting Love Interests', value: '211' },
        { label: 'Doting Older Siblings', value: '212' },
        { label: 'Doting Parents', value: '213' },
        { label: 'Douluo Dalu', value: '772' },
        { label: 'Dragon Ball', value: '773' },
        { label: 'Dragon Riders', value: '214' },
        { label: 'Dragon Slayers', value: '215' },
        { label: 'Dragons', value: '216' },
        { label: 'Dreams', value: '217' },
        { label: 'Drugs', value: '218' },
        { label: 'Druids', value: '219' },
        { label: 'Dungeon Master', value: '220' },
        { label: 'Dungeons', value: '221' },
        { label: 'Dwarfs', value: '222' },
        { label: 'Dystopia', value: '223' },
        { label: 'e-Sports', value: '224' },
        { label: 'Early Romance', value: '225' },
        { label: 'Earth Invasion', value: '226' },
        { label: 'Easy Going Life', value: '227' },
        { label: 'Eavesdropping', value: '798' },
        { label: 'Economics', value: '228' },
        { label: 'Editors', value: '229' },
        { label: 'Eidetic Memory', value: '230' },
        { label: 'Elderly Protagonist', value: '231' },
        { label: 'Elemental Magic', value: '232' },
        { label: 'Elves', value: '233' },
        { label: 'Emotionally Weak Protagonist', value: '234' },
        { label: 'Empires', value: '235' },
        { label: 'Enemies Become Allies', value: '236' },
        { label: 'Enemies Become Lovers', value: '237' },
        { label: 'Engagement', value: '238' },
        { label: 'Engineer', value: '239' },
        { label: 'Enlightenment', value: '240' },
        { label: 'Episodic', value: '241' },
        { label: 'Eunuch', value: '242' },
        { label: 'European Ambience', value: '243' },
        { label: 'Evil Gods', value: '244' },
        { label: 'Evil Organizations', value: '245' },
        { label: 'Evil Protagonist', value: '246' },
        { label: 'Evil Religions', value: '247' },
        { label: 'Evolution', value: '248' },
        { label: 'Exhibitionism', value: '249' },
        { label: 'Exorcism', value: '250' },
        { label: 'Eye Powers', value: '251' },
        { label: 'Fairies', value: '252' },
        { label: 'Fairy Tail', value: '814' },
        { label: 'Faith Dependent Deities', value: '808' },
        { label: 'Fallen Angels', value: '253' },
        { label: 'Fallen Nobility', value: '254' },
        { label: 'Familial Love', value: '255' },
        { label: 'Familiars', value: '256' },
        { label: 'Family', value: '257' },
        { label: 'Family Business', value: '258' },
        { label: 'Family Conflict', value: '259' },
        { label: 'Famous Parents', value: '260' },
        { label: 'Famous Protagonist', value: '261' },
        { label: 'Fanaticism', value: '262' },
        { label: 'Fanfiction', value: '263' },
        { label: 'Fantasy Creatures', value: '264' },
        { label: 'Fantasy World', value: '265' },
        { label: 'Farming', value: '266' },
        { label: 'Fast Cultivation', value: '267' },
        { label: 'Fast Learner', value: '268' },
        { label: 'Fat Protagonist', value: '269' },
        { label: 'Fat to Fit', value: '270' },
        { label: 'Fated Lovers', value: '271' },
        { label: 'Fearless Protagonist', value: '272' },
        { label: 'Fellatio', value: '273' },
        { label: 'Female Master', value: '274' },
        { label: 'Female Protagonist', value: '275' },
        { label: 'Female to Male', value: '276' },
        { label: 'Feng Shui', value: '277' },
        { label: 'Firearms', value: '278' },
        { label: 'First Love', value: '279' },
        { label: 'First-time Intercourse', value: '280' },
        { label: 'Flashbacks', value: '281' },
        { label: 'Fleet Battles', value: '282' },
        { label: 'Folklore', value: '283' },
        { label: 'Football', value: '780' },
        { label: 'Forced into a Relationship', value: '284' },
        { label: 'Forced Living Arrangements', value: '285' },
        { label: 'Forced Marriage', value: '286' },
        { label: 'Forgetful Protagonist', value: '287' },
        { label: 'Former Hero', value: '288' },
        { label: 'Fox Spirits', value: '289' },
        { label: 'Friends Become Enemies', value: '290' },
        { label: 'Friendship', value: '291' },
        { label: 'Frieren', value: '816' },
        { label: 'Fujoshi', value: '292' },
        { label: 'Futanari', value: '293' },
        { label: 'Futuristic Setting', value: '294' },
        { label: 'Galge', value: '295' },
        { label: 'Gambling', value: '296' },
        { label: 'Game Creator', value: '784' },
        { label: 'Game Elements', value: '297' },
        { label: 'Game of Thrones', value: '813' },
        { label: 'Game Ranking System', value: '298' },
        { label: 'Gamers', value: '299' },
        { label: 'Gangs', value: '300' },
        { label: 'Gao Wu', value: '781' },
        { label: 'Gate to Another World', value: '301' },
        { label: 'Genderless Protagonist', value: '302' },
        { label: 'Generals', value: '303' },
        { label: 'Genetic Modifications', value: '304' },
        { label: 'Genies', value: '305' },
        { label: 'Genius Protagonist', value: '306' },
        { label: 'Genshin Impact', value: '815' },
        { label: 'Ghosts', value: '307' },
        { label: 'Gladiators', value: '308' },
        { label: 'Glasses-wearing Love Interests', value: '309' },
        { label: 'Glasses-wearing Protagonist', value: '310' },
        { label: 'Goblins', value: '311' },
        { label: 'God Protagonist', value: '312' },
        { label: 'God-human Relationship', value: '313' },
        { label: 'Goddesses', value: '314' },
        { label: 'Godly Powers', value: '315' },
        { label: 'Gods', value: '316' },
        { label: 'Golems', value: '317' },
        { label: 'Gore', value: '318' },
        { label: 'Grave Keepers', value: '319' },
        { label: 'Grinding', value: '320' },
        { label: 'Guardian Relationship', value: '321' },
        { label: 'Guilds', value: '322' },
        { label: 'Gunfighters', value: '323' },
        { label: 'Hackers', value: '324' },
        { label: 'Half-human Protagonist', value: '325' },
        { label: 'Handjob', value: '326' },
        { label: 'Handsome Male Lead', value: '327' },
        { label: 'Hard-Working Protagonist', value: '328' },
        { label: 'Harem-seeking Protagonist', value: '329' },
        { label: 'Harry Potter', value: '768' },
        { label: 'Harsh Training', value: '330' },
        { label: 'Hated Protagonist', value: '331' },
        { label: 'Healers', value: '332' },
        { label: 'Heartwarming', value: '333' },
        { label: 'Heaven', value: '334' },
        { label: 'Heavenly Defying Comprehension', value: '803' },
        { label: 'Heavenly Tribulation', value: '335' },
        { label: 'Hell', value: '336' },
        { label: 'Helpful Protagonist', value: '337' },
        { label: 'Herbalist', value: '338' },
        { label: 'Heroes', value: '339' },
        { label: 'Heterochromia', value: '340' },
        { label: 'Hidden Abilities', value: '341' },
        { label: 'Hiding True Abilities', value: '342' },
        { label: 'Hiding True Identity', value: '343' },
        { label: 'Hikikomori', value: '344' },
        { label: 'Hollywood', value: '779' },
        { label: 'Homunculus', value: '345' },
        { label: 'Honest Protagonist', value: '346' },
        { label: 'Hong Kong', value: '821' },
        { label: 'Honghuang', value: '801' },
        { label: 'Honkai', value: '818' },
        { label: 'Hospital', value: '347' },
        { label: 'Hot-blooded Protagonist', value: '348' },
        { label: 'Human Experimentation', value: '349' },
        { label: 'Human Weapon', value: '350' },
        { label: 'Human-Nonhuman Relationship', value: '351' },
        { label: 'Humanoid Protagonist', value: '352' },
        { label: 'Hunter x Hunter', value: '777' },
        { label: 'Hunters', value: '353' },
        { label: 'Hypnotism', value: '354' },
        { label: 'Identity Crisis', value: '355' },
        { label: 'Imaginary Friend', value: '356' },
        { label: 'Immortals', value: '357' },
        { label: 'Imperial Harem', value: '358' },
        { label: 'Incest', value: '359' },
        { label: 'Incubus', value: '360' },
        { label: 'Indecisive Protagonist', value: '361' },
        { label: 'Industrialization', value: '362' },
        { label: 'Inferiority Complex', value: '363' },
        { label: 'Inheritance', value: '364' },
        { label: 'Inscriptions', value: '365' },
        { label: 'Insects', value: '366' },
        { label: 'Interconnected Storylines', value: '367' },
        { label: 'Interdimensional Travel', value: '368' },
        { label: 'Introverted Protagonist', value: '369' },
        { label: 'Investigations', value: '370' },
        { label: 'Invisibility', value: '371' },
        { label: 'Jack of All Trades', value: '372' },
        { label: 'Jealousy', value: '373' },
        { label: 'Jiangshi', value: '374' },
        { label: 'Jobless Class', value: '375' },
        { label: 'Journey to the West', value: '796' },
        { label: 'JSDF', value: '376' },
        { label: 'Jujutsu Kaisen', value: '776' },
        { label: 'Kidnappings', value: '377' },
        { label: 'Kimetsu no Yaiba', value: '805' },
        { label: 'Kind Love Interests', value: '378' },
        { label: 'Kingdom Building', value: '379' },
        { label: 'Kingdoms', value: '380' },
        { label: 'Knights', value: '381' },
        { label: 'Kuudere', value: '382' },
        { label: 'Lack of Common Sense', value: '383' },
        { label: 'Language Barrier', value: '384' },
        { label: 'Late Romance', value: '385' },
        { label: 'Lawyers', value: '386' },
        { label: 'Lazy Protagonist', value: '387' },
        { label: 'Leadership', value: '388' },
        { label: 'League of Legends', value: '791' },
        { label: 'Legends', value: '389' },
        { label: 'Level System', value: '390' },
        { label: 'Library', value: '391' },
        { label: 'Life Script', value: '824' },
        { label: 'Limited Lifespan', value: '392' },
        { label: 'Live Streaming', value: '782' },
        { label: 'Living Abroad', value: '393' },
        { label: 'Living Alone', value: '394' },
        { label: 'Loli', value: '395' },
        { label: 'Loneliness', value: '396' },
        { label: 'Loner Protagonist', value: '397' },
        { label: 'Long Separations', value: '398' },
        { label: 'Long-distance Relationship', value: '399' },
        { label: 'Lord', value: '823' },
        { label: 'Lord of the Mysteries', value: '799' },
        { label: 'Lost Civilizations', value: '400' },
        { label: 'Lottery', value: '401' },
        { label: 'Love at First Sight', value: '402' },
        { label: 'Love Interest Falls in Love First', value: '403' },
        { label: 'Love Rivals', value: '404' },
        { label: 'Love Triangles', value: '405' },
        { label: 'Lovers Reunited', value: '406' },
        { label: 'Low-key Protagonist', value: '407' },
        { label: 'Loyal Subordinates', value: '408' },
        { label: 'Lucky Protagonist', value: '409' },
        { label: 'Magic', value: '410' },
        { label: 'Magic Beasts', value: '411' },
        { label: 'Magic Formations', value: '412' },
        { label: 'Magical Girls', value: '413' },
        { label: 'Magical Space', value: '414' },
        { label: 'Magical Technology', value: '415' },
        { label: 'Maids', value: '416' },
        { label: 'Male Protagonist', value: '417' },
        { label: 'Male to Female', value: '418' },
        { label: 'Male Yandere', value: '419' },
        { label: 'Management', value: '420' },
        { label: 'Mangaka', value: '421' },
        { label: 'Manipulative Characters', value: '422' },
        { label: 'Manly Gay Couple', value: '423' },
        { label: 'Marriage', value: '424' },
        { label: 'Marriage of Convenience', value: '425' },
        { label: 'Martial Spirits', value: '426' },
        { label: 'Marvel', value: '766' },
        { label: 'Masochistic Characters', value: '427' },
        { label: 'Master-Disciple Relationship', value: '428' },
        { label: 'Master-Servant Relationship', value: '429' },
        { label: 'Masturbation', value: '430' },
        { label: 'Matriarchy', value: '431' },
        { label: 'Mature Protagonist', value: '432' },
        { label: 'Medical Knowledge', value: '433' },
        { label: 'Medieval', value: '434' },
        { label: 'Mercenaries', value: '435' },
        { label: 'Merchants', value: '436' },
        { label: 'Military', value: '437' },
        { label: 'Mind Break', value: '438' },
        { label: 'Mind Control', value: '439' },
        { label: 'Minecraft', value: '790' },
        { label: 'Misandry', value: '440' },
        { label: 'Mismatched Couple', value: '441' },
        { label: 'Misunderstandings', value: '442' },
        { label: 'MMORPG', value: '443' },
        { label: 'Mob Protagonist', value: '444' },
        { label: 'Models', value: '445' },
        { label: 'Modern Day', value: '446' },
        { label: 'Modern Knowledge', value: '447' },
        { label: 'Money Grubber', value: '448' },
        { label: 'Monster Girls', value: '449' },
        { label: 'Monster Society', value: '450' },
        { label: 'Monster Tamer', value: '451' },
        { label: 'Monsters', value: '452' },
        { label: 'More Children More Blessings', value: '825' },
        { label: 'Mortal Flow', value: '792' },
        { label: 'Movies', value: '453' },
        { label: 'Mpreg', value: '454' },
        { label: 'Multiple Identities', value: '455' },
        { label: 'Multiple Personalities', value: '456' },
        { label: 'Multiple POV', value: '457' },
        { label: 'Multiple Protagonists', value: '458' },
        { label: 'Multiple Realms', value: '459' },
        { label: 'Multiple Reincarnated Individuals', value: '460' },
        { label: 'Multiple Timelines', value: '461' },
        { label: 'Multiple Transported Individuals', value: '462' },
        { label: 'Murders', value: '463' },
        { label: 'Music', value: '464' },
        { label: 'Mutated Creatures', value: '465' },
        { label: 'Mutations', value: '466' },
        { label: 'Mute Character', value: '467' },
        { label: 'Mysterious Family Background', value: '468' },
        { label: 'Mysterious Illness', value: '469' },
        { label: 'Mysterious Past', value: '470' },
        { label: 'Mystery Solving', value: '471' },
        { label: 'Mythical Beasts', value: '472' },
        { label: 'Mythology', value: '473' },
        { label: 'Naive Protagonist', value: '474' },
        { label: 'Narcissistic Protagonist', value: '475' },
        { label: 'Naruto', value: '769' },
        { label: 'Nationalism', value: '476' },
        { label: 'Near-Death Experience', value: '477' },
        { label: 'Necromancer', value: '478' },
        { label: 'Neet', value: '479' },
        { label: 'Netorare', value: '480' },
        { label: 'Netorase', value: '481' },
        { label: 'Netori', value: '482' },
        { label: 'Nightmares', value: '483' },
        { label: 'Ninjas', value: '484' },
        { label: 'Nobles', value: '485' },
        { label: 'Non-humanoid Protagonist', value: '486' },
        { label: 'Non-linear Storytelling', value: '487' },
        { label: 'Nudity', value: '488' },
        { label: 'Nurses', value: '489' },
        { label: 'Obsessive Love', value: '490' },
        { label: 'Office Romance', value: '491' },
        { label: 'Older Love Interests', value: '492' },
        { label: 'Omegaverse', value: '493' },
        { label: 'One Piece', value: '767' },
        { label: 'Oneshot', value: '494' },
        { label: 'Online Romance', value: '495' },
        { label: 'Onmyouji', value: '496' },
        { label: 'Orcs', value: '497' },
        { label: 'Organized Crime', value: '498' },
        { label: 'Orgy', value: '499' },
        { label: 'Orphans', value: '500' },
        { label: 'Otaku', value: '501' },
        { label: 'Otome Game', value: '502' },
        { label: 'Outcasts', value: '503' },
        { label: 'Outdoor Intercourse', value: '504' },
        { label: 'Outer Space', value: '505' },
        { label: 'Overlord', value: '826' },
        { label: 'Overpowered Protagonist', value: '506' },
        { label: 'Overprotective Siblings', value: '507' },
        { label: 'Pacifist Protagonist', value: '508' },
        { label: 'Paizuri', value: '509' },
        { label: 'Parallel Worlds', value: '510' },
        { label: 'Parasites', value: '511' },
        { label: 'Parent Complex', value: '512' },
        { label: 'Parody', value: '513' },
        { label: 'Part-Time Job', value: '514' },
        { label: 'Past Plays a Big Role', value: '515' },
        { label: 'Past Trauma', value: '516' },
        { label: 'Persistent Love Interests', value: '517' },
        { label: 'Personality Changes', value: '518' },
        { label: 'Perverted Protagonist', value: '519' },
        { label: 'Pets', value: '520' },
        { label: 'Pharmacist', value: '521' },
        { label: 'Philosophical', value: '522' },
        { label: 'Phobias', value: '523' },
        { label: 'Phoenixes', value: '524' },
        { label: 'Photography', value: '525' },
        { label: 'Pill Based Cultivation', value: '526' },
        { label: 'Pill Concocting', value: '527' },
        { label: 'Pilots', value: '528' },
        { label: 'Pirates', value: '529' },
        { label: 'Playboys', value: '530' },
        { label: 'Playful Protagonist', value: '531' },
        { label: 'Poetry', value: '532' },
        { label: 'Poisons', value: '533' },
        { label: 'Pokemon', value: '771' },
        { label: 'Police', value: '534' },
        { label: 'Polite Protagonist', value: '535' },
        { label: 'Politics', value: '536' },
        { label: 'Polyandry', value: '537' },
        { label: 'Polygamy', value: '538' },
        { label: 'Poor Protagonist', value: '539' },
        { label: 'Poor to Rich', value: '540' },
        { label: 'Popular Love Interests', value: '541' },
        { label: 'Possession', value: '542' },
        { label: 'Possessive Characters', value: '543' },
        { label: 'Post-apocalyptic', value: '544' },
        { label: 'Power Couple', value: '545' },
        { label: 'Power Struggle', value: '546' },
        { label: 'Pragmatic Protagonist', value: '547' },
        { label: 'Precognition', value: '548' },
        { label: 'Pregnancy', value: '549' },
        { label: 'Pretend Lovers', value: '550' },
        { label: 'Previous Life Talent', value: '551' },
        { label: 'Priestesses', value: '552' },
        { label: 'Priests', value: '553' },
        { label: 'Prison', value: '554' },
        { label: 'Proactive Protagonist', value: '555' },
        { label: 'Proficiency', value: '793' },
        { label: 'Programmer', value: '556' },
        { label: 'Prophecies', value: '557' },
        { label: 'Prostitutes', value: '558' },
        { label: 'Protagonist Falls in Love First', value: '559' },
        { label: 'Protagonist Strong from the Start', value: '560' },
        { label: 'Protagonist with Multiple Bodies', value: '561' },
        { label: 'Psychic Powers', value: '562' },
        { label: 'Psychopaths', value: '563' },
        { label: 'Puppeteers', value: '564' },
        { label: 'Quiet Characters', value: '565' },
        { label: 'Quirky Characters', value: '566' },
        { label: 'R-15', value: '567' },
        { label: 'R-18', value: '568' },
        { label: 'Race Change', value: '569' },
        { label: 'Racism', value: '570' },
        { label: 'Rape', value: '571' },
        { label: 'Rape Victim Becomes Lover', value: '572' },
        { label: 'Reality-Game Fusion', value: '830' },
        { label: 'Rebellion', value: '573' },
        { label: 'Reborn', value: '829' },
        { label: 'Reborn as the Villain', value: '831' },
        { label: 'Reincarnated as a Monster', value: '574' },
        { label: 'Reincarnated as an Object', value: '575' },
        { label: 'Reincarnated in a Game World', value: '576' },
        { label: 'Reincarnated in Another World', value: '577' },
        { label: 'Reincarnation', value: '578' },
        { label: 'Religions', value: '579' },
        { label: 'Reluctant Protagonist', value: '580' },
        { label: 'Reporters', value: '581' },
        { label: 'Restaurant', value: '582' },
        { label: 'Resurrection', value: '583' },
        { label: 'Returning from Another World', value: '584' },
        { label: 'Revenge', value: '585' },
        { label: 'Reverse Harem', value: '586' },
        { label: 'Reverse Rape', value: '587' },
        { label: 'Reversible Couple', value: '588' },
        { label: 'Rich to Poor', value: '589' },
        { label: 'Righteous Protagonist', value: '590' },
        { label: 'Rivalry', value: '591' },
        { label: 'Romantic Subplot', value: '592' },
        { label: 'Roommates', value: '593' },
        { label: 'Royalty', value: '594' },
        { label: 'Ruthless Protagonist', value: '595' },
        { label: 'Sadistic Characters', value: '596' },
        { label: 'Saints', value: '597' },
        { label: 'Salaryman', value: '598' },
        { label: 'Samurai', value: '599' },
        { label: 'Saving the World', value: '600' },
        { label: 'Schemes And Conspiracies', value: '601' },
        { label: 'Schizophrenia', value: '602' },
        { label: 'Scientists', value: '603' },
        { label: 'Sculptors', value: '604' },
        { label: 'Sealed Power', value: '605' },
        { label: 'Second Chance', value: '606' },
        { label: 'Secret Crush', value: '607' },
        { label: 'Secret Identity', value: '608' },
        { label: 'Secret Organizations', value: '609' },
        { label: 'Secret Relationship', value: '610' },
        { label: 'Secretive Protagonist', value: '611' },
        { label: 'Secrets', value: '612' },
        { label: 'Sect Development', value: '613' },
        { label: 'Seduction', value: '614' },
        { label: "Seeing Things Other Humans Can't", value: '615' },
        { label: 'Selfish Protagonist', value: '616' },
        { label: 'Selfless Protagonist', value: '617' },
        { label: 'Seme Protagonist', value: '618' },
        { label: 'Senpai-Kouhai Relationship', value: '619' },
        { label: 'Sentient Objects', value: '620' },
        { label: 'Sentimental Protagonist', value: '621' },
        { label: 'Serial Killers', value: '622' },
        { label: 'Servants', value: '623' },
        { label: 'Seven Deadly Sins', value: '624' },
        { label: 'Seven Virtues', value: '625' },
        { label: 'Sex Friends', value: '626' },
        { label: 'Sex Slaves', value: '627' },
        { label: 'Sexual Abuse', value: '628' },
        { label: 'Sexual Cultivation Technique', value: '629' },
        { label: 'Shameless Protagonist', value: '630' },
        { label: 'Shapeshifters', value: '631' },
        { label: 'Sharing A Body', value: '632' },
        { label: 'Sharp-tongued Characters', value: '633' },
        { label: 'Shield User', value: '634' },
        { label: 'Shikigami', value: '635' },
        { label: 'Short Story', value: '636' },
        { label: 'Shota', value: '637' },
        { label: 'Shoujo-Ai Subplot', value: '638' },
        { label: 'Shounen-Ai Subplot', value: '639' },
        { label: 'Showbiz', value: '640' },
        { label: 'Shy Characters', value: '641' },
        { label: 'Sibling Rivalry', value: '642' },
        { label: "Sibling's Care", value: '643' },
        { label: 'Siblings', value: '644' },
        { label: 'Siblings Not Related by Blood', value: '645' },
        { label: 'Sickly Characters', value: '646' },
        { label: 'Sign In', value: '811' },
        { label: 'Sign Language', value: '647' },
        { label: 'Siheyuan', value: '820' },
        { label: 'Simulator', value: '786' },
        { label: 'Singers', value: '648' },
        { label: 'Single Female Lead', value: '787' },
        { label: 'Single Parent', value: '649' },
        { label: 'Sister Complex', value: '650' },
        { label: 'Skill Assimilation', value: '651' },
        { label: 'Skill Books', value: '652' },
        { label: 'Skill Creation', value: '653' },
        { label: 'Slave Harem', value: '654' },
        { label: 'Slave Protagonist', value: '655' },
        { label: 'Slaves', value: '656' },
        { label: 'Sleeping', value: '657' },
        { label: 'Slow Growth at Start', value: '658' },
        { label: 'Slow Romance', value: '659' },
        { label: 'Smart Couple', value: '660' },
        { label: 'Social Outcasts', value: '661' },
        { label: 'Soldiers', value: '662' },
        { label: 'Soul Power', value: '663' },
        { label: 'Souls', value: '664' },
        { label: 'Spatial Manipulation', value: '665' },
        { label: 'Spear Wielder', value: '666' },
        { label: 'Special Abilities', value: '667' },
        { label: 'Spies', value: '668' },
        { label: 'Spirit Advisor', value: '669' },
        { label: 'Spirit Users', value: '670' },
        { label: 'Spirits', value: '671' },
        { label: 'Spiritual Energy Revival', value: '828' },
        { label: 'Stalkers', value: '672' },
        { label: 'Star Wars', value: '817' },
        { label: 'Stockholm Syndrome', value: '673' },
        { label: 'Stoic Characters', value: '674' },
        { label: 'Store Owner', value: '675' },
        { label: 'Straight Seme', value: '676' },
        { label: 'Straight Uke', value: '677' },
        { label: 'Strategic Battles', value: '678' },
        { label: 'Strategist', value: '679' },
        { label: 'Strength-based Social Hierarchy', value: '680' },
        { label: 'Strong Love Interests', value: '681' },
        { label: 'Strong to Stronger', value: '682' },
        { label: 'Stubborn Protagonist', value: '683' },
        { label: 'Student Council', value: '684' },
        { label: 'Student-Teacher Relationship', value: '685' },
        { label: 'Succubus', value: '686' },
        { label: 'Sudden Strength Gain', value: '687' },
        { label: 'Sudden Wealth', value: '688' },
        { label: 'Suicides', value: '689' },
        { label: 'Summoned Hero', value: '690' },
        { label: 'Summoning Magic', value: '691' },
        { label: 'Survival', value: '692' },
        { label: 'Survival Game', value: '693' },
        { label: 'Swallowed Star', value: '785' },
        { label: 'Sword And Magic', value: '694' },
        { label: 'Sword Wielder', value: '695' },
        { label: 'System', value: '696' },
        { label: 'Teachers', value: '697' },
        { label: 'Teamwork', value: '698' },
        { label: 'Technological Gap', value: '699' },
        { label: 'Tentacles', value: '700' },
        { label: 'Terminal Illness', value: '701' },
        { label: 'Territory Management', value: '802' },
        { label: 'Terrorists', value: '702' },
        { label: 'Thieves', value: '703' },
        { label: 'Three Kingdoms', value: '795' },
        { label: 'Threesome', value: '704' },
        { label: 'Thriller', value: '705' },
        { label: 'Time Loop', value: '706' },
        { label: 'Time Manipulation', value: '707' },
        { label: 'Time Paradox', value: '708' },
        { label: 'Time Skip', value: '709' },
        { label: 'Time Travel', value: '710' },
        { label: 'Timid Protagonist', value: '711' },
        { label: 'Tomboyish Female Lead', value: '712' },
        { label: 'Torture', value: '713' },
        { label: 'Toys', value: '714' },
        { label: 'Tragic Past', value: '715' },
        { label: 'Transformation Ability', value: '716' },
        { label: 'Transmigration', value: '717' },
        { label: 'Transplanted Memories', value: '718' },
        { label: 'Transported into a Game World', value: '719' },
        { label: 'Transported Modern Structure', value: '720' },
        { label: 'Transported to Another World', value: '721' },
        { label: 'Trap', value: '722' },
        { label: 'Tribal Society', value: '723' },
        { label: 'Trickster', value: '724' },
        { label: 'Tsundere', value: '725' },
        { label: 'Twins', value: '726' },
        { label: 'Twisted Personality', value: '727' },
        { label: 'Ugly Protagonist', value: '728' },
        { label: 'Ugly to Beautiful', value: '729' },
        { label: 'Unconditional Love', value: '730' },
        { label: 'Undead Protagonist', value: '810' },
        { label: 'Underestimated Protagonist', value: '731' },
        { label: 'Unique Cultivation Technique', value: '732' },
        { label: 'Unique Weapon User', value: '733' },
        { label: 'Unique Weapons', value: '734' },
        { label: 'Unlimited Flow', value: '735' },
        { label: 'Unlucky Protagonist', value: '736' },
        { label: 'Unreliable Narrator', value: '737' },
        { label: 'Unrequited Love', value: '738' },
        { label: 'Valkyries', value: '739' },
        { label: 'Vampires', value: '740' },
        { label: 'Villainess Noble Girls', value: '741' },
        { label: 'Virtual Reality', value: '742' },
        { label: 'Vocaloid', value: '743' },
        { label: 'Voice Actors', value: '744' },
        { label: 'Voyeurism', value: '745' },
        { label: 'Waiters', value: '746' },
        { label: 'War Records', value: '747' },
        { label: 'Warhammer', value: '775' },
        { label: 'Wars', value: '748' },
        { label: 'Weak Protagonist', value: '749' },
        { label: 'Weak to Strong', value: '750' },
        { label: 'Wealthy Characters', value: '751' },
        { label: 'Werebeasts', value: '752' },
        { label: 'Western Names', value: '788' },
        { label: 'Wishes', value: '753' },
        { label: 'Witcher', value: '819' },
        { label: 'Witches', value: '754' },
        { label: 'Wizards', value: '755' },
        { label: 'World Hopping', value: '756' },
        { label: 'World Travel', value: '757' },
        { label: 'World Tree', value: '758' },
        { label: 'Writers', value: '759' },
        { label: 'Yandere', value: '760' },
        { label: 'Youkai', value: '761' },
        { label: 'Younger Brothers', value: '762' },
        { label: 'Younger Love Interests', value: '763' },
        { label: 'Younger Sisters', value: '764' },
        { label: 'Yu-Gi-Oh!', value: '774' },
        { label: 'Zombies', value: '765' },
      ],
    },

    folders: {
      value: '',
      label: 'Library Folders',
      options: [
        { label: 'No Filter', value: '' },
        { label: 'Reading', value: '1' },
        { label: 'Read Later', value: '2' },
        { label: 'Completed', value: '3' },
        { label: 'Trash', value: '5' },
      ],
      type: FilterTypes.Picker,
    },
    library_exclude: {
      value: '',
      label: 'Library Exclude',
      options: [
        { label: 'None', value: '' },
        { label: 'Exclude All', value: 'history' },
        { label: 'Exclude Trash', value: 'trash' },
        { label: 'Exclude Library & Trash', value: 'in_library' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

type NovelJson = {
  props: Props;
  page: string;
  query?: { raw_id: number };
};

type Props = {
  pageProps: PageProps;
  __N_SSP: boolean;
};

type PageProps = {
  serie: Serie;
  server_time: Date;
};

type Serie = {
  serie_data: SerieData;
  chapter: Chapter;
  recommendation: SerieData[];
  chapter_data: ChapterData;
  id: number;
  raw_id: number;
  slug: string;
  data: Data;
  is_default: boolean;
  raw_type: string;
};

type Chapter = {
  serie_id: number;
  id: number;
  raw_id: number;
  order: number;
  slug: string;
  title: string;
  name: string;
  created_at: string;
  updated_at: string;
};
type ApiChapter = {
  serie_id: number;
  id: number;
  order: number;
  title: string;
  name: string;
  updated_at: string;
};

// type GlossaryTerm = {
//   index: number;
//   english: string;
//   chinese: string;
//   symbol: string;
// };
type ChapterData = {
  data: ChapterContent;
};
type ChapterContent = {
  title: string;
  body: string;
  glossary_data?: {
    terms: string[][];
  };
};

type SerieData = {
  serie_id?: number;
  recommendation_id?: number;
  score?: string;
  id: number;
  slug: string;
  search_text: string;
  status: number;
  data: Data;
  created_at: string;
  updated_at: string;
  view: number;
  in_library: number;
  rating: number | null;
  chapter_count: number;
  power: number;
  total_rate: number;
  user_status: number;
  verified: boolean;
  from: null;
  raw_id: number;
  genres?: number[];
};

type Data = {
  title: string;
  author: string;
  description: string;
  image: string;
};

type JsonNovel = {
  success: boolean;
  data: Datum[];
};
type Datum = {
  serie: Serie;
  chapters: Chapter[];
  updated_at: Date;
  raw_id: number;
  slug: string;
  data: Data;
};

export default new WTRLAB();
