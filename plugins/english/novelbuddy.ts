import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

const fwnRegex = new RegExp(
  [
    '(?:𝐟|ᵮ|𝑓|𝒇|𝒻|𝓯|𝔣|𝕗|𝖿|𝗳|𝙛|𝚏|ꬵ|ꞙ|ẝ|𝖋|ⓕ|ｆ|ḟ|ʃ|բ|ᶠ|⒡|ſ|ꊰ|ʄ|∱|ᶂ|𝘧|\\bf)',
    '(?:𝚛|ꭇ|ᣴ|ℾ|𝚪|𝛤|𝜞|𝝘|𝞒|Ⲅ|Г|Ꮁ|ᒥ|ꭈ|ⲅ|ꮁ|ⓡ|ｒ|ŕ|ṙ|ř|ȑ|ȓ|ṛ|ṝ|ŗ|г|Ր|ɾ|ᥬ|ṟ|ɍ|ʳ|⒭|ɼ|ѓ|ᴦ|ᶉ|𝐫|𝑟|𝒓|𝓇|𝓻|𝔯|𝕣|𝖗|𝗋|𝗿|𝘳|𝙧|ᵲ|ґ|ᵣ|r)',
    '(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)+',
    '(?:𝐰|ꝡ|𝑤|𝒘|𝓌|𝔀|𝔴|𝕨|𝖜|𝗐|𝘄|𝘸|𝙬|𝚠|ա|ẁ|ꮃ|ẃ|ⓦ|⍵|ŵ|ẇ|ẅ|ẘ|ẉ|ⱳ|ὼ|ὠ|ὡ|ὢ|ὣ|ω|ὤ|ὥ|ὦ|ὧ|ῲ|ῳ|ῴ|ῶ|ῷ|Ⱳ|ѡ|ԝ|ᴡ|ώ|ᾠ|ᾡ|ᾢ|ᾣ|ᾤ|ᾥ|ᾦ|ɯ|𝝕|𝟉|𝞏|w)',
    '(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)',
    '(?:ꮟ|Ꮟ|𝐛|𝘣|𝒷|𝔟|𝓫|𝖇|𝖻|𝑏|𝙗|𝕓|𝒃|𝗯|𝚋|♭|ᑳ|ᒈ|ｂ|ᖚ|ᕹ|ᕺ|ⓑ|ḃ|ḅ|ҍ|ъ|ḇ|ƃ|ɓ|ƅ|ᖯ|Ƅ|Ь|ᑲ|þ|Ƃ|⒝|Ъ|ᶀ|ᑿ|ᒀ|ᒂ|ᒁ|ᑾ|ь|ƀ|Ҍ|Ѣ|ѣ|ᔎ|b)',
    '(?:ո|ռ|ח|𝒏|𝓷|𝙣|𝑛|𝖓|𝔫|𝗇|𝗻|ᥒ|ⓝ|ή|ｎ|ǹ|ᴒ|ń|ñ|ᾗ|η|ṅ|ň|ṇ|ɲ|ņ|ṋ|ṉ|ղ|ຖ|Ռ|ƞ|ŋ|⒩|ภ|ก|ɳ|п|ŉ|л|ԉ|Ƞ|ἠ|ἡ|ῃ|դ|ᾐ|ᾑ|ᾒ|ᾓ|ᾔ|ᾕ|ᾖ|ῄ|ῆ|ῇ|ῂ|ἢ|ἣ|ἤ|ἥ|ἦ|ἧ|ὴ|ή|በ|ቡ|ቢ|ባ|ቤ|ብ|ቦ|ȵ|𝛈|𝜂|𝜼|𝝶|𝞰|𝕟|延|𝐧|𝔫|ᶇ|ᵰ|ᥥ|∩|n|𝘯|𝓃)',
    '(?:ం|ం|ം|ං|૦|௦|۵|ℴ|𝑜|𝒐|𝒐|ꬽ|𝝄|𝛔|𝜎|𝝈|𝞂|ჿ|𝚘|০|୦|ዐ|𝛐|𝗈|𝞼|ဝ|ⲟ|ⲟ|𝙤|၀|𐐬|𝔬|𐓪|𝓸|🇴|⍤|○|ϙ|🅾|𝒪|𝖮|𝟢|𝟶|𝙾|o|𝗼|𝕠|𝜊|𝐨|𝝾|𝞸|ᐤ|ｵ|ѳ|᧐|ᥲ|ð|ｏ|ఠ|ᦞ|Փ|ò|ө|ӧ|ó|º|ō|ô|ǒ|ȏ|ŏ|ồ|ȭ|ṏ|ὄ|ṑ|ṓ|ȯ|ȫ|๏|ᴏ|ő|ö|ѻ|о|ዐ|ǭ|ȱ|০|୦|٥|౦|告知|๐|໐|ο|օ|ᴑ|०|੦|ỏ|ơ|ờ|ớ|ỡ|ở|ợ|ọ|ộ|ǫ|ø|ǿ|ɵ|ծ|ὀ|ὁ|ό|ὸ|ό|ὂ|ὃ|ὅ|o|ం|𝖔|ｵ|o|ⓞ|೦|൦)',
    '(?:∨|⌄|\\||ⅴ|𝐯|𝑣|𝒗|𝓋|𝔳|𝕧|𝖛|ꮩ|ሀ|ⓥ|ｖ|𝜐|𝝊|ṽ|ṿ|౮|ง|ѵ|ע|ᴠ|ν|ט|ᵥ|ѷ|៴|ᘁ|𝙫|𝙫|𝛎|𝜈|𝝂|𝝼|𝞶|𝘷|𝘃|𝓿|v|⋁|𝗏|𝚟)',
    '(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|紀錄|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e|ₑ)',
    '(?:ⓛ|ｌ|ŀ|ĺ|ľ|ḷ|ḹ|ḷ|ļ|Ӏ|ℓ|ḽ|ḻ|ł|ﾚ|ɭ|ƚ|ɫ|ⱡ|\\||\\\\|Ɩ|⒧|ʅ|ǀ|ו|ן|Ι|І|｜|ᶩ|ӏ|𝓘|𝕀|𝖨|𝗜|𝘐|𝐥|𝑙|𝒍|𝓁|𝔩|𝕝|𝖑|ލ|𝗅|𝗹|ލ|𝗅|𝗹|ލ|𝗅|𝗹|𝘭|լ|𝜤|𝝞|ı|𝚤|ɩ|ι|𝛊|𝜄|𝜾|𝞲|I|l|𝙡|𝓵)',
    '(?:.?(?:𝝌|ｃ|ⅽ|𝐜|𝑐|𝒄|𝒸|𝓬|𝔠|𝕔|𝖈|𝖈|𝗰|𝘤|𝙘|𝚌|ᴄ|ϲ|ⲥ|с|ꮯ|𐐽|ⲥ|𐐽|ꮯ|ĉ|ｃ|ⓒ|ć|č|ċ|ç|ҁ|ƈ|ḉ|ȼ|ↄ|с|ር|ᴄ|ϲ|ҫ|꒝|ς|ɽ|ϛ|𝙲|ᑦ|᧚|₵|🇨|ᥴ|ᒼ|ⅽ|c)(?:ం|ం|ം|ං|૦|௦|۵|ℴ|𝒐|𝒐|𝒐|ꬽ|𝝄|𝛔|𝜎|𝝈|𝞂|ჿ|𝚘|০|୦|ዐ|𝛐|𝗈|𝞼|ဝ|ⲟ|ⲟ|𝙤|၀|𐐬|𝔬|𐓪|𝓸|🇴|⍤|○|ϙ|🅾|𝒪|𝖮|𝟢|𝟶|𝙾|o|𝗼|𝕠|𝜊|𝐨|𝝾|𝞸|ᐤ|ｵ|ѳ|᧐|ᥲ|ð|ｏ|ఠ|ᦞ|Փ|ò|ө|ӧ|ó|º|ō|ô|ǒ|ȏ|ŏ|ồ|ȭ|ṏ|ὄ|ṑ|ṓ|ȯ|ȫ|๏|ᴏ|ő|ö|ѻ|о|ዐ|ǭ|ȱ|০|୦|٥|౦|告知|๐|໐|ο|օ|ᴑ|०|੦|ỏ|ơ|ờ|ớ|ỡ|ở|ợ|ọ|ộ|ǫ|ø|ǿ|ɵ|ծ|ὀ|ὁ|ό|ὸ|ό|ὂ|ὃ|ὅ|o|ం|𝖔|𝘰|ⓞ|೦|൦)(?:₥|ᵯ|𝖒|𝐦|𝗆|𝔪|𝕞|𝓂|ⓜ|ｍ|ന|ᙢ|൩|ḿ|ṁ|ⅿ|ϻ|ṃ|ጠ|ɱ|៳|ᶆ|𝒎|🇲|𝙢|𝓶|𝚖|𝑚|𝗺|᧕|᧗|m|𝖼|𝛐))?'
  ].join(''),
  'g',
);

class NovelBuddy implements Plugin.PluginBase {
  id = 'novelbuddy';
  name = 'NovelBuddy';
  site = 'https://novelbuddy.com/';
  api = 'https://api.novelbuddy.com/';
  version = '2.1.4';
  icon = 'src/en/novelbuddy/icon.png';

  parseNovels(body: Response): Plugin.NovelItem[] {
    return body.data.items.map(item => ({
      name: item.name,
      path: item.url.startsWith('/') ? item.url.slice(1) : item.url,
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
      return Number.isInteger(n) && n >= 0 && n <= 10000
        ? String(n)
        : undefined;
    };

    const rawParams: Record<string, string | undefined> = {
      genres: genre.value.include?.join(',') || undefined,
      exclude: genre.value.exclude?.join(',') || undefined,
      min_ch: parseNumber(min_ch.value),
      max_ch: parseNumber(max_ch.value),
      status: status.value !== 'all' ? String(status.value) : undefined,
      demographic: demo.value?.join(',') || undefined,
      sort: String(orderBy.value),
      page: String(pageNo),
      limit: '24',
      q: keyword.value || undefined,
    };

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rawParams)) {
      if (value !== undefined) params.append(key, value);
    }

    const url = this.api + 'titles/search?' + params.toString();
    const result = await fetchApi(url);
    const body = await result.json();

    return this.parseNovels(body);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(this.site + novelPath);
    const body = await response.text();

    const scriptMatch = body.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
    );
    if (!scriptMatch) throw new Error('Could not find __NEXT_DATA__');

