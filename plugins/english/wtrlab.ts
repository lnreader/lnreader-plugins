import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { gcm } from '@noble/ciphers/aes.js';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

class WTRLAB implements Plugin.PluginBase {
  id = 'WTRLAB';
  name = 'WTR-LAB';
  site = 'https://wtr-lab.com/';
  version = '1.0.2';
  icon = 'src/en/wtrlab/icon.png';
  sourceLang = 'en/';

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
      params.append('minc', filters.min_chapters.value);
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
        .filter((novel: any) => {
          if (seenIds.has(novel.raw_id)) {
            return false;
          }
          seenIds.add(novel.raw_id);
          return true;
        })
        .map((novel: any) => ({
          name: novel.data.title,
          cover: novel.data.image,
          path: `${this.sourceLang}serie-${novel.raw_id}/${novel.slug}`,
        }));

      return novels;
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const nextDataElement = loadedCheerio('#__NEXT_DATA__');
    const nextDataText = nextDataElement.html();

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

    let rawId: number | null = null;
    let slug: string | null = null;
    let chapterCount = 0;

    const urlMatch = novelPath.match(/serie-(\d+)\/([^/]+)/);
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

    let chapters: Plugin.ChapterItem[] = [];

    if (rawId && slug && chapterCount > 0) {
      try {
        chapters = await this.fetchAllChapters(rawId, chapterCount, slug);
      } catch (error) {
        console.error('Failed to fetch chapters via API:', error);
        chapters = [];
      }
    } else {
      console.warn('Could not extract rawId, slug, or chapterCount from page', {
        rawId,
        slug,
        chapterCount,
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
      const keyBytes = utf8ToBytes(encKey.slice(0, 32));

      // Create AES-GCM cipher instance
      const aes = gcm(keyBytes, iv);

      // Decrypt the combined ciphertext
      const decrypted = aes.decrypt(combined);

      // Convert decrypted bytes to string
      const m = bytesToUtf8(decrypted);

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

  async getKey($: any): Promise<string> {
    // Fetch the novel's data in JSON format
    const searchKey = '.slice(0,32)),d=await';

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

    for (let src of URLs) {
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
    const encKey = code.substring(index - 33, index - 1);
    return encKey;
  }

  async translate(data: string[]): Promise<string[]> {
    const contained = data.map((line, i) => `<a i=${i}>${line}</a>`);

    let translated: any = await fetchApi(
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
        'body': `[[${JSON.stringify(contained)},\"zh-CN\",\"en\"],\"te_lib\"]`,
        'method': 'POST',
      },
    );
    translated = await translated.json();
    const out = translated && translated[0] ? translated[0] : [];
    return out as string[];
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    let rawId: number | null = null;
    let chapterNo: number | null = null;
    let loadedCheerio = null;

    const urlMatch = chapterPath.match(/serie-(\d+)\/[^/]+\/chapter-(\d+)/);
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

    let chapterContent = parsedJson.data.data.body;
    let chapterGlossary = {} as JSON;
    if (
      Object.prototype.hasOwnProperty.call(
        parsedJson.data.data,
        'glossary_data',
      )
    ) {
      chapterGlossary = parsedJson.data.data.glossary_data;
    }

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

    let dictionary = [];
    if (Object.prototype.hasOwnProperty.call(chapterGlossary, 'terms')) {
      dictionary = Object.fromEntries(
        chapterGlossary.terms.map((definition, index) => [
          `※${index}⛬`,
          definition[0],
        ]),
      );
    }

    for (let text of chapterContent) {
      if (Object.keys(dictionary).length > 0) {
        text = text.replaceAll(/※[0-9]+⛬/g, m => dictionary[m]);
      }
      htmlString += `<p>${text}</p>`;
    }

    return htmlString;
  }

  async fetchAllChapters(
    rawId: number,
    totalChapters: number,
    slug: string,
  ): Promise<Plugin.ChapterItem[]> {
    const allChapters: Plugin.ChapterItem[] = [];
    const batchSize = 250;

    for (let start = 1; start <= totalChapters; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalChapters);

      try {
        const response = await fetchApi(
          `${this.site}api/chapters/${rawId}?start=${start}&end=${end}`,
        );

        const data = await response.json();

        if (data.chapters && Array.isArray(data.chapters)) {
          const batchChapters: Plugin.ChapterItem[] = data.chapters.map(
            (apiChapter: ApiChapter) => ({
              name: apiChapter.title,
              path: `${this.sourceLang}serie-${rawId}/${slug}/chapter-${apiChapter.order}`,
              releaseTime: apiChapter.updated_at?.substring(0, 10),
              chapterNumber: apiChapter.order,
            }),
          );

          allChapters.push(...batchChapters);
        }

        if (!data.chapters || data.chapters.length < batchSize) {
          break;
        }
      } catch (error) {
        console.error(`Failed to fetch chapters ${start}-${end}:`, error);
        continue;
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
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Male Protagonist', value: '417' },
        { label: 'Transmigration', value: '717' },
        { label: 'System', value: '696' },
        { label: 'Cultivation', value: '169' },
        { label: 'Special Abilities', value: '667' },
        { label: 'Female Protagonist', value: '275' },
        { label: 'Fanfiction', value: '263' },
        { label: 'Weak to Strong', value: '750' },
        { label: 'Handsome Male Lead', value: '327' },
        { label: 'Beautiful Female Lead', value: '81' },
        { label: 'Game Elements', value: '297' },
        { label: 'Cheats', value: '122' },
        { label: 'Genius Protagonist', value: '306' },
        { label: 'Reincarnation', value: '578' },
        { label: 'Harem-seeking Protagonist', value: '329' },
        { label: 'Time Travel', value: '710' },
        { label: 'Overpowered Protagonist', value: '506' },
        { label: 'Modern Day', value: '446' },
        { label: 'Business Management', value: '108' },
        { label: 'Calm Protagonist', value: '111' },
        { label: 'Magic', value: '410' },
        { label: 'Immortals', value: '357' },
        { label: 'Clever Protagonist', value: '134' },
        { label: 'Ruthless Protagonist', value: '595' },
        { label: 'Apocalypse', value: '47' },
        { label: 'World Hopping', value: '756' },
        { label: 'Poor to Rich', value: '540' },
        { label: 'Douluo Dalu', value: '772' },
        { label: 'Naruto', value: '769' },
        { label: 'Farming', value: '266' },
        { label: 'Fantasy World', value: '265' },
        { label: 'Kingdom Building', value: '379' },
        { label: 'Fast Cultivation', value: '267' },
        { label: 'Protagonist Strong from the Start', value: '560' },
        { label: 'Cunning Protagonist', value: '171' },
        { label: 'Nationalism', value: '476' },
        { label: 'Schemes And Conspiracies', value: '601' },
        { label: 'Survival', value: '692' },
        { label: 'Post-apocalyptic', value: '544' },
        { label: 'Hard-Working Protagonist', value: '328' },
        { label: 'Showbiz', value: '640' },
        { label: 'Unlimited Flow', value: '735' },
        { label: 'Demons', value: '191' },
        { label: 'Monsters', value: '452' },
        { label: 'Dragons', value: '216' },
        { label: 'Romantic Subplot', value: '592' },
        { label: 'Polygamy', value: '538' },
        { label: 'Beast Companions', value: '78' },
        { label: 'Marvel', value: '766' },
        { label: 'Evolution', value: '248' },
        { label: 'One Piece', value: '767' },
        { label: 'Leadership', value: '388' },
        { label: 'Alternate World', value: '30' },
        { label: 'Pets', value: '520' },
        { label: 'World Travel', value: '757' },
        { label: 'Celebrities', value: '117' },
        { label: 'Strong to Stronger', value: '682' },
        { label: 'Game Ranking System', value: '298' },
        { label: 'Alchemy', value: '27' },
        { label: 'Arrogant Characters', value: '56' },
        { label: 'Multiple Realms', value: '459' },
        { label: 'Army Building', value: '54' },
        { label: 'Magical Space', value: '414' },
        { label: 'Wealthy Characters', value: '751' },
        { label: 'Early Romance', value: '225' },
        { label: 'Racism', value: '570' },
        { label: 'Devoted Love Interests', value: '198' },
        { label: 'Comedic Undertone', value: '146' },
        { label: 'Businessmen', value: '109' },
        { label: 'Second Chance', value: '606' },
        { label: 'Revenge', value: '585' },
        { label: 'Wizards', value: '755' },
        { label: 'Pregnancy', value: '549' },
        { label: 'Ancient China', value: '34' },
        { label: 'Black Belly', value: '87' },
        { label: 'Evil Protagonist', value: '246' },
        { label: 'Love Interest Falls in Love First', value: '403' },
        { label: 'Evil Gods', value: '244' },
        { label: 'Academy', value: '5' },
        { label: 'Outer Space', value: '505' },
        { label: 'Zombies', value: '765' },
        { label: 'Single Female Lead', value: '787' },
        { label: 'Mythology', value: '473' },
        { label: 'Gods', value: '316' },
        { label: 'Harry Potter', value: '768' },
        { label: 'Sword Wielder', value: '695' },
        { label: 'Shameless Protagonist', value: '630' },
        { label: 'Futuristic Setting', value: '294' },
        { label: 'Pokemon', value: '771' },
        { label: 'Parallel Worlds', value: '510' },
        { label: 'Level System', value: '390' },
        { label: 'Beasts', value: '80' },
        { label: 'Strong Love Interests', value: '681' },
        { label: 'Fantasy Creatures', value: '264' },
        { label: 'Modern Knowledge', value: '447' },
        { label: 'Hiding True Identity', value: '343' },
        { label: 'Loyal Subordinates', value: '408' },
        { label: 'Slow Romance', value: '659' },
        { label: 'Family', value: '257' },
        { label: 'Politics', value: '536' },
        { label: 'Determined Protagonist', value: '197' },
        { label: 'Hiding True Abilities', value: '342' },
        { label: 'Cosmic Wars', value: '156' },
        { label: 'Ancient Times', value: '35' },
        { label: 'Arranged Marriage', value: '55' },
        { label: 'Complex Family Relationships', value: '148' },
        { label: 'Cold Protagonist', value: '142' },
        { label: 'Ghosts', value: '307' },
        { label: 'Sword And Magic', value: '694' },
        { label: 'Based on an Anime', value: '74' },
        { label: 'Wars', value: '748' },
        { label: 'Survival Game', value: '693' },
        { label: 'Military', value: '437' },
        { label: 'Betrayal', value: '83' },
        { label: 'Misunderstandings', value: '442' },
        { label: 'Time Skip', value: '709' },
        { label: 'Bloodlines', value: '93' },
        { label: 'Transported to Another World', value: '721' },
        { label: 'Cautious Protagonist', value: '116' },
        { label: 'Nobles', value: '485' },
        { label: 'Technological Gap', value: '699' },
        { label: 'Doting Love Interests', value: '211' },
        { label: 'Antihero Protagonist', value: '43' },
        { label: 'Godly Powers', value: '315' },
        { label: 'Reincarnated in Another World', value: '577' },
        { label: 'Lucky Protagonist', value: '409' },
        { label: 'Virtual Reality', value: '742' },
        { label: 'Medical Knowledge', value: '433' },
        { label: 'God Protagonist', value: '312' },
        { label: 'Adapted to Manhua', value: '15' },
        { label: 'Fast Learner', value: '268' },
        { label: 'Childcare', value: '126' },
        { label: 'Kingdoms', value: '380' },
        { label: 'Scientists', value: '603' },
        { label: 'Underestimated Protagonist', value: '731' },
        { label: 'Multiple Identities', value: '455' },
        { label: 'Naive Protagonist', value: '474' },
        { label: 'Doctors', value: '208' },
        { label: 'Artifacts', value: '58' },
        { label: 'Older Love Interests', value: '492' },
        { label: 'Elves', value: '233' },
        { label: 'Hidden Abilities', value: '341' },
        { label: 'Power Couple', value: '545' },
        { label: 'Cooking', value: '154' },
        { label: 'Unique Cultivation Technique', value: '732' },
        { label: 'Body Tempering', value: '95' },
        { label: 'Chat Rooms', value: '121' },
        { label: 'Eye Powers', value: '251' },
        { label: 'Artificial Intelligence', value: '59' },
        { label: 'Master-Disciple Relationship', value: '428' },
        { label: 'Interdimensional Travel', value: '368' },
        { label: 'Famous Protagonist', value: '261' },
        { label: 'Royalty', value: '594' },
        { label: 'Low-key Protagonist', value: '407' },
        { label: 'Late Romance', value: '385' },
        { label: 'Gamers', value: '299' },
        { label: 'Monster Tamer', value: '451' },
        { label: 'Possessive Characters', value: '543' },
        { label: 'Aliens', value: '28' },
        { label: 'Multiple POV', value: '457' },
        { label: 'Mythical Beasts', value: '472' },
        { label: 'Familial Love', value: '255' },
        { label: 'Confident Protagonist', value: '150' },
        { label: 'Mature Protagonist', value: '432' },
        { label: 'Rape', value: '571' },
        { label: 'Reincarnated as a Monster', value: '574' },
        { label: 'Slow Growth at Start', value: '658' },
        { label: 'Cold Love Interests', value: '141' },
        { label: 'Character Growth', value: '118' },
        { label: 'Sect Development', value: '613' },
        { label: 'Summoning Magic', value: '691' },
        { label: 'Acting', value: '7' },
        { label: 'Ability Steal', value: '2' },
        { label: 'Movies', value: '453' },
        { label: 'Ninjas', value: '484' },
        { label: 'Previous Life Talent', value: '551' },
        { label: 'Gate to Another World', value: '301' },
        { label: 'Money Grubber', value: '448' },
        { label: 'Non-humanoid Protagonist', value: '486' },
        { label: 'Dark', value: '181' },
        { label: 'Strength-based Social Hierarchy', value: '680' },
        { label: 'Industrialization', value: '362' },
        { label: 'Mysterious Past', value: '470' },
        { label: 'Caring Protagonist', value: '115' },
        { label: 'Pirates', value: '529' },
        { label: 'Pill Concocting', value: '527' },
        { label: 'European Ambience', value: '243' },
        { label: 'Cruel Characters', value: '167' },
        { label: 'Charismatic Protagonist', value: '119' },
        { label: 'Strategist', value: '679' },
        { label: 'Assassins', value: '61' },
        { label: 'Secret Organizations', value: '609' },
        { label: 'Knights', value: '381' },
        { label: 'Vampires', value: '740' },
        { label: 'Firearms', value: '278' },
        { label: 'Army', value: '53' },
        { label: 'Dao Comprehension', value: '179' },
        { label: 'Absent Parents', value: '3' },
        { label: 'Clan Building', value: '132' },
        { label: 'Detectives', value: '196' },
        { label: 'Heroes', value: '339' },
        { label: 'Friendship', value: '291' },
        { label: 'Charming Protagonist', value: '120' },
        { label: 'Accelerated Growth', value: '6' },
        { label: 'College/University', value: '144' },
        { label: 'Depictions of Cruelty', value: '193' },
        { label: 'Artifact Crafting', value: '57' },
        { label: 'Doting Parents', value: '213' },
        { label: 'Past Plays a Big Role', value: '515' },
        { label: 'MMORPG', value: '443' },
        { label: 'Card Games', value: '113' },
        { label: 'Magic Beasts', value: '411' },
        { label: 'Tragic Past', value: '715' },
        { label: 'First-time Intercourse', value: '280' },
        { label: 'Transported into a Game World', value: '719' },
        { label: 'Mysterious Family Background', value: '468' },
        { label: 'Management', value: '420' },
        { label: 'Secret Identity', value: '608' },
        { label: 'Earth Invasion', value: '226' },
        { label: 'Clones', value: '136' },
        { label: 'Based on a Video Game', value: '72' },
        { label: 'Swallowed Star', value: '785' },
        { label: 'Magic Formations', value: '412' },
        { label: 'Gao Wu', value: '781' },
        { label: 'Genetic Modifications', value: '304' },
        { label: 'Male Yandere', value: '419' },
        { label: 'Writers', value: '759' },
        { label: 'Based on a Movie', value: '69' },
        { label: 'Elemental Magic', value: '232' },
        { label: 'Discrimination', value: '201' },
        { label: 'Marriage', value: '424' },
        { label: 'Evil Organizations', value: '245' },
        { label: 'Younger Sisters', value: '764' },
        { label: 'Sudden Wealth', value: '688' },
        { label: 'Doting Older Siblings', value: '212' },
        { label: 'Cute Children', value: '174' },
        { label: 'Manipulative Characters', value: '422' },
        { label: 'Age Progression', value: '24' },
        { label: 'Hunters', value: '353' },
        { label: 'Adventurers', value: '22' },
        { label: 'Threesome', value: '704' },
        { label: 'Mystery Solving', value: '471' },
        { label: 'Perverted Protagonist', value: '519' },
        { label: 'Jack of All Trades', value: '372' },
        { label: 'Battle Competition', value: '76' },
        { label: 'Multiple Reincarnated Individuals', value: '460' },
        { label: 'Sex Slaves', value: '627' },
        { label: 'Soul Power', value: '663' },
        { label: 'Orphans', value: '500' },
        { label: 'Martial Spirits', value: '426' },
        { label: 'Dense Protagonist', value: '192' },
        { label: 'Family Conflict', value: '259' },
        { label: 'Magical Technology', value: '415' },
        { label: 'Warhammer', value: '775' },
        { label: 'Smart Couple', value: '660' },
        { label: 'Teachers', value: '697' },
        { label: 'Police', value: '534' },
        { label: 'Selfish Protagonist', value: '616' },
        { label: 'Simulator', value: '786' },
        { label: 'Demonic Cultivation Technique', value: '190' },
        { label: 'Rape Victim Becomes Lover', value: '572' },
        { label: 'Hackers', value: '324' },
        { label: 'Sudden Strength Gain', value: '687' },
        { label: 'Imperial Harem', value: '358' },
        { label: 'Family Business', value: '258' },
        { label: 'Cute Protagonist', value: '175' },
        { label: 'Apathetic Protagonist', value: '46' },
        { label: 'Lack of Common Sense', value: '383' },
        { label: 'Aristocracy', value: '51' },
        { label: 'Death of Loved Ones', value: '184' },
        { label: 'Enemies Become Lovers', value: '237' },
        { label: 'Empires', value: '235' },
        { label: 'Dungeons', value: '221' },
        { label: 'Male to Female', value: '418' },
        { label: 'Lazy Protagonist', value: '387' },
        { label: 'Evil Religions', value: '247' },
        { label: 'Obsessive Love', value: '490' },
        { label: 'Easy Going Life', value: '227' },
        { label: 'Appearance Changes', value: '48' },
        { label: 'Demon Lord', value: '189' },
        { label: 'Carefree Protagonist', value: '114' },
        { label: 'Mutations', value: '466' },
        { label: 'Student-Teacher Relationship', value: '685' },
        { label: 'R-18', value: '568' },
        { label: 'Abusive Characters', value: '4' },
        { label: 'Appearance Different from Actual Age', value: '49' },
        { label: 'Football', value: '780' },
        { label: 'Human-Nonhuman Relationship', value: '351' },
        { label: 'Pragmatic Protagonist', value: '547' },
        { label: 'Hot-blooded Protagonist', value: '348' },
        { label: 'Necromancer', value: '478' },
        { label: 'Battle Academy', value: '75' },
        { label: 'Witches', value: '754' },
        { label: 'Yandere', value: '760' },
        { label: 'Dragon Ball', value: '773' },
        { label: 'Childhood Friends', value: '127' },
        { label: 'Based on a TV Show', value: '71' },
        { label: 'Dwarfs', value: '222' },
        { label: 'Inheritance', value: '364' },
        { label: 'Child Protagonist', value: '125' },
        { label: 'Honkai', value: '818' },
        { label: 'Daoism', value: '180' },
        { label: 'Heavenly Tribulation', value: '335' },
        { label: 'Netori', value: '482' },
        { label: 'Sexual Cultivation Technique', value: '629' },
        { label: 'Buddhism', value: '106' },
        { label: 'Broken Engagement', value: '103' },
        { label: 'Reverse Rape', value: '587' },
        { label: 'Time Manipulation', value: '707' },
        { label: 'DC Universe', value: '778' },
        { label: 'Eidetic Memory', value: '230' },
        { label: 'Clingy Lover', value: '135' },
        { label: 'Live Streaming', value: '782' },
        { label: 'Mutated Creatures', value: '465' },
        { label: 'Phoenixes', value: '524' },
        { label: 'Sharp-tongued Characters', value: '633' },
        { label: 'Souls', value: '664' },
        { label: 'Poor Protagonist', value: '539' },
        { label: 'Angels', value: '38' },
        { label: 'Singers', value: '648' },
        { label: 'Proactive Protagonist', value: '555' },
        { label: 'Heartwarming', value: '333' },
        { label: 'Fellatio', value: '273' },
        { label: 'Spatial Manipulation', value: '665' },
        { label: 'Tsundere', value: '725' },
        { label: 'Enemies Become Allies', value: '236' },
        { label: 'e-Sports', value: '224' },
        { label: 'Mind Control', value: '439' },
        { label: 'Mercenaries', value: '435' },
        { label: 'Adopted Protagonist', value: '20' },
        { label: 'Average-looking Protagonist', value: '65' },
        { label: 'Master-Servant Relationship', value: '429' },
        { label: 'Gore', value: '318' },
        { label: 'Store Owner', value: '675' },
        { label: 'Amnesia', value: '31' },
        { label: 'Human Experimentation', value: '349' },
        { label: 'Strategic Battles', value: '678' },
        { label: 'Goddesses', value: '314' },
        { label: 'Skill Assimilation', value: '651' },
        { label: 'Abandoned Children', value: '1' },
        { label: 'Bleach', value: '770' },
        { label: 'Death', value: '183' },
        { label: 'Emotionally Weak Protagonist', value: '234' },
        { label: 'Aggressive Characters', value: '26' },
        { label: 'Resurrection', value: '583' },
        { label: 'Cross-dressing', value: '165' },
        { label: 'Transformation Ability', value: '716' },
        { label: 'Villainess Noble Girls', value: '741' },
        { label: 'Insects', value: '366' },
        { label: 'Thriller', value: '705' },
        { label: 'Orcs', value: '497' },
        { label: 'Boss-Subordinate Relationship', value: '100' },
        { label: 'Fated Lovers', value: '271' },
        { label: 'Music', value: '464' },
        { label: 'Economics', value: '228' },
        { label: 'Loli', value: '395' },
        { label: 'Couple Growth', value: '158' },
        { label: 'Incest', value: '359' },
        { label: 'Multiple Transported Individuals', value: '462' },
        { label: 'Protagonist with Multiple Bodies', value: '561' },
        { label: 'Religions', value: '579' },
        { label: 'Game Creator', value: '784' },
        { label: 'Soldiers', value: '662' },
        { label: 'Righteous Protagonist', value: '590' },
        { label: 'Blacksmith', value: '89' },
        { label: 'Adopted Children', value: '19' },
        { label: 'Yu-Gi-Oh!', value: '774' },
        { label: 'Twins', value: '726' },
        { label: 'Crossover', value: '166' },
        { label: 'Power Struggle', value: '546' },
        { label: 'Otaku', value: '501' },
        { label: 'Saints', value: '597' },
        { label: 'Teamwork', value: '698' },
        { label: 'Age Regression', value: '25' },
        { label: 'Honghuang', value: '801' },
        { label: 'Siblings Not Related by Blood', value: '645' },
        { label: 'Reincarnated in a Game World', value: '576' },
        { label: 'Poisons', value: '533' },
        { label: 'Fox Spirits', value: '289' },
        { label: 'Adapted to Manga', value: '14' },
        { label: 'Sexual Abuse', value: '628' },
        { label: 'Dolls/Puppets', value: '209' },
        { label: 'Long Separations', value: '398' },
        { label: 'Proficiency', value: '793' },
        { label: 'Skill Creation', value: '653' },
        { label: 'Gangs', value: '300' },
        { label: 'Gunfighters', value: '323' },
        { label: 'Journey to the West', value: '796' },
        { label: 'Detective Conan', value: '804' },
        { label: 'Popular Love Interests', value: '541' },
        { label: 'Pill Based Cultivation', value: '526' },
        { label: 'Destiny', value: '195' },
        { label: 'Parody', value: '513' },
        { label: 'Multiple Timelines', value: '461' },
        { label: 'Personality Changes', value: '518' },
        { label: 'Psychic Powers', value: '562' },
        { label: 'Generals', value: '303' },
        { label: 'Narcissistic Protagonist', value: '475' },
        { label: 'Transplanted Memories', value: '718' },
        { label: 'Crime', value: '163' },
        { label: 'Domestic Affairs', value: '210' },
        { label: 'Murders', value: '463' },
        { label: 'Guilds', value: '322' },
        { label: 'Books', value: '98' },
        { label: 'Chefs', value: '123' },
        { label: 'Mortal Flow', value: '792' },
        { label: 'Loner Protagonist', value: '397' },
        { label: 'Contracts', value: '153' },
        { label: 'Quirky Characters', value: '566' },
        { label: 'Adapted to Anime', value: '10' },
        { label: 'Beastkin', value: '79' },
        { label: 'Archery', value: '50' },
        { label: 'Adultery', value: '21' },
        { label: 'Harsh Training', value: '330' },
        { label: 'Organized Crime', value: '498' },
        { label: 'Biochip', value: '85' },
        { label: 'Fairies', value: '252' },
        { label: 'Psychopaths', value: '563' },
        { label: 'Multiple Protagonists', value: '458' },
        { label: 'Ugly to Beautiful', value: '729' },
        { label: 'Playful Protagonist', value: '531' },
        { label: 'Minecraft', value: '790' },
        { label: 'Medieval', value: '434' },
        { label: 'Divination', value: '205' },
        { label: 'Younger Love Interests', value: '763' },
        { label: 'Sister Complex', value: '650' },
        { label: 'Maids', value: '416' },
        { label: 'Protagonist Falls in Love First', value: '559' },
        { label: 'Dreams', value: '217' },
        { label: 'Persistent Love Interests', value: '517' },
        { label: 'Hunter x Hunter', value: '777' },
        { label: 'Brother Complex', value: '104' },
        { label: 'Humanoid Protagonist', value: '352' },
        { label: 'Brotherhood', value: '105' },
        { label: 'Playboys', value: '530' },
        { label: 'Jealousy', value: '373' },
        { label: 'Tribal Society', value: '723' },
        { label: 'Secrets', value: '612' },
        { label: 'Saving the World', value: '600' },
        { label: 'Slaves', value: '656' },
        { label: 'Three Kingdoms', value: '795' },
        { label: 'Childhood Love', value: '128' },
        { label: 'Thieves', value: '703' },
        { label: 'Demi-Humans', value: '188' },
        { label: 'Dao Companion', value: '178' },
        { label: 'Sign In', value: '811' },
        { label: 'Race Change', value: '569' },
        { label: 'Crafting', value: '162' },
        { label: 'First Love', value: '279' },
        { label: 'Cyberpunk 2077', value: '783' },
        { label: 'Curses', value: '173' },
        { label: 'Spirit Advisor', value: '669' },
        { label: 'Marriage of Convenience', value: '425' },
        { label: 'Near-Death Experience', value: '477' },
        { label: 'Lost Civilizations', value: '400' },
        { label: 'Prophecies', value: '557' },
        { label: 'Forced Marriage', value: '286' },
        { label: 'Episodic', value: '241' },
        { label: 'Conferred Gods', value: '800' },
        { label: 'Artists', value: '60' },
        { label: 'Animal Characteristics', value: '39' },
        { label: 'Cannibalism', value: '112' },
        { label: 'Fearless Protagonist', value: '272' },
        { label: 'Dark Fantasy', value: '789' },
        { label: 'Secretive Protagonist', value: '611' },
        { label: 'God-human Relationship', value: '313' },
        { label: 'Child Abuse', value: '124' },
        { label: 'Cowardly Protagonist', value: '161' },
        { label: 'Anti-social Protagonist', value: '42' },
        { label: 'Prison', value: '554' },
        { label: 'Female Master', value: '274' },
        { label: 'Hollywood', value: '779' },
        { label: 'Past Trauma', value: '516' },
        { label: 'Torture', value: '713' },
        { label: 'Adapted to Drama', value: '11' },
        { label: 'Bullying', value: '107' },
        { label: 'Androgynous Characters', value: '36' },
        { label: 'Class Awakening', value: '827' },
        { label: 'Multiple Personalities', value: '456' },
        { label: 'Corruption', value: '155' },
        { label: 'Merchants', value: '436' },
        { label: 'Animal Rearing', value: '40' },
        { label: 'Werebeasts', value: '752' },
        { label: 'Exorcism', value: '250' },
        { label: 'Bodyguards', value: '97' },
        { label: 'Hell', value: '336' },
        { label: 'Bickering Couple', value: '84' },
        { label: 'Honest Protagonist', value: '346' },
        { label: 'Fairy Tail', value: '814' },
        { label: 'Divorce', value: '207' },
        { label: 'Spirits', value: '671' },
        { label: 'Unconditional Love', value: '730' },
        { label: 'Reverse Harem', value: '586' },
        { label: 'World Tree', value: '758' },
        { label: 'Criminals', value: '164' },
        { label: 'Skill Books', value: '652' },
        { label: 'Investigations', value: '370' },
        { label: 'Succubus', value: '686' },
        { label: 'Blackmail', value: '88' },
        { label: 'Sentient Objects', value: '620' },
        { label: 'Goblins', value: '311' },
        { label: 'Different Social Status', value: '199' },
        { label: 'Hospital', value: '347' },
        { label: 'Genshin Impact', value: '815' },
        { label: 'Stubborn Protagonist', value: '683' },
        { label: 'Sickly Characters', value: '646' },
        { label: 'Servants', value: '623' },
        { label: 'Disabilities', value: '200' },
        { label: 'Lord', value: '823' },
        { label: 'Returning from Another World', value: '584' },
        { label: 'Cute Story', value: '176' },
        { label: 'Unlucky Protagonist', value: '736' },
        { label: 'Life Script', value: '824' },
        { label: 'Netorare', value: '480' },
        { label: 'Heaven', value: '334' },
        { label: 'Spear Wielder', value: '666' },
        { label: 'Inscriptions', value: '365' },
        { label: 'Engineer', value: '239' },
        { label: 'Lord of the Mysteries', value: '799' },
        { label: 'Masochistic Characters', value: '427' },
        { label: 'Possession', value: '542' },
        { label: 'Conditional Power', value: '149' },
        { label: 'Familiars', value: '256' },
        { label: 'Healers', value: '332' },
        { label: 'Slave Harem', value: '654' },
        { label: 'Herbalist', value: '338' },
        { label: 'Kind Love Interests', value: '378' },
        { label: 'Devouring', value: '797' },
        { label: 'League of Legends', value: '791' },
        { label: 'Mpreg', value: '454' },
        { label: 'Famous Parents', value: '260' },
        { label: 'Love at First Sight', value: '402' },
        { label: 'Heavenly Defying Comprehension', value: '803' },
        { label: 'Basketball', value: '809' },
        { label: 'Hated Protagonist', value: '331' },
        { label: 'Fallen Angels', value: '253' },
        { label: 'Dragon Slayers', value: '215' },
        { label: 'Seme Protagonist', value: '618' },
        { label: 'Legends', value: '389' },
        { label: 'Fleet Battles', value: '282' },
        { label: 'Blood Manipulation', value: '92' },
        { label: 'Court Official', value: '159' },
        { label: 'Summoned Hero', value: '690' },
        { label: 'Androids', value: '37' },
        { label: 'Lottery', value: '401' },
        { label: 'Game of Thrones', value: '813' },
        { label: 'Fat to Fit', value: '270' },
        { label: 'Priests', value: '553' },
        { label: "Seeing Things Other Humans Can't", value: '615' },
        { label: 'Shoujo-Ai Subplot', value: '638' },
        { label: 'Twisted Personality', value: '727' },
        { label: 'Magical Girls', value: '413' },
        { label: 'Sadistic Characters', value: '596' },
        { label: 'Enlightenment', value: '240' },
        { label: 'Prostitutes', value: '558' },
        { label: 'Weak Protagonist', value: '749' },
        { label: 'Copy', value: '807' },
        { label: 'Adapted to Game', value: '13' },
        { label: 'Puppeteers', value: '564' },
        { label: 'Sealed Power', value: '605' },
        { label: 'Cohabitation', value: '140' },
        { label: 'Mob Protagonist', value: '444' },
        { label: 'Seven Deadly Sins', value: '624' },
        { label: 'Single Parent', value: '649' },
        { label: 'Drugs', value: '218' },
        { label: 'Territory Management', value: '802' },
        { label: 'Druids', value: '219' },
        { label: 'Kidnappings', value: '377' },
        { label: 'R-15', value: '567' },
        { label: 'Brainwashing', value: '101' },
        { label: 'Overprotective Siblings', value: '507' },
        { label: 'Gambling', value: '296' },
        { label: 'Arms Dealers', value: '52' },
        { label: 'Manly Gay Couple', value: '423' },
        { label: 'Unique Weapons', value: '734' },
        { label: 'Lawyers', value: '386' },
        { label: 'Anal', value: '33' },
        { label: 'Time Loop', value: '706' },
        { label: 'Grinding', value: '320' },
        { label: 'Slave Protagonist', value: '655' },
        { label: 'Hypnotism', value: '354' },
        { label: 'Demon Slayer', value: '812' },
        { label: 'Unreliable Narrator', value: '737' },
        { label: 'Unique Weapon User', value: '733' },
        { label: 'Poetry', value: '532' },
        { label: 'Philosophical', value: '522' },
        { label: 'Feng Shui', value: '277' },
        { label: 'Chuunibyou', value: '131' },
        { label: 'Reality-Game Fusion', value: '830' },
        { label: 'Dragon Riders', value: '214' },
        { label: 'Omegaverse', value: '493' },
        { label: 'Suicides', value: '689' },
        { label: 'Love Rivals', value: '404' },
        { label: 'Stoic Characters', value: '674' },
        { label: 'Monster Girls', value: '449' },
        { label: 'Trickster', value: '724' },
        { label: 'Handjob', value: '326' },
        { label: 'Limited Lifespan', value: '392' },
        { label: 'Restaurant', value: '582' },
        { label: 'Fallen Nobility', value: '254' },
        { label: 'Masturbation', value: '430' },
        { label: 'Dishonest Protagonist', value: '203' },
        { label: 'Dungeon Master', value: '220' },
        { label: 'Serial Killers', value: '622' },
        { label: 'Younger Brothers', value: '762' },
        { label: 'Pharmacist', value: '521' },
        { label: 'Secret Relationship', value: '610' },
        { label: 'Living Alone', value: '394' },
        { label: 'Mangaka', value: '421' },
        { label: 'Childish Protagonist', value: '130' },
        { label: 'Office Romance', value: '491' },
        { label: 'Models', value: '445' },
        { label: 'Human Weapon', value: '350' },
        { label: 'Fanaticism', value: '262' },
        { label: 'Pilots', value: '528' },
        { label: 'Lovers Reunited', value: '406' },
        { label: 'Blind Protagonist', value: '91' },
        { label: 'Rebellion', value: '573' },
        { label: 'Programmer', value: '556' },
        { label: 'Flashbacks', value: '281' },
        { label: 'Forced into a Relationship', value: '284' },
        { label: 'More Children More Blessings', value: '825' },
        { label: "Sibling's Care", value: '643' },
        { label: 'Helpful Protagonist', value: '337' },
        { label: 'Fat Protagonist', value: '269' },
        { label: 'Awkward Protagonist', value: '67' },
        { label: 'Spiritual Energy Revival', value: '828' },
        { label: 'Distrustful Protagonist', value: '204' },
        { label: 'Folklore', value: '283' },
        { label: 'Engagement', value: '238' },
        { label: 'Half-human Protagonist', value: '325' },
        { label: 'Wishes', value: '753' },
        { label: 'Tomboyish Female Lead', value: '712' },
        { label: 'Shapeshifters', value: '631' },
        { label: 'Love Triangles', value: '405' },
        { label: 'Shounen-Ai Subplot', value: '639' },
        { label: 'Shy Characters', value: '641' },
        { label: 'Reborn as the Villain', value: '831' },
        { label: 'Body Swap', value: '94' },
        { label: 'Coming of Age', value: '147' },
        { label: 'Online Romance', value: '495' },
        { label: 'DnD', value: '794' },
        { label: 'Kuudere', value: '382' },
        { label: 'Monster Society', value: '450' },
        { label: 'Adapted to Drama CD', value: '12' },
        { label: 'Spirit Users', value: '670' },
        { label: 'Trap', value: '722' },
        { label: 'Orgy', value: '499' },
        { label: 'Inferiority Complex', value: '363' },
        { label: 'Unrequited Love', value: '738' },
        { label: 'Genderless Protagonist', value: '302' },
        { label: 'Elderly Protagonist', value: '231' },
        { label: 'Tentacles', value: '700' },
        { label: 'Clumsy Love Interests', value: '138' },
        { label: 'Library', value: '391' },
        { label: 'Parasites', value: '511' },
        { label: 'Sentimental Protagonist', value: '621' },
        { label: 'Mysterious Illness', value: '469' },
        { label: 'Spies', value: '668' },
        { label: 'Dead Protagonist', value: '182' },
        { label: 'Former Hero', value: '288' },
        { label: 'Cousins', value: '160' },
        { label: 'Seduction', value: '614' },
        { label: 'Interconnected Storylines', value: '367' },
        { label: 'Jujutsu Kaisen', value: '776' },
        { label: 'Curious Protagonist', value: '172' },
        { label: 'Stockholm Syndrome', value: '673' },
        { label: 'Genies', value: '305' },
        { label: 'Time Paradox', value: '708' },
        { label: 'Mind Break', value: '438' },
        { label: 'Polite Protagonist', value: '535' },
        { label: 'Bookworm', value: '99' },
        { label: 'Transported Modern Structure', value: '720' },
        { label: 'Bestiality', value: '82' },
        { label: 'Childhood Promise', value: '129' },
        { label: 'Parent Complex', value: '512' },
        { label: 'Sibling Rivalry', value: '642' },
        { label: 'BDSM', value: '77' },
        { label: 'Eunuch', value: '242' },
        { label: 'Introverted Protagonist', value: '369' },
        { label: 'Affair', value: '23' },
        { label: 'Autism', value: '63' },
        { label: 'Matriarchy', value: '431' },
        { label: 'Selfless Protagonist', value: '617' },
        { label: 'Automatons', value: '64' },
        { label: 'Business Wars', value: '806' },
        { label: 'Quiet Characters', value: '565' },
        { label: 'Depression', value: '194' },
        { label: 'Siblings', value: '644' },
        { label: 'Polyandry', value: '537' },
        { label: 'Western Names', value: '788' },
        { label: 'Terrorists', value: '702' },
        { label: 'Ugly Protagonist', value: '728' },
        { label: 'Rich to Poor', value: '589' },
        { label: 'Reincarnated as an Object', value: '575' },
        { label: 'Antique Shop', value: '44' },
        { label: 'Amusement Park', value: '32' },
        { label: 'Nurses', value: '489' },
        { label: 'Friends Become Enemies', value: '290' },
        { label: 'Sculptors', value: '604' },
        { label: 'Forgetful Protagonist', value: '287' },
        { label: 'Siheyuan', value: '820' },
        { label: 'Invisibility', value: '371' },
        { label: 'Schizophrenia', value: '602' },
        { label: 'Voice Actors', value: '744' },
        { label: 'Apartment Life', value: '45' },
        { label: 'Terminal Illness', value: '701' },
        { label: 'Adapted to Manhwa', value: '16' },
        { label: 'Nightmares', value: '483' },
        { label: 'Adapted to Movie', value: '17' },
        { label: 'Priestesses', value: '552' },
        { label: 'Co-Workers', value: '139' },
        { label: 'Undead Protagonist', value: '810' },
        { label: 'Disfigurement', value: '202' },
        { label: 'Golems', value: '317' },
        { label: 'Dystopia', value: '223' },
        { label: 'Sharing A Body', value: '632' },
        { label: 'Witcher', value: '819' },
        { label: 'Based on a Visual Novel', value: '73' },
        { label: 'Reporters', value: '581' },
        { label: 'Onmyouji', value: '496' },
        { label: 'Identity Crisis', value: '355' },
        { label: 'Language Barrier', value: '384' },
        { label: 'Part-Time Job', value: '514' },
        { label: 'Clubs', value: '137' },
        { label: 'Long-distance Relationship', value: '399' },
        { label: 'Forced Living Arrangements', value: '285' },
        { label: 'Paizuri', value: '509' },
        { label: 'Cunnilingus', value: '170' },
        { label: 'War Records', value: '747' },
        { label: 'Rivalry', value: '591' },
        { label: 'Loneliness', value: '396' },
        { label: 'Pretend Lovers', value: '550' },
        { label: 'Photography', value: '525' },
        { label: 'Timid Protagonist', value: '711' },
        { label: 'Youkai', value: '761' },
        { label: 'Astrologers', value: '62' },
        { label: 'Cosplay', value: '157' },
        { label: 'Adapted from Manga', value: '8' },
        { label: 'Confinement', value: '151' },
        { label: 'Reversible Couple', value: '588' },
        { label: 'Blind Dates', value: '90' },
        { label: 'Eavesdropping', value: '798' },
        { label: 'Neet', value: '479' },
        { label: 'Star Wars', value: '817' },
        { label: 'Stalkers', value: '672' },
        { label: 'Outcasts', value: '503' },
        { label: 'Secret Crush', value: '607' },
        { label: 'Female to Male', value: '276' },
        { label: 'Anti-Magic', value: '41' },
        { label: 'Valkyries', value: '739' },
        { label: 'Sex Friends', value: '626' },
        { label: 'Non-linear Storytelling', value: '487' },
        { label: 'Straight Uke', value: '677' },
        { label: 'Galge', value: '295' },
        { label: 'Mute Character', value: '467' },
        { label: 'Jobless Class', value: '375' },
        { label: 'Glasses-wearing Love Interests', value: '309' },
        { label: 'Shikigami', value: '635' },
        { label: 'Faith Dependent Deities', value: '808' },
        { label: 'Delusions', value: '187' },
        { label: 'Delinquents', value: '186' },
        { label: 'Dancers', value: '177' },
        { label: 'Award-winning Work', value: '66' },
        { label: 'Conflicting Loyalties', value: '152' },
        { label: 'Coma', value: '145' },
        { label: 'Futanari', value: '293' },
        { label: 'Divine Protection', value: '206' },
        { label: 'Guardian Relationship', value: '321' },
        { label: 'Grave Keepers', value: '319' },
        { label: 'Mismatched Couple', value: '441' },
        { label: 'Outdoor Intercourse', value: '504' },
        { label: 'Incubus', value: '360' },
        { label: 'Seven Virtues', value: '625' },
        { label: 'Sign Language', value: '647' },
        { label: 'Debts', value: '185' },
        { label: 'Nudity', value: '488' },
        { label: 'Roommates', value: '593' },
        { label: 'Shota', value: '637' },
        { label: 'Heterochromia', value: '340' },
        { label: 'Indecisive Protagonist', value: '361' },
        { label: 'Precognition', value: '548' },
        { label: 'Frieren', value: '816' },
        { label: 'Adapted to Visual Novel', value: '18' },
        { label: 'Collection of Short Stories', value: '143' },
        { label: 'Cryostasis', value: '168' },
        { label: 'Bands', value: '68' },
        { label: 'Netorase', value: '481' },
        { label: 'Otome Game', value: '502' },
        { label: 'Bisexual Protagonist', value: '86' },
        { label: 'Homunculus', value: '345' },
        { label: 'Voyeurism', value: '745' },
        { label: 'Gladiators', value: '308' },
        { label: 'Student Council', value: '684' },
        { label: 'Samurai', value: '599' },
        { label: 'Social Outcasts', value: '661' },
        { label: 'Misandry', value: '440' },
        { label: 'Fujoshi', value: '292' },
        { label: 'Glasses-wearing Protagonist', value: '310' },
        { label: 'Butlers', value: '110' },
        { label: 'Adapted from Manhua', value: '9' },
        { label: 'Sleeping', value: '657' },
        { label: 'Overlord', value: '826' },
        { label: 'Oneshot', value: '494' },
        { label: 'Imaginary Friend', value: '356' },
        { label: 'Jiangshi', value: '374' },
        { label: 'Array', value: '822' },
        { label: 'Based on a Song', value: '70' },
        { label: 'Hong Kong', value: '821' },
        { label: 'Waiters', value: '746' },
        { label: 'JSDF', value: '376' },
        { label: 'Short Story', value: '636' },
        { label: 'Vocaloid', value: '743' },
        { label: 'Living Abroad', value: '393' },
        { label: 'Shield User', value: '634' },
        { label: 'Editors', value: '229' },
        { label: 'Reluctant Protagonist', value: '580' },
        { label: 'Kimetsu no Yaiba', value: '805' },
        { label: 'Toys', value: '714' },
        { label: 'Classic', value: '133' },
        { label: 'Breast Fetish', value: '102' },
        { label: 'Exhibitionism', value: '249' },
        { label: 'Pacifist Protagonist', value: '508' },
        { label: 'Body-double', value: '96' },
        { label: 'Reborn', value: '829' },
        { label: 'Straight Seme', value: '676' },
        { label: 'Phobias', value: '523' },
        { label: 'Salaryman', value: '598' },
        { label: 'Hikikomori', value: '344' },
        { label: 'All-Girls School', value: '29' },
        { label: 'Senpai-Kouhai Relationship', value: '619' },
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
        { label: 'Male Protagonist', value: '417' },
        { label: 'Transmigration', value: '717' },
        { label: 'System', value: '696' },
        { label: 'Cultivation', value: '169' },
        { label: 'Special Abilities', value: '667' },
        { label: 'Female Protagonist', value: '275' },
        { label: 'Fanfiction', value: '263' },
        { label: 'Weak to Strong', value: '750' },
        { label: 'Handsome Male Lead', value: '327' },
        { label: 'Beautiful Female Lead', value: '81' },
        { label: 'Game Elements', value: '297' },
        { label: 'Cheats', value: '122' },
        { label: 'Genius Protagonist', value: '306' },
        { label: 'Reincarnation', value: '578' },
        { label: 'Harem-seeking Protagonist', value: '329' },
        { label: 'Time Travel', value: '710' },
        { label: 'Overpowered Protagonist', value: '506' },
        { label: 'Modern Day', value: '446' },
        { label: 'Business Management', value: '108' },
        { label: 'Calm Protagonist', value: '111' },
        { label: 'Magic', value: '410' },
        { label: 'Immortals', value: '357' },
        { label: 'Clever Protagonist', value: '134' },
        { label: 'Ruthless Protagonist', value: '595' },
        { label: 'Apocalypse', value: '47' },
        { label: 'World Hopping', value: '756' },
        { label: 'Poor to Rich', value: '540' },
        { label: 'Douluo Dalu', value: '772' },
        { label: 'Naruto', value: '769' },
        { label: 'Farming', value: '266' },
        { label: 'Fantasy World', value: '265' },
        { label: 'Kingdom Building', value: '379' },
        { label: 'Fast Cultivation', value: '267' },
        { label: 'Protagonist Strong from the Start', value: '560' },
        { label: 'Cunning Protagonist', value: '171' },
        { label: 'Nationalism', value: '476' },
        { label: 'Schemes And Conspiracies', value: '601' },
        { label: 'Survival', value: '692' },
        { label: 'Post-apocalyptic', value: '544' },
        { label: 'Hard-Working Protagonist', value: '328' },
        { label: 'Showbiz', value: '640' },
        { label: 'Unlimited Flow', value: '735' },
        { label: 'Demons', value: '191' },
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

type GlossaryTerm = {
  index: number;
  english: string;
  chinese: string;
  symbol: string;
};
type ChapterData = {
  data: ChapterContent;
};
type ChapterContent = {
  title: string;
  body: string;
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
