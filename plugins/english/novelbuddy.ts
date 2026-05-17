import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  api = 'https://api.novelbuddy.com/';
  version = '2.1.2';
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

    const parseNumber = (val?: string) => {
      if (!val?.trim()) return;
      const n = Number(val);
      return Number.isInteger(n) && n >= 0 && n <= 10000 ? String(n) : undefined;
    };

    const params: Record<string, string> = {};
    if (genre.value.include?.length) params.genres = genre.value.include.join(',');
    if (genre.value.exclude?.length) params.exclude = genre.value.exclude.join(',');
    if (parseNumber(min_ch.value)) params.min_ch = parseNumber(min_ch.value)!;
    if (parseNumber(max_ch.value)) params.max_ch = parseNumber(max_ch.value)!;
    if (status.value !== 'all') params.status = String(status.value);
    if (demo.value?.length) params.demographic = demo.value.join(',');
    if (orderBy.value) params.sort = String(orderBy.value);
    params.page = String(pageNo);
    params.limit = '24';
    if (keyword.value) params.q = keyword.value;

    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams(params).toString();

    const result = await fetchApi(url.toString());
    const body = await result.json();

    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();
    const $ = parseHTML(body);

    const script = $('#__NEXT_DATA__').html();
    if (!script) throw new Error('Could not find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(script);
    const initialManga = data.props.pageProps.initialManga;
    if (!initialManga) throw new Error('Could not find initialManga data');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: initialManga.name || 'Untitled',
      cover: initialManga.cover,
      author: initialManga.authors?.map(a => a.name).join(', ') || '',
      artist: initialManga.artists?.map(a => a.name).join(', ') || '',
      genres: initialManga.genres?.map(g => g.name).join(',') || '',
      chapters: [],
    };

    const statusMap: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
    };
    novel.status = statusMap[initialManga.status.toLowerCase()] ?? NovelStatus.Unknown;

    // Wrap in <div> before passing to $(): when the API returns plain text (no leading
    // `<` tag) cheerio's $() treats the input as a CSS selector, and any `.` in the text
    // (e.g. punctuation in "I was inside a novel.") trips the selector parser with
    // "Expected name, found ." and the entire parseNovel call fails. Wrapping forces the
    // HTML-parsing branch regardless of whether the summary is plain text or HTML.
    const summary = $('<div>' + (initialManga.summary || '') + '</div>');
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');
    novel.summary = summary.text().split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (initialManga.ratingStats) novel.rating = initialManga.ratingStats.average;

    // Fetch chapters from API, fallback to initialManga data
    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters`;
    const chaptersResponse = await fetchApi(chaptersUrl).catch(() => null);
    const chaptersJson: ChapterResponse | null = await chaptersResponse?.json().catch(() => null);

    const rawChapters = chaptersJson?.data?.chapters || initialManga.chapters || [];
    novel.chapters = rawChapters.map(chapter => ({
      name: chapter.name,
      path: new URL(chapter.url, this.site).pathname.substring(1),
      releaseTime: chapter.updated_at || chapter.updatedAt,
    })).reverse();

    return novel;
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
      content = content.replace(/Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi, '');

      // Remove obfuscated freewebnovel watermarks (e.g., free𝑤𝑒𝑏novel.com)
      const fwnRegex = /(?:𝐟|ᵮ|𝑓|𝒇|𝒻|𝓯|𝔣|𝕗|𝖿|𝗳|𝙛|𝚏|ꬵ|ꞙ|ẝ|𝖋|ⓕ|ｆ|ƒ|ḟ|ʃ|բ|ᶠ|⒡|ſ|ꊰ|ʄ|∱|ᶂ|𝘧|f)(?:𝚛|ꭇ|ᣴ|ℾ|𝚪|𝛤|𝜞|𝝘|𝞒|Ⲅ|Г|Ꮁ|ᒥ|ꭈ|ⲅ|ꮁ|ⓡ|ｒ|ŕ|ṙ|ř|ȑ|ȓ|ṛ|ṝ|ŗ|г|Ր|ɾ|ᥬ|ṟ|ɍ|ʳ|⒭|ɼ|ѓ|ᴦ|ᶉ|𝐫|𝑟|𝒓|𝓇|𝓻|𝔯|𝕣|𝖗|𝗋|𝗿|𝘳|𝙧|ᵲ|ґ|ᵣ|r)(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)+(?:𝐰|ꝡ|𝑤|𝒘|𝓌|𝔀|𝔴|𝕨|𝖜|𝗐|𝘄|𝘸|𝙬|𝚠|ա|ẁ|ꮃ|ẃ|ⓦ|⍵|ŵ|ẇ|ẅ|ẘ|ẉ|ⱳ|ὼ|ὠ|ὡ|ὢ|ὣ|ω|ὤ|ὥ|ὦ|ὧ|ῲ|ῳ|ῴ|ῶ|ῷ|Ⱳ|ѡ|ԝ|ᴡ|ώ|ᾠ|ᾡ|ᾡ|ᾢ|ᾣ|ᾤ|ᾥ|ᾦ|ɯ|𝝕|𝟉|𝞏|w)(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)(?:ꮟ|Ꮟ|𝐛|𝘣|𝒷|𝔟|𝓫|𝖇|𝖻|𝑏|𝙗|𝕓|𝒃|𝗯|𝚋|♭|ᑳ|ᒈ|ｂ|ᖚ|ᕹ|ᕺ|ⓑ|ḃ|ḅ|ҍ|ъ|ḇ|ƃ|ɓ|ƅ|ᖯ|Ƅ|Ь|ᑲ|þ|Ƃ|⒝|Ъ|ᶀ|ᑿ|ᒀ|ᒂ|ᒁ|ᑾ|ь|ƀ|Ҍ|Ѣ|ѣ|ᔎ|b)(?:ո|ռ|ח|𝒏|𝓷|ն|𝑛|𝖓|𝔫|𝗇|ն|𝗻|ᥒ|ⓝ|ή|ｎ|ǹ|ᴒ|ń|ñ|ᾗ|η|ṅ|ň|ṇ|ɲ|ņ|ṋ|ṉ|ղ|ຖ|Ռ|ƞ|ŋ|⒩|ภ|ก|ɳ|п|ŉ|л|ԉ|Ƞ|ἠ|ἡ|ῃ|դ|ᾐ|ᾑ|ᾒ|ᾓ|ᾔ|ᾕ|ᾖ|ῄ|ῆ|ῇ|ῂ|ἢ|ἣ|ἤ|ἥ|ἦ|ἧ|ὴ|ή|በ|ቡ|ቢ|ባ|ቤ|б|ቦ|ȵ|𝛈|𝜂|𝜼|𝝶|𝞰|𝕟|𝘯|𝐧|𝓃|ᶇ|ᵰ|ᥥ|∩|n)(?:ం|ం|ം|ං|૦|௦|۵|ℴ|𝑜|𝒐|𝒐|ꬽ|𝝄|\\u03C3|\\u03C3|\\u03C3|\\u03C2|\\u1\\u00BF|\\u006F|\\u09E6|\\u0B66|\\u12D0|\\u03B9|\\u006F|\\u03C4|\\u0077|\\u1040|\\u1042\\u0063|\\u104EA|\\u1D4F8|\\u1F1F4|\\u2364|\\u25CB|\\u03D9|\\u1F17E|\\u1D4AA|\\u1D5AE|\\u1D7E2|\\u1D7F6|\\u1D67E|\\u1D630|\\u1D5FC|\\u1D560|\\u1D70A|\\u1D428|\\u1D77E|\\u1D7B8|\\u1424|\\u24DE|\\u0473|\\u19D0|\\u1972|\\u00F0|\\uFF4F|\\u0C20|\\u199E|\\u0553|\\u00F2|\\u04E9|\\u04E7|\\u00F3|\\u00BA|\\u014D|\\u00F4|\\u01D2|\\u020F|\\u014F|\\u1ED3|\\u022D|\\u1E4F|\\u1F44|\\u1E51|\\u1E53|\\u022F|\\u022B|\\u0E4F|\\u1D0F|\\u0151|\\u00F6|\\u047B|\\u043E|\\u12D0|\\u01ED|\\u0231|\\u09E6|\\u0B66|\\u0665|\\u0C66|\\u0E50|\\u0ED0|\\u03BF|\\u0585|\\u1D11|\\u0966|\\u0A66|\\u1ECF|\\u01A1|\\u1EDD|\\u1EDB|\\u1EE1|\\u1EDF|\\u1EE3|\\u1ECD|\\u1ED9|\\u01EB|\\u00F8|\\u01FF|\\u0275|\\u056E|\\u1F40|\\u1F41|\\u03CC|\\u1F78|\\u1F79|\\u1F42|\\u1F43|\\u1F45|o)(?:\\u2228|\\u2304|\\u22C1|\\u2174|\\u1D42F|\\u1D463|\\u1D497|\\u1D4CB|\\u1D533|\\u1D567|\\u1D59B|\\uABA9|\\u1200|\\u24E5|\\uFF56|\\u1D710|\\u1D74A|\\u1E7D|\\u1E7F|\\u0C6E|\\u0E07|\\u0475|\\u05E2|\\u1D20|\\u03BD|\\u05D8|\\u1D65|\\u0477|\\u17F4|\\u1601|\\u1D66B|\\u1D66B|\\u1D6CE|\\u1D708|\\u1D742|\\u1D77C|\\u1D7B6|\\u1D637|\\u1D603|\\u1D4FF|v)(?:\\u0259|\\u04D9|\\u2147|\\uAB32|\\uA793|\\u22F4|\\u1D6C6|\\u1D6DC|\\u1D700|\\u1D716|\\u1D73A|\\u1D750|\\u1D774|\\u1D78A|\\u1D7AE|\\u1D7C4|\\u2C89|\\uAB9B|\\u10429|\\uA792|\\u2C88|\\u2377|\\u1D452|\\u1D4EE|\\u1D556|\\u1D58A|\\u1D626|\\u1D5F2|\\u1D68E|\\u1D65A|\\u1D486|\\u1D522|\\u1D5BE|\\u1D41E|\\u04BE|\\u04BF|\\u24D4|\\uFF45|\\u24A0|\\u00E8|\\u19C9|\\u00E9|\\u1D92|\\u00EA|\\u0258|\\u1F14|\\u1EC1|\\u1EBF|\\u1EC5|\\u0AEF|\\u01DD|\\u0454|\\u03B5|\\u0113|\\u04BD|\\u025B|\\u1EC3|\\u1EBD|\\u1E15|\\u1E17|\\u0115|\\u0117|\\u00EB|\\u1EBB|\\u011B|\\u0205|\\u0207|\\u1EB9|\\u1EC7|\\u0229|\\u0247|\\u2091|\\u0119|\\u1E1D|\\u1E19|\\u1E1B|\\u212E|\\u0435|\\u0511|\\u0450|\\u04D7|\\u1971|\\u0451|\\u1F10|\\u1F11|\\u1F12|\\u1F13|\\u1F15|\\u212F|e)(?:\\u24DB|\\uFF4C|\\u0140|\\u013A|\\u013E|\\u1E37|\\u1E39|\\u1E37|\\u013C|\\u04C0|\\u2113|\\u1E3D|\\u1E3B|\\u0142|\\uFF9A|\\u026D|\\u019A|\\u026B|\\u2C61|\\|\\u0196|\\u24A7|\\u0285|\\u01C0|\\u05D5|\\u05DF|\\u0399|\\u0406|\\uFF5C|\\u1DA9|\\u04CF|\\u1D4D8|\\u1D540|\\u1D5A8|\\u1D5DC|\\u1D610|\\u1D425|\\u1D459|\\u1D48D|\\u1D4C1|\\u1D529|\\u1D55D|\\u1D591|\\u1D5C5|\\u1D5F9|\\u1D62D|\\u1D695|\\u1D724|\\u1D75E|\\u0131|\\u1D6A4|\\u0269|\\u1FBE|\\u1D6CA|\\u1D704|\\u1D73E|\\u1D7B2|I|l)(?:.?(?:\\u1F74C|\\uFF43|\\u217D|\\u1D41C|\\u1D450|\\u1D484|\\u1D4B8|\\u1D4EC|\\u1D520|\\u1D554|\\u1D588|\\u1D5BC|\\u1D5F0|\\u1D624|\\u1D658|\\u1D68C|\\u1D04|\\u03F2|\\u2CA5|\\u0441|\\uABAF|\\u1043D|\\u2CA5|\\u1043D|\\uABAF|\\u0109|\\uFF43|\\u24D2|\\u0107|\\u010D|\\u010B|\\u00E7|\\u0481|\\u0188|\\u1E09|\\u023C|\\u2184|\\u0441|\\u122D|\\u1D04|\\u03F2|\\u04AB|\\uA49D|\\u03C2|\\u027D|\\u03C2|\\u1D672|\\u1466|\\u19DA|\\u1D41C|\\u1D450|\\u1D484|\\u1D4B8|\\u1D4EC|\\u1D520|\\u1D554|\\u1D588|\\u1D5BC|\\u1D5F0|\\u1D624|\\u1D658|\\u1D68C|\\u20B5|\\u1F1E8|\\u1974|\\u14BC|\\u217D|c)(?:\\u0C02|\\u0C02|\\u0D02|\\u0D82|\\u0AE6|\\u0BE6|\\u06F5|\\u2134|\\u1D490|\\u1D490|\\u1D490|\\uAB3D|\\u1D744|\\u1D6D4|\\u1D70E|\\u1D748|\\u1D782|\\u10FF|\\u1D698|\\u09E6|\\u0B66|\\u12D0|\\u1D6D0|\\u1D5C8|\\u1D7BC|\\u101D|\\u2C9F|\\u0E50|\\u0ED0|\\u03BF|\\u0585|\\u1D11|\\u0966|\\u0A66|\\u1ECF|\\u01A1|\\u1EDD|\\u1EDB|\\u1EE1|\\u1EDF|\\u1EE3|\\u1ECD|\\u1ED9|\\u01EB|\\u00F8|\\u01FF|\\u0275|\\u056E|\\u1F40|\\u1F41|\\u03CC|\\u1F78|\\u1F79|\\u1F42|\\u1F43|\\u1F45|o)(?:\\u20A5|\\u1D6F|\\u1D592|\\u1D426|\\u1D5C6|\\u1D52A|\\u1D55E|\\u1D4C2|\\u24DC|\\uFF4D|\\u0D28|\\u1662|\\u0D69|m|\\u1E3F|\\u1E41|\\u217F|\\u03FB|\\u1E43|\\u1320|\\u0271|\\u17F3|\\u1D86|\\u1D48E|\\u1D662|\\u1D4F6|\\u1D696|\\u1D45A|\\u1D5FA|\\u19D5|\\u19D7|m))?/g;
      content = content.replace(fwnRegex, '');
    }
    return content;
  }

  async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
    const url = new URL('titles/search', this.api);
    url.search = new URLSearchParams({ q: searchTerm, limit: '24', page: String(page) }).toString();
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
    keyword: { value: '', label: 'Keywords', type: FilterTypes.TextInput },
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
      value: { include: [], exclude: [] },
      label: 'Genres (OR, not AND)',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    min_ch: { value: '', label: 'Minimum Chapters', type: FilterTypes.TextInput },
    max_ch: { value: '', label: 'Maximum Chapters', type: FilterTypes.TextInput },
    type: {
      value: '',
      label: 'Types',
      options: [
        { label: 'All Types', value: '' },
        { label: 'Manga', value: 'manga' },
        { label: 'Manhwa', value: 'manhwa' },
        { label: 'Manhua', value: 'manhua' },
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

type Response = { data: { items: Items[] } };
type ChapterResponse = { success: boolean; data?: { chapters?: Items[] } };
type Items = { id: string; url: string; name: string; updated_at?: string; updatedAt?: string };
type NovelScript = { props: { pageProps: { initialManga: Manga } } };
type Manga = { id: string; url: string; name?: string; cover: string; status: string; ratingStats?: { average: number }; summary?: string; artists?: { name: string }[]; authors?: { name: string }[]; genres?: { name: string }[]; chapters?: Items[] };
type ChapterScript = { props: { pageProps: { initialChapter: Chapter } } };
type Chapter = { name: string; content: string };