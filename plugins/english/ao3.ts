import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class ArchiveOfOurOwn implements Plugin.PluginBase {
  id = 'archiveofourown';
  name = 'Archive Of Our Own';
  version = '1.0.4';
  icon = 'src/en/ao3/icon.png';
  site = 'https://archiveofourown.org/';

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('li.work').each((idx, ele) => {
      const novelName = loadedCheerio(ele)
        .find('h4.heading > a')
        .first()
        .text()
        .trim();
      const novelUrl = loadedCheerio(ele)
        .find('h4.heading > a')
        .first()
        .attr('href')
        ?.trim();

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: defaultCover, // No cover image
        path: novelUrl.slice(1),
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      commit: 'Search',
      page: page.toString(),
      'work_search[language_id]': filters.language.value,
    });

    if (showLatestNovels) {
      params.set('work_search[sort_column]', 'revised_at');
    } else {
      params.set('work_search[sort_column]', filters.sort.value);
    }
    params.set('work_search[sort_direction]', filters.sortdir.value);

    // we could send in the entire thing without checking for blanks
    if (filters.completion.value !== '') {
      params.set('work_search[complete]', filters.completion.value);
    }
    if (filters.crossover.value !== '') {
      params.set('work_search[crossover]', filters.crossover.value);
    }
    if (filters.categories.value.length > 0) {
      filters.categories.value.forEach((category: string) => {
        params.append('work_search[category_ids][]', category);
      });
    }
    if (filters.warningsFilter.value.length > 0) {
      filters.warningsFilter.value.forEach((warning: string) => {
        params.append('work_search[archive_warning_ids][]', warning);
      });
    }
    if (filters.singlechap.value) {
      params.set('work_search[single_chapter]', '1');
    }
    if (filters.author.value !== '') {
      params.set('work_search[creators]', filters.author.value);
    }
    if (
      filters.dateFilter.value !== '' &&
      filters.dateIncrements.value !== ''
    ) {
      params.set(
        'work_search[revised_at]',
        `${filters.dateFilter.value} ${filters.dateIncrements.value}`,
      );
    }
    if (filters.words.value !== '') {
      params.set('work_search[word_count]', filters.words.value);
    }
    if (filters.hits.value !== '') {
      params.set('work_search[hits]', filters.hits.value);
    }
    if (filters.bookmarks.value !== '') {
      params.set('work_search[bookmarks_count]', filters.bookmarks.value);
    }
    if (filters.comments.value !== '') {
      params.set('work_search[comments_count]', filters.comments.value);
    }
    if (filters.kudos.value !== '') {
      params.set('work_search[kudos_count]', filters.kudos.value);
    }

    const link = `${this.site}works/search?${params.toString()}`;
    const body = await fetchApi(link).then(r => r.text());
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelUrl: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(new URL(novelUrl, this.site).toString());
    const urlchapter = novelUrl + '/navigate';
    const chapters = await fetchApi(new URL(urlchapter, this.site).toString());
    const body = await result.text();
    const chapterlisttext = await chapters.text();
    const chapterlistload = parseHTML(chapterlisttext);
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelUrl,
      name: loadedCheerio('h2.title').text().trim() || 'Untitled',
      cover: defaultCover, // No cover image available
      status: loadedCheerio('dt.status').text().includes('Updated')
        ? 'Ongoing'
        : 'Completed',
      chapters: [],
    };

    novel.author = loadedCheerio('a[rel="author"]')
      .map((i, el) => loadedCheerio(el).text().trim())
      .get()
      .join(', ');
    novel.genres = Array.from(loadedCheerio('dd.freeform.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const summary = loadedCheerio('blockquote.userstuff').text().trim();
    const fandom = Array.from(loadedCheerio('dd.fandom.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const rating = Array.from(loadedCheerio('dd.rating.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const warning = Array.from(loadedCheerio('dd.warning.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const series = Array.from(loadedCheerio('dd.series li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const relation = Array.from(loadedCheerio('dd.relationship.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const character = Array.from(loadedCheerio('dd.character.tags li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    const stats = Array.from(loadedCheerio('dd.stats li a.tag'))
      .map(el => loadedCheerio(el).text().trim())
      .join(',');
    novel.summary = `Fandom:\n${fandom}\n\nRating:\n${rating}\n\nWarning:\n${warning}\n\nSummary:\n${summary}\n\nSeries:\n${series}\n\nRelationships:\n${relation}\n\nCharacters:\n${character}\n\nStats:\n${stats}`;
    const chapterItems: Plugin.ChapterItem[] = [];
    const longReleaseDate: string[] = [];
    // let match: RegExpExecArray | null;
    chapterlistload('ol.index').each((i, ele) => {
      chapterlistload(ele)
        .find('li')
        .each((i, el) => {
          // const chapterNameMatch = chapterlistload(el).find('a').text().trim();
          const releaseTimeText = chapterlistload(el)
            .find('span.datetime')
            .text()
            .replace(/\(([^)]+)\)/g, '$1')
            .trim();
          const releaseTime = releaseTimeText
            ? new Date(releaseTimeText).toISOString()
            : '';
          longReleaseDate.push(releaseTime);
        });
    });
    const releaseTimeText = loadedCheerio('.wrapper dd.published')
      .text()
      .trim();
    const releaseTime = releaseTimeText
      ? new Date(releaseTimeText).toISOString()
      : '';
    let dateCounter = 0;
    if (loadedCheerio('#chapter_index select').length > 0) {
      loadedCheerio('#chapter_index select').each((i, selectEl) => {
        loadedCheerio(selectEl)
          .find('option')
          .each((i, el) => {
            const chapterName = loadedCheerio(el).text().trim();
            const chapterUrlCode = loadedCheerio(el).attr('value')?.trim();
            const chapterUrl = `${novelUrl}/chapters/${chapterUrlCode}`;
            const releaseDate: string = longReleaseDate[dateCounter];
            dateCounter++;
            if (chapterUrl) {
              chapterItems.push({
                name: chapterName,
                path: chapterUrl,
                releaseTime: releaseDate,
              });
            }
          });
      });
    }
    if (chapterItems.length === 0) {
      loadedCheerio('#chapters h3.title').each((i, titleEl) => {
        const fullTitleText = loadedCheerio(titleEl).text().trim();
        const chapterNameMatch = fullTitleText.match(/:\s*(.*)$/);
        let chapterName = chapterNameMatch ? chapterNameMatch[1].trim() : '';
        const chapterUrlRaw = loadedCheerio(titleEl)
          .find('a')
          .attr('href')
          ?.trim();
        const chapterUrlCode = chapterUrlRaw?.match(/\/chapters\/(\d+)/)?.[1];
        const chapterUrl = `${novelUrl}/chapters/${chapterUrlCode}`;

        if (chapterUrl) {
          if (chapterName === '') {
            const novelTitle = loadedCheerio('.work .title.heading')
              .text()
              .trim();
            chapterName = novelTitle;
          }
          chapterItems.push({
            name: chapterName,
            path: chapterUrl,
            releaseTime: releaseTime,
          });
        }
      });
      if (chapterItems.length === 0) {
        loadedCheerio('.work.navigation.actions li a').each((i, el) => {
          const href = loadedCheerio(el).attr('href');
          if (href && href.includes('/downloads/')) {
            const chapterUrlCodeMatch = href.match(/updated_at=(\d+)/);
            const chapterUrlCode = chapterUrlCodeMatch
              ? chapterUrlCodeMatch[1]
              : null;
            let chapterName = loadedCheerio('h2.title.heading').text().trim();

            const chapterUrl = `${novelUrl}/chapters/${chapterUrlCode}`;

            if (chapterUrl) {
              if (chapterName === '') {
                const novelTitle = loadedCheerio('.work .title.heading')
                  .text()
                  .trim();
                chapterName = novelTitle;
              }
              chapterItems.push({
                name: chapterName,
                path: chapterUrl,
                releaseTime: releaseTime,
              });
            }
          }
        });
      }
    }
    novel.chapters = chapterItems;

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(new URL(chapterUrl, this.site).toString());
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('h3.title').each((i, el) => {
      const $h3 = loadedCheerio(el);
      const $a = $h3.find('a');
      $a.removeAttr('href');
      const aText = $a.text().trim();
      const nextSiblingText = $h3
        .contents()
        .filter((_, node) => node.nodeType === 3)
        .text()
        .trim();
      $h3.html(`${aText}<br>${nextSiblingText}`);
    });
    loadedCheerio('h3.landmark.heading#work').remove();

    const chapterText = loadedCheerio('div#chapters > div').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      commit: 'Search',
      page: page.toString(),
      'work_search[language_id]': 'en',
      'work_search[query]': searchTerm,
    });
    const searchUrl = `${this.site}works/search?${params.toString()}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }
  filters = {
    sort: {
      value: 'hits',
      label: 'Sort by',
      options: [
        { label: 'Best Match', value: '_score' },
        { label: 'Hits', value: 'hits' },
        { label: 'Kudos', value: 'kudos' },
        { label: 'Comments', value: 'comments' },
        { label: 'Bookmarks', value: 'bookmarks' },
        { label: 'Word Count', value: 'word_count' },
        { label: 'Date Updated', value: 'revised_at' },
        { label: 'Date Posted', value: 'created_at' },
        { label: 'Author', value: 'authors_to_sort_on' },
        { label: 'Title', value: 'title_to_sort_on' },
      ],
      type: FilterTypes.Picker,
    },
    sortdir: {
      value: 'desc',
      label: 'Sort direction',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    ratings: {
      value: '',
      label: 'Ratings',
      options: [
        { label: 'Not Rated', value: '9' },
        { label: 'General Audiences', value: '10' },
        { label: 'Teen And Up Audiences', value: '11' },
        { label: 'Mature', value: '12' },
        { label: 'Explicit', value: '13' },
      ],
      type: FilterTypes.Picker,
    },
    language: {
      value: 'en',
      label: 'Language',
      options: [
        { label: 'None', value: '' },
        { label: 'af Soomaali', value: 'so' },
        { label: 'Afrikaans', value: 'afr' },
        { label: 'Aynu itak | アイヌ イタㇰ', value: 'ain' },
        { label: 'العربية', value: 'ar' },
        { label: 'አማርኛ', value: 'amh' },
        { label: '𓂋𓏺𓈖 𓆎𓅓𓏏𓊖', value: 'egy' },
        { label: 'ܐܪܡܝܐ | ארמיא', value: 'arc' },
        { label: 'հայերեն', value: 'hy' },
        { label: 'American Sign Language', value: 'ase' },
        { label: 'asturianu', value: 'ast' },
        { label: 'Bahasa Indonesia', value: 'id' },
        { label: 'Bahasa Malaysia', value: 'ms' },
        { label: 'Български', value: 'bg' },
        { label: 'বাংলা', value: 'bn' },
        { label: 'Basa Jawa', value: 'jv' },
        { label: 'Башҡорт теле', value: 'ba' },
        { label: 'беларуская', value: 'be' },
        { label: 'Bosanski', value: 'bos' },
        { label: 'Brezhoneg', value: 'br' },
        { label: 'Català', value: 'ca' },
        { label: 'Cebuano', value: 'ceb' },
        { label: 'Čeština', value: 'cs' },
        { label: 'Chinuk Wawa', value: 'chn' },
        { label: 'къырымтатар тили | qırımtatar tili', value: 'crh' },
        { label: 'Cymraeg', value: 'cy' },
        { label: 'Dansk', value: 'da' },
        { label: 'Deutsch', value: 'de' },
        { label: 'eesti keel', value: 'et' },
        { label: 'Ελληνικά', value: 'el' },
        { label: '𒅴𒂠', value: 'sux' },
        { label: 'English', value: 'en' },
        { label: 'Eald Englisċ', value: 'ang' },
        { label: 'Español', value: 'es' },
        { label: 'Esperanto', value: 'eo' },
        { label: 'Euskara', value: 'eu' },
        { label: 'فارسی', value: 'fa' },
        { label: 'Filipino', value: 'fil' },
        { label: 'Français', value: 'fr' },
        { label: 'Friisk', value: 'frr' },
        { label: 'Furlan', value: 'fur' },
        { label: 'Gaeilge', value: 'ga' },
        { label: 'Gàidhlig', value: 'gd' },
        { label: 'Galego', value: 'gl' },
        { label: '𐌲𐌿𐍄𐌹𐍃𐌺𐌰', value: 'got' },
        { label: 'Creolese', value: 'gyn' },
        { label: '中文-客家话', value: 'hak' },
        { label: '한국어', value: 'ko' },
        { label: 'Hausa | هَرْشَن هَوْسَ', value: 'hau' },
        { label: 'हिन्दी', value: 'hi' },
        { label: 'Hrvatski', value: 'hr' },
        { label: 'ʻŌlelo Hawaiʻi', value: 'haw' },
        { label: 'Interlingua', value: 'ia' },
        { label: 'isiZulu', value: 'zu' },
        { label: 'Íslenska', value: 'is' },
        { label: 'Italiano', value: 'it' },
        { label: 'עברית', value: 'he' },
        { label: 'Kalaallisut', value: 'kal' },
        { label: 'ಕನ್ನಡ', value: 'kan' },
        { label: 'ქართული', value: 'kat' },
        { label: 'Kernewek', value: 'cor' },
        { label: 'ភាសាខ្មែរ', value: 'khm' },
        { label: 'Khuzdul', value: 'qkz' },
        { label: 'Kiswahili', value: 'sw' },
        { label: 'kreyòl ayisyen', value: 'ht' },
        { label: 'Kurdî | کوردی', value: 'ku' },
        { label: 'Кыргызча', value: 'kir' },
        { label: 'Langue des signes québécoise', value: 'fcs' },
        { label: 'Latviešu valoda', value: 'lv' },
        { label: 'Lëtzebuergesch', value: 'lb' },
        { label: 'Lietuvių kalba', value: 'lt' },
        { label: 'Lingua latina', value: 'la' },
        { label: 'Magyar', value: 'hu' },
        { label: 'македонски', value: 'mk' },
        { label: 'മലയാളം', value: 'ml' },
        { label: 'Malti', value: 'mt' },
        { label: 'ᠮᠠᠨᠵᡠ ᡤᡳᠰᡠᠨ', value: 'mnc' },
        { label: "Mando'a", value: 'qmd' },
        { label: 'मराठी', value: 'mr' },
        { label: 'Mikisúkî', value: 'mik' },
        { label: 'ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ᠌ | Монгол Кирилл үсэг', value: 'mon' },
        { label: 'မြန်မာဘာသာ', value: 'my' },
        { label: 'Эрзянь кель', value: 'myv' },
        { label: 'Nāhuatl', value: 'nah' },
        { label: '中文-闽南话 臺語', value: 'nan' },
        { label: 'Nawat', value: 'ppl' },
        { label: 'Nederlands', value: 'nl' },
        { label: '日本語', value: 'ja' },
        { label: 'Norsk', value: 'no' },
        { label: 'Азәрбајҹан дили | آذربایجان دیلی', value: 'azj' },
        { label: 'Нохчийн мотт', value: 'ce' },
        { label: '‘O’odham Ñiok', value: 'ood' },
        { label: 'لسان عثمانى', value: 'ota' },
        { label: 'پښتو', value: 'ps' },
        { label: 'Plattdüütsch', value: 'nds' },
        { label: 'Polski', value: 'pl' },
        { label: 'Português brasileiro', value: 'ptBR' },
        { label: 'Português europeu', value: 'ptPT' },
        { label: 'ਪੰਜਾਬੀ', value: 'pa' },
        { label: 'qazaqşa | қазақша', value: 'kaz' },
        { label: 'Uncategorized Constructed Languages', value: 'qlq' },
        { label: 'Quenya', value: 'qya' },
        { label: 'Română', value: 'ro' },
        { label: 'Русский', value: 'ru' },
        { label: 'Scots', value: 'sco' },
        { label: 'Shqip', value: 'sq' },
        { label: 'Sindarin', value: 'sjn' },
        { label: 'සිංහල', value: 'si' },
        { label: 'Slovenčina', value: 'sk' },
        { label: 'Slovenščina', value: 'slv' },
        { label: 'Sprēkō Þiudiskō', value: 'gem' },
        { label: 'Српски', value: 'sr' },
        { label: 'suomi', value: 'fi' },
        { label: 'Svenska', value: 'sv' },
        { label: 'தமிழ்', value: 'ta' },
        { label: 'татар теле', value: 'tat' },
        { label: 'te reo Māori', value: 'mri' },
        { label: 'తెలుగు', value: 'tel' },
        { label: 'ไทย', value: 'th' },
        { label: 'Thermian', value: 'tqx' },
        { label: 'བོད་སྐད་', value: 'bod' },
        { label: 'Tiếng Việt', value: 'vi' },
        { label: 'ϯⲙⲉⲧⲣⲉⲙⲛ̀ⲭⲏⲙⲓ', value: 'cop' },
        { label: 'tlhIngan-Hol', value: 'tlh' },
        { label: 'toki pona', value: 'tok' },
        { label: 'Trinidadian Creole', value: 'trf' },
        { label: 'τσακώνικα', value: 'tsd' },
        { label: 'ᏣᎳᎩ ᎦᏬᏂᎯᏍᏗ', value: 'chr' },
        { label: 'Türkçe', value: 'tr' },
        { label: 'Українська', value: 'uk' },
        { label: 'اُردُو', value: 'urd' },
        { label: 'ئۇيغۇر تىلى', value: 'uig' },
        { label: 'Volapük', value: 'vol' },
        { label: '中文-吴语', value: 'wuu' },
        { label: 'יידיש', value: 'yi' },
        { label: 'maayaʼ tʼàan', value: 'yua' },
        { label: '中文-广东话 粵語', value: 'yue' },
        { label: '中文-普通话 國語', value: 'zh' },
      ],
      type: FilterTypes.Picker,
    },
    completion: {
      value: '',
      label: 'Completion Status',
      options: [
        { label: 'All works', value: 'checked' },
        { label: 'Complete works only', value: 'T' },
        { label: 'Works in progress only', value: 'F' },
      ],
      type: FilterTypes.Picker,
    },
    crossover: {
      value: '',
      label: 'Crossover Status',
      options: [
        { label: 'Include crossovers', value: 'checked' },
        { label: 'Exclude crossovers', value: 'T' },
        { label: 'Only crossovers', value: 'F' },
      ],
      type: FilterTypes.Picker,
    },
    categories: {
      value: [],
      label: 'Categories',
      options: [
        { label: 'F/F', value: '116' },
        { label: 'F/M', value: '22' },
        { label: 'Gen', value: '21' },
        { label: 'M/M', value: '23' },
        { label: 'Multi', value: '2246' },
        { label: 'Other', value: '24' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    warningsFilter: {
      value: [],
      label: 'Warnings',
      options: [
        { label: 'Creator Chose Not To Use Archive Warnings', value: '14' },
        { label: 'Graphic Depictions Of Violence', value: '17' },
        { label: 'Major Character Death', value: '18' },
        { label: 'No Archive Warnings Apply', value: '16' },
        { label: 'Rape/Non-Con', value: '19' },
        { label: 'Underage', value: '20' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    singlechap: {
      value: false,
      label: 'Single Chapter Stories',
      type: FilterTypes.Switch,
    },
    author: {
      value: '',
      label: 'Author/Artist',
      type: FilterTypes.TextInput,
    },
    dateFilter: {
      value: '',
      label: 'Enter single Number only Date',
      type: FilterTypes.TextInput,
    },
    dateIncrements: {
      value: 'days+ago',
      label: 'Must choose date type',
      options: [
        { label: 'Days', value: 'days+ago' },
        { label: 'Weeks', value: 'weeks+ago' },
        { label: 'Months', value: 'months+ago' },
        { label: 'Years', value: 'years+ago' },
      ],
      type: FilterTypes.Picker,
    },
    words: {
      value: '',
      label:
        'Word Count, exact number eg. 40 or  less than eg. <40 or greater than eg. >40 or range eg. 10-100',
      type: FilterTypes.TextInput,
    },
    hits: {
      value: '',
      label: 'Hits',
      type: FilterTypes.TextInput,
    },
    bookmarks: {
      value: '',
      label: 'Bookmarks',
      type: FilterTypes.TextInput,
    },
    comments: {
      value: '',
      label: 'Comments',
      type: FilterTypes.TextInput,
    },
    kudos: {
      value: '',
      label: 'Kudos',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new ArchiveOfOurOwn();