    const data: NovelScript = JSON.parse(scriptMatch[1]);
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

    const rawStatus = initialManga.status;
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const summaryStr = initialManga.summary || '';
    if (summaryStr) {
      const $ = parseHTML('<div>' + summaryStr + '</div>');
      $('br').replaceWith('\n');
      $('p').before('\n').after('\n\n');
      novel.summary = $('div')
        .text()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .trim();
    }

    if (initialManga.ratingStats) {
      novel.rating = initialManga.ratingStats.average;
    }

    const cv = initialManga.content_version || initialManga.cv;
    const chaptersUrl = `${this.api}titles/${initialManga.id}/chapters${
      cv ? `?cv=${cv}` : ''
    }`;
    const chaptersResponse = await fetchApi(chaptersUrl);
    const chaptersJson: ChapterResponse = await chaptersResponse.json();

    if (chaptersJson?.success && chaptersJson?.data?.chapters) {
      novel.chapters = chaptersJson.data.chapters
        .map(chapter => ({
          name: chapter.name,
          path:
            (chapter.url.startsWith('/') ? chapter.url.slice(1) : chapter.url) +
            `?id=${initialManga.id}&chapterId=${chapter.id}`,
          releaseTime: chapter.updated_at,
        }))
        .reverse();
    } else if (initialManga.chapters) {
      novel.chapters = initialManga.chapters
        .map(chapter => ({
          name: chapter.name,
          path: chapter.url.startsWith('/')
            ? chapter.url.slice(1)
            : chapter.url,
          releaseTime: chapter.updatedAt,
        }))
        .reverse();
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const novelIdMatch = chapterPath.match(/[?&]id=([^&]+)/);
    const chapterIdMatch = chapterPath.match(/[?&]chapterId=([^&]+)/);

    let content = '';

    if (novelIdMatch && chapterIdMatch) {
      const novelId = novelIdMatch[1];
      const chapterId = chapterIdMatch[1];
      const apiUrl = `${this.api}titles/${novelId}/chapters/${chapterId}`;
      const response = await fetchApi(apiUrl);
      const json = await response.json();
      content = json?.data?.chapter?.content || '';
    }

    if (!content) {
      const result = await fetchApi(this.site + chapterPath);
      const body = await result.text();
      const scriptMatch = body.match(
        /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
      );
      if (!scriptMatch) throw new Error('Could not find __NEXT_DATA__');

      const data: ChapterScript = JSON.parse(scriptMatch[1]);
      const initialChapter = data.props.pageProps.initialChapter;
      if (!initialChapter) throw new Error('Could not find chapter content');
      content = initialChapter.content;
    }

    if (content) {
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click.*?for visiting\./gi,
        '',
      );
      content = content.replace(
        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\.webnovel\.com for visiting\./gi,
        '',
      );
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
    const url = this.api + 'titles/search?' + params.toString();
    const result = await fetchApi(url);
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
        { label: 'ActionAdventure', value: 'actionadventure' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Easterni', value: 'easterni' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan-Fiction', value: 'fan-fiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Games', value: 'games' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnatio', value: 'reincarnatio' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romanc', value: 'romanc' },
        { label: 'Romance', value: 'romance' },
        { label: 'Romance.Adventure', value: 'romance-adventure' },
        { label: 'RomanceAdventure', value: 'romanceadventure' },
        { label: 'Romance.Harem', value: 'romance-harem' },
        { label: 'RomanceHarem', value: 'romanceharem' },
        { label: 'Romance.Smut', value: 'romance-smut' },
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
      label: 'Maximum Chapters',
      value: '',
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

type Response = { data: { items: Items[] } };
type ChapterResponse = { success: boolean; data?: { chapters?: Items[] } };
type Items = {
  id: string;
  url: string;
  name: string;
  alt_name?: string;
  cover?: string;
  slug: string;
  updated_at?: string;
  updatedAt?: string;
  cv?: number;
};
type NovelScript = { props: { pageProps: { initialManga: Manga } } };
type Manga = {
  id: string;
  url: string;
  name?: string;
  altName?: string;
  cover: string;
  status: string;
  ratingStats?: { average: number };
  summary?: string;
  artists?: { name: string; slug: string }[];
  authors?: { name: string; slug: string }[];
  genres?: { name: string; slug: string }[];
  chapters?: Items[];
  cv?: number;
  content_version?: number;
};
type ChapterScript = { props: { pageProps: { initialChapter: Chapter } } };
type Chapter = { name: string; content: string };
