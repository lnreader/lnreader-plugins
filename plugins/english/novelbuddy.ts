import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

const fwnRegex =
  /(?:𝐟|ᵮ|𝑓|𝒇|𝒻|𝓯|𝔣|𝕗|𝖿|𝗳|𝙛|𝚏|ꬵ|ꞙ|ẝ|𝖋|ⓕ|ｆ|ḟ|ʃ|բ|ᶠ|⒡|ſ|ꊰ|ʄ|∱|ᶂ|𝘧|\bf)(?:𝚛|ꭇ|ᣴ|ℾ|𝚪|𝛤|𝜞|𝝘|𝞒|Ⲅ|Г|Ꮁ|ᒥ|ꭈ|ⲅ|ꮁ|ⓡ|ｒ|ŕ|ṙ|ř|ȑ|ȓ|ṛ|ṝ|ŗ|г|Ր|ɾ|ᥬ|ṟ|ɍ|ʳ|⒭|ɼ|ѓ|ᴦ|ᶉ|𝐫|𝑟|𝒓|𝓇|𝓻|𝔯|𝕣|𝖗|𝗋|𝗿|𝘳|𝙧|ᵲ|ґ|ᵣ|r)(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)+(?:𝐰|ꝡ|𝑤|𝒘|𝓌|𝔀|𝔴|𝕨|𝖜|𝗐|𝘄|𝘸|𝙬|𝚠|ա|ẁ|ꮃ|ẃ|ⓦ|⍵|ŵ|ẇ|ẅ|ẘ|ẉ|ⱳ|ὼ|ὠ|ὡ|ὢ|ὣ|ω|ὤ|ὥ|ὦ|ὧ|ῲ|ῳ|ῴ|ῶ|ῷ|Ⱳ|ѡ|ԝ|ᴡ|ώ|ᾠ|ᾡ|ᾡ|ᾢ|ᾣ|ᾤ|ᾥ|ᾦ|ɯ|𝝕|𝟉|𝞏|w)(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ȇ|ẹ|ệ|ȩ|ɇ|ₑ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)(?:ꮟ|Ꮟ|𝐛|𝘣|𝒷|𝔟|𝓫|𝖇|𝖻|𝑏|𝙗|𝕓|𝒃|𝗯|𝚋|♭|ᑳ|ᒈ|ｂ|ᖚ|ᕹ|ᕺ|ⓑ|ḃ|ḅ|ҍ|ъ|ḇ|ƃ|ɓ|ƅ|ᖯ|Ƅ|Ь|ᑲ|þ|Ƃ|⒝|Ъ|ᶀ|ᑿ|ᒀ|ᒂ|ᒁ|ᑾ|ь|ƀ|Ҍ|Ѣ|ѣ|ᔎ |b)(?:ո|ռ|ח|𝒏|𝓷|𝙣|𝑛|𝖓|𝔫|𝗇|𝚗|𝗻|ᥒ|ⓝ|ή|ｎ|ǹ|ᴒ|ń|ñ|ᾗ|η|ṅ|ň|ṇ|ɲ|ņ|ṋ|ṉ|ղ|ຖ|Ռ|ƞ|ŋ|⒩|ภ|ก|ɳ|п|ŉ|л|ԉ|Ƞ|ἠ|ἡ|ῃ|դ|ᾐ|ᾑ|ᾒ|ᾓ|ᾔ|ᾕ|ᾖ|ῄ|ῆ|ῇ|ῂ|ἢ|ἣ|ἤ|ἥ|ἦ|ἧ|ὴ|ή|በ|ቡ|ቢ|ባ|ቤ|ብ|ቦ|ȵ|𝛈|𝜂|𝜼|𝝶|𝞰|𝕟|延|𝐧|𝔫|ᶇ|ᵰ|ᥥ|∩|n)(?:ం|ం|ം|ං|૦|௦|۵|ℴ|𝑜|𝒐|𝒐|ꬽ|𝝄|𝛔|𝜎|𝝈|𝞂|ჿ|𝚘|০|୦|ዐ|𝛐|𝗈|𝞼|ဝ|ⲟ|𝙤|၀|𐐬|𝔬|𐓪|𝓸|🇴|⍤|○|ϙ|🅾|𝒪|𝖮|𝟢|𝟶|𝙾|o|𝗼|𝕠|𝜊|𝐨|𝝾|𝞸|ᐤ|ｵ|ѳ|᧐|ᥲ|ð|ｏ|ఠ|ᦞ|Փ|ò|ө|ӧ|ó|º|ō|ô|ǒ|ȏ|ŏ|ồ|ȭ|ṏ|ὄ|ṑ|ṓ|ȯ|ȫ|๏|ᴏ|ő|ö|ѻ|о|ዐ|ǭ|ȱ|০|୦|٥|౦|告知|๐|໐|ο|օ|ᴑ|०|੦|ỏ|ơ|ờ|ớ|ỡ|ở|ợ|ọ|ộ|ộ|ǫ|ø|ǿ|ɵ|ծ|ὀ|ὁ|ό|ὸ|ό|ὂ|ὃ|ὅ|o)(?:∨|⌄|\\|ⅴ|𝐯|𝑣|𝒗|𝓋|𝔳|𝕧|𝖛|ꮩ|ሀ|ⓥ|ｖ|𝜐|𝝊|ṽ|ṿ|౮|ง|ѵ|ע|ᴠ|ν|ט|ᵥ|ѷ|៴|ᘁ|𝙫|𝙫|𝛎|𝜈|𝝂|𝝼|𝞶|𝘷|𝘃|𝓿|v)(?:ə|ә|ⅇ|ꬲ|ꞓ|⋴|𝛆|𝛜|𝜀|𝜖|𝜺|𝝐|𝝴|𝞊|𝞮|𝟄|ⲉ|ꮛ|𐐩|Ꞓ|Ⲉ|⍷|𝑒|𝓮|𝕖|𝖊|𝘦|𝗲|𝚎|𝙚|𝒆|𝔢|𝖾|𝐞|Ҿ|ҿ|ⓔ|ｅ|⒠|è|ᧉ|é|ᶒ|ê|ɘ|ἔ|ề|ế|ễ|૯|ǝ|є|ε|ē|ҽ|ɛ|ể|ẽ|ḕ|ḗ|ĕ|ė|ë|ẻ|ě|ȅ|ȇ|ẹ|ệ|ȩ|ɇ|ę|ḝ|ḙ|ḛ|℮|е|ԑ|ѐ|ӗ|ᥱ|ё|ἐ|ἑ|ἒ|ἓ|ἕ|ℯ|e)(?:ⓛ|ｌ|ŀ|ĺ|ľ|ḷ|ḹ|ḷ|ļ|Ӏ|ℓ|ḽ|ḻ|ł|ﾚ|ɭ|ƚ|ɫ|ⱡ|\\||\\\\|Ɩ|⒧|ʅ|ǀ|ו|ן|Ι|І|｜|ᶩ|ӏ|𝓘|𝕀|𝖨|𝗜|𝘐|𝐥|𝑙|𝒍|𝓁|𝔩|𝕝|𝖑|ލ|𝗅|𝗹|ލ|𝗅|𝗹|ល|𝚕|𝜤|𝝞|ı|𝚤|ɩ|ι|𝛊|𝜄|𝜾|𝞲|I|l)(?:.?(?:🝌|ｃ|ⅽ|𝐜|𝑐|𝒄|𝒸|𝓬|𝔠|𝕔|𝖈|𝖈|𝗰|𝘤|𝙘|𝚌|ᴄ|ϲ|ⲥ|с|ꮯ|𐐽|ⲥ|𐐽|ꮯ|ĉ|ｃ|ⓒ|ć|č|ċ|ç|ҁ|ƈ|ḉ|ȼ|ↄ|с|ር|ᴄ|ϲ|ҫ|꒝|ς|ɽ|ϛ|𝙲|ᑦ|᧚|𝐜|𝑐|𝒄|𝒸|𝓬|𝔠|𝕔|𝖈|𝖈|𝗰|𝘤|𝙘|𝚌|₵|🇨|ᥴ|ᒼ|ⅽ|c)(?:ం|ం|ം|ං|૦|௦|۵|ℴ|𝑜|𝒐|𝒐|ꬽ|𝝄|𝛔|𝜎|𝝈|𝞂|ჿ|𝚘|০|୦|ዐ|𝗈|𝞼|ဝ|ⲟ|𝙤|၀|𐐬|𝔬|𐓪|𝓸|🇴|⍤|○|ϙ|🅾|𝒪|𝖮|𝟢|𝟶|𝙾|o|𝗼|𝕠|𝜊|𝐨|𝝾|𝞸|ᐤ|ⓞ|ѳ|᧐|ᥲ|ð|ｏ|ఠ|ᦞ|Փ|ò|ө|ӧ|ó|º|ō|ô|ǒ|ȏ|ŏ|ồ|ȭ|ṏ|ὄ|ṑ|ṓ|ȯ|ȫ|๏|ᴏ|ő|ö|ѻ|о|ዐ|ǭ|ȱ|০|୦|٥|౦|告知|๐|໐|ο|օ|ᴑ|०|੦|ỏ|ơ|ờ|ớ|ỡ|ở|ợ|ọ|ộ|ǫ|ø|ǿ|ɵ|ծ|ὀ|ὁ|ό|ὸ|ό|ὂ|ὃ|ὅ|o)(?:₥|ᵯ|𝖒|𝐦|𝗆|𝔪|𝕞|𝕞|𝕞|ⓜ|ｍ|ന|ᙢ|൩|ḿ|ṁ|ⅿ|ϻ|ṃ|ጠ|ɱ|៳|ᶆ|𝒎|🇲|𝙢|𝓶|𝚖|𝑚|𝗺|᧕|᧗|m))?/g;

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
      /<script id=\"__NEXT_DATA__\" type=\"application\\/json\">(.*?)<\\/script>/,
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
      $('br').replaceWith('\\n');
      $('p').before('\\n').after('\\n\\n');
      novel.summary = $('div')
        .text()
        .split('\\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\\n\\n')
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
        .map(chapter => ({\n          name: chapter.name,\n          path:\n            (chapter.url.startsWith('/') ? chapter.url.slice(1) : chapter.url) +\n            `?id=${initialManga.id}&chapterId=${chapter.id}`,\n          releaseTime: chapter.updated_at,\n        }))\n        .reverse();\n    } else if (initialManga.chapters) {\n      novel.chapters = initialManga.chapters\n        .map(chapter => ({\n          name: chapter.name,\n          path: chapter.url.startsWith('/')\n            ? chapter.url.slice(1)\n            : chapter.url,\n          releaseTime: chapter.updatedAt,\n        }))\n        .reverse();\n    }\n\n    return novel;\n  }\n\n  async parseChapter(chapterPath: string): Promise<string> {\n    const novelIdMatch = chapterPath.match(/[?&]id=([^&]+)/);\n    const chapterIdMatch = chapterPath.match(/[?&]chapterId=([^&]+)/);\n\n    let content = '';\n\n    if (novelIdMatch && chapterIdMatch) {\n      const novelId = novelIdMatch[1];\n      const chapterId = chapterIdMatch[1];\n      const apiUrl = `${this.api}titles/${novelId}/chapters/${chapterId}`;\n      const response = await fetchApi(apiUrl);\n      const json = await response.json();\n      content = json?.data?.chapter?.content || '';\n    }\n\n    if (!content) {\n      const result = await fetchApi(this.site + chapterPath);\n      const body = await result.text();\n      const scriptMatch = body.match(\n        /<script id=\"__NEXT_DATA__\" type=\"application\\/json\">(.*?)<\\/script>/,\n      );\n      if (!scriptMatch) throw new Error('Could not find __NEXT_DATA__');\n\n      const data: ChapterScript = JSON.parse(scriptMatch[1]);\n      const initialChapter = data.props.pageProps.initialChapter;\n      if (!initialChapter) throw new Error('Could not find chapter content');\n      content = initialChapter.content;\n    }\n\n    if (content) {\n      content = content.replace(\n        /Find authorized novels in Webnovel.*?faster updates, better experience.*?Please click www\\.webnovel\\.com for visiting\\./gi,\n        '',\n      );\n      content = content.replace(fwnRegex, '');\n    }\n\n    return content;\n  }\n\n  async searchNovels(\n    searchTerm: string,\n    page: number,\n  ): Promise<Plugin.NovelItem[]> {\n    const params = new URLSearchParams({\n      'q': searchTerm,\n      'limit': '24',\n      'page': page.toString(),\n    });\n    const url = this.api + 'titles/search?' + params.toString();\n    const result = await fetchApi(url);\n    const body = await result.json();\n    return this.parseNovels(body);\n  }\n\n  filters = {\n    orderBy: {\n      value: 'views',\n      label: 'Order by',\n      options: [\n        { label: 'Default Order', value: '' },\n        { label: 'Most Viewed', value: 'views' },\n        { label: 'Latest Updated', value: 'latest' },\n        { label: 'Most Popular', value: 'popular' },\n        { label: 'A-Z', value: 'alphabetical' },\n        { label: 'Highest Rating', value: 'rating' },\n        { label: 'Most Chapters', value: 'chapters' },\n      ],\n      type: FilterTypes.Picker,\n    },\n    keyword: { value: '', label: 'Keywords', type: FilterTypes.TextInput },\n    status: {\n      value: 'all',\n      label: 'Status',\n      options: [\n        { label: 'All', value: 'all' },\n        { label: 'Ongoing', value: 'ongoing' },\n        { label: 'Completed', value: 'completed' },\n        { label: 'Hiatus', value: 'hiatus' },\n        { label: 'Cancelled', value: 'cancelled' },\n      ],\n      type: FilterTypes.Picker,\n    },\n    genre: {\n      value: { include: [], exclude: [] },\n      label: 'Genres (OR, not AND)',\n      options: [\n        { label: 'Action', value: 'action' },\n        { label: 'ActionAdventure', value: 'actionadventure' },\n        { label: 'Adult', value: 'adult' },\n        { label: 'Adventure', value: 'adventure' },\n        { label: 'Comedy', value: 'comedy' },\n        { label: 'Drama', value: 'drama' },\n        { label: 'Eastern', value: 'eastern' },\n        { label: 'Easterni', value: 'easterni' },\n        { label: 'Ecchi', value: 'ecchi' },\n        { label: 'Fan-Fiction', value: 'fan-fiction' },\n        { label: 'Fantasy', value: 'fantasy' },\n        { label: 'Game', value: 'game' },\n        { label: 'Games', value: 'games' },\n        { label: 'Gender Bender', value: 'gender-bender' },\n        { label: 'Harem', value: 'harem' },\n        { label: 'Historical', value: 'historical' },\n        { label: 'Horror', value: 'horror' },\n        { label: 'Isekai', value: 'isekai' },\n        { label: 'Josei', value: 'josei' },\n        { label: 'Lolicon', value: 'lolicon' },\n        { label: 'Magic', value: 'magic' },\n        { label: 'Martial Arts', value: 'martial-arts' },\n        { label: 'Mature', value: 'mature' },\n        { label: 'Mecha', value: 'mecha' },\n        { label: 'Military', value: 'military' },\n        { label: 'Modern Life', value: 'modern-life' },\n        { label: 'Movies', value: 'movies' },\n        { label: 'Mystery', value: 'mystery' },\n        { label: 'Psychologic', value: 'psychologic' },\n        { label: 'Psychological', value: 'psychological' },\n        { label: 'Reincarnatio', value: 'reincarnatio' },\n        { label: 'Reincarnation', value: 'reincarnation' },\n        { label: 'Romanc', value: 'romanc' },\n        { label: 'Romance', value: 'romance' },\n        { label: 'Romance.Adventure', value: 'romance-adventure' },\n        { label: 'RomanceAdventure', value: 'romanceadventure' },\n        { label: 'Romance.Harem', value: 'romance-harem' },\n        { label: 'RomanceHarem', value: 'romanceharem' },\n        { label: 'Romance.Smut', value: 'romance-smut' },\n        { label: 'Romancei', value: 'romancei' },\n        { label: 'Romancem', value: 'romancem' },\n        { label: 'School Life', value: 'school-life' },\n        { label: 'Sci-fi', value: 'sci-fi' },\n        { label: 'Seinen', value: 'seinen' },\n        { label: 'Seinen Wuxia', value: 'seinen-wuxia' },\n        { label: 'Shoujo', value: 'shoujo' },\n        { label: 'Shoujo Ai', value: 'shoujo-ai' },\n        { label: 'Shounen', value: 'shounen' },\n        { label: 'Shounen Ai', value: 'shounen-ai' },\n        { label: 'Slice of Lif', value: 'slice-of-lif' },\n        { label: 'Slice Of Life', value: 'slice-of-life' },\n        { label: 'Slice of Lifel', value: 'slice-of-lifel' },\n        { label: 'Smut', value: 'smut' },\n        { label: 'Sports', value: 'sports' },\n        { label: 'Superna', value: 'superna' },\n        { label: 'Supernatural', value: 'supernatural' },\n        { label: 'System', value: 'system' },\n        { label: 'Thriller', value: 'thriller' },\n        { label: 'Tragedy', value: 'tragedy' },\n        { label: 'Urban', value: 'urban' },\n        { label: 'Urban Life', value: 'urban-life' },\n        { label: 'Wuxia', value: 'wuxia' },\n        { label: 'Xianxia', value: 'xianxia' },\n        { label: 'Xuanhuan', value: 'xuanhuan' },\n        { label: 'Yaoi', value: 'yaoi' },\n        { label: 'Yuri', value: 'yuri' },\n      ],\n      type: FilterTypes.ExcludableCheckboxGroup,\n    },\n    min_ch: {\n      value: '',\n      label: 'Minimum Chapters',\n      type: FilterTypes.TextInput,\n    },\n    max_ch: {\n      label: 'Maximum Chapters',\n      value: '',\n      type: FilterTypes.TextInput,\n    },\n    type: {\n      value: '',\n      label: 'Types',\n      options: [\n        { label: 'All Types', value: '' },\n        { label: 'Japanese comics', value: 'manga' },\n        { label: 'Korean comics', value: 'manhwa' },\n        { label: 'Chinese comics', value: 'manhua' },\n      ],\n      type: FilterTypes.Picker,\n    },\n    demo: {\n      value: [],\n      label: 'Demographics',\n      options: [\n        { label: 'Shounen', value: 'shounen' },\n        { label: 'Shoujo', value: 'shoujo' },\n        { label: 'Seinen', value: 'seinen' },\n        { label: 'Josei', value: 'josei' },\n      ],\n      type: FilterTypes.CheckboxGroup,\n    },\n  } satisfies Filters;\n}\n\nexport default new NovelBuddy();\n\ntype Response = { data: { items: Items[] } };\ntype ChapterResponse = { success: boolean; data?: { chapters?: Items[] } };\ntype Items = {\n  id: string;\n  url: string;\n  name: string;\n  alt_name?: string;\n  cover?: string;\n  slug: string;\n  updated_at?: string;\n  updatedAt?: string;\n  cv?: number;\n};\ntype NovelScript = { props: { pageProps: { initialManga: Manga } } };\ntype Manga = {\n  id: string;\n  url: string;\n  name?: string;\n  altName?: string;\n  cover: string;\n  status: string;\n  ratingStats?: { average: number };\n  summary?: string;\n  artists?: { name: string; slug: string }[];\n  authors?: { name: string; slug: string }[];\n  genres?: { name: string; slug: string }[];\n  chapters?: Items[];\n  cv?: number;\n  content_version?: number;\n};\ntype ChapterScript = { props: { pageProps: { initialChapter: Chapter } } };\ntype Chapter = { name: string; content: string };\n