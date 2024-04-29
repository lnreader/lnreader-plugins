import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class NovelUpdates implements Plugin.PluginBase {
  id = 'novelupdates';
  name = 'Novel Updates';
  version = '0.5.3';
  icon = 'src/en/novelupdates/icon.png';
  site = 'https://www.novelupdates.com/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.search_main_box_nu').each((idx, ele) => {
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelName = loadedCheerio(ele).find('.search_title > a').text();
      const novelUrl = loadedCheerio(ele)
        .find('.search_title > a')
        .attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
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
    let link = `${this.site}`;
    if (
      filters.language.value.length ||
      filters.novelType.value.length ||
      filters.genres.value.include?.length ||
      filters.genres.value.exclude?.length ||
      filters.storyStatus.value !== ''
    ) {
      link += 'series-finder/?sf=1';
    } else if (showLatestNovels) {
      link += 'latest-series/?st=1';
    } else {
      link += 'series-ranking/?rank=week';
    }

    if (filters.language.value.length)
      link += '&org=' + filters.language.value.join(',');

    if (filters.novelType.value.length)
      link += '&nt=' + filters.novelType.value.join(',');

    if (filters.genres.value.include?.length)
      link += '&gi=' + filters.genres.value.include.join(',');

    if (filters.genres.value.exclude?.length)
      link += '&ge=' + filters.genres.value.exclude.join(',');

    if (
      filters.genres.value.include?.length ||
      filters.genres.value.exclude?.length
    )
      link += '&mgi=' + filters.genre_operator.value;

    if (filters.storyStatus.value.length)
      link += '&ss=' + filters.storyStatus.value;

    link += '&sort=' + filters.sort.value;

    link += '&order=' + filters.order.value;

    link += '&pg=' + page;

    const body = await fetchApi(link).then(result => result.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.seriestitlenu').text() || 'Untitled',
      cover: loadedCheerio('.wpb_wrapper img').attr('src'),
      chapters: [],
    };

    novel.author = loadedCheerio('#authtag')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(', ');

    novel.genres = loadedCheerio('#seriesgenre')
      .children('a')
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    novel.status = loadedCheerio('#editstatus').text().includes('Ongoing')
      ? 'Ongoing'
      : 'Completed';

    const type = loadedCheerio('#showtype').text().trim();

    const summary = loadedCheerio('#editdescription').text().trim();

    novel.summary = summary + `\n\nType: ${type}`;

    const chapter: Plugin.ChapterItem[] = [];

    const novelId = loadedCheerio('input#mypostid').attr('value')!;

    const formData = new FormData();
    formData.append('action', 'nd_getchapters');
    formData.append('mygrr', '0');
    formData.append('mypostid', novelId);

    const link = `${this.site}wp-admin/admin-ajax.php`;

    const text = await fetchApi(link, {
      method: 'POST',
      body: formData,
    }).then(data => data.text());

    loadedCheerio = parseHTML(text);

    loadedCheerio('li.sp_li_chp').each((i, el) => {
      const chapterName = loadedCheerio(el).text().trim();
      const chapterUrl =
        'https:' + loadedCheerio(el).find('a').first().next().attr('href');

      chapter.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ''),
      });
    });

    novel.chapters = chapter.reverse();

    return novel;
  }

  getLocation(href: string) {
    var match = href.match(
      /^(https?:)\/\/(([^:/?#]*)(?::([0-9]+))?)([/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/,
    );
    return match && `${match[1]}//${match[3]}`;
  }

  async getChapterBody(
    loadedCheerio: CheerioAPI,
    domain: string[],
    url: string,
  ) {
    let bloatClasses = [];
    let chapterTitle = '';
    let chapterContent = '';
    let chapterText = '';

    const unwanted = ['blogspot', 'wordpress', 'www'];
    const targetDomain = domain.find(d => !unwanted.includes(d));

    switch (targetDomain) {
      case 'anotivereads':
        chapterTitle = loadedCheerio('#comic-nav-name').first().text()!;
        chapterContent = loadedCheerio('#spliced-comic').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'asuratls':
        let titleElementAsura = loadedCheerio('.post-body div b').first();
        chapterTitle = titleElementAsura.first().text();
        titleElementAsura.remove();
        chapterContent = loadedCheerio('.post-body').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'hiraethtranslation':
        chapterTitle = loadedCheerio('li.active').first().text()!;
        chapterContent = loadedCheerio('.text-left').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'hostednovel':
        chapterTitle = loadedCheerio('#chapter-title').first().text()!;
        chapterContent = loadedCheerio('#chapter-content').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'inoveltranslation':
        const link_inovel = 'https://api.' + url.slice(8);
        const json_inovel = await fetchApi(link_inovel).then(r => r.json());
        chapterTitle =
          'Chapter ' + json_inovel.chapter + ' | ' + json_inovel.title;
        chapterContent = json_inovel.content.replace(/\n/g, '<br>');
        if (json_inovel.notes) {
          chapterContent +=
            '<br><hr><br>TL Notes:<br>' +
            json_inovel.notes.replace(/\n/g, '<br>');
        }
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'ko-fi':
        chapterText = loadedCheerio('script:contains("shadowDom.innerHTML")')
          .html()
          ?.match(/shadowDom\.innerHTML \+= '(<div.*?)';/)![1]!;
        break;
      case 'novelworldtranslations':
        bloatClasses = ['.separator', 'p[dir="ltr"]'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.entry-title').first().text()!;
        chapterContent = loadedCheerio('.entry-content p span span').html()!;
        let chapterContentArray = chapterContent.split('\n').map(paragraph => {
          return paragraph.replace(/&nbsp;/g, '').trim() + '<br>';
        });
        chapterContent = chapterContentArray.join('').trim();
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'raeitranslations':
        const parts = url.split('/');
        const link_raei = `${parts[0]}//api.${parts[2]}/api/chapters/?id=${parts[3]}&num=${parts[4]}`;
        const json = await fetchApi(link_raei).then(r => r.json());
        chapterTitle =
          json.currentChapter.novTitle +
          ' | ' +
          'Chapter ' +
          json.currentChapter.num;
        chapterContent =
          json.currentChapter.head +
          `<br><hr><br>` +
          json.currentChapter.body +
          `<br><hr><br>Translator's Note:<br>` +
          json.currentChapter.note;
        chapterContent = chapterContent.replace(/\n/g, '<br>');
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'rainofsnow':
        loadedCheerio('.responsivevoice-button').remove();
        chapterText = loadedCheerio('div.content').html()!;
        break;
      case 'sacredtexttranslations':
        bloatClasses = ['.entry-content blockquote', '.entry-content div'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.entry-title').first().text()!;
        chapterContent = loadedCheerio('.entry-content').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'scribblehub':
        chapterTitle = loadedCheerio('.chapter-title').first().text()!;
        chapterContent = loadedCheerio('div.chp_raw').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'stabbingwithasyringe':
        /**
         * Get the chapter link from the main page
         */
        const linkSyringe = loadedCheerio('.entry-content a').attr('href')!;
        const resultSyringe = await fetchApi(linkSyringe);
        const bodySyringe = await resultSyringe.text();
        const loadedCheerioSyringe = parseHTML(bodySyringe);
        bloatClasses = ['.wp-block-buttons', '#jp-post-flair'];
        bloatClasses.map(tag => loadedCheerioSyringe(tag).remove());
        chapterContent = loadedCheerioSyringe('.entry-content').html()!;
        let titleElementSyringe =
          loadedCheerioSyringe('.entry-content h3').first();
        if (titleElementSyringe.length) {
          chapterTitle = titleElementSyringe.first().text();
          titleElementSyringe.remove();
          chapterContent = loadedCheerioSyringe('.entry-content').html()!;
          chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        } else {
          chapterText = chapterContent;
        }
        break;
      case 'tinytranslation':
        bloatClasses = [
          '.google_translate_element',
          '.navigate',
          '.post-views',
        ];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.title-content').first().text()!;
        loadedCheerio('.title-content').first().remove();
        chapterContent = loadedCheerio('.content').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'tumblr':
        chapterText = loadedCheerio('.post').html()!;
        break;
      case 'wattpad':
        chapterTitle = loadedCheerio('.h2').first().text()!;
        chapterContent = loadedCheerio('.part-content pre').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'webnovel':
        chapterTitle = loadedCheerio('.cha-tit .pr .dib').first().text()!;
        chapterContent = loadedCheerio('.cha-words').html()!;
        if (!chapterContent) {
          chapterContent = loadedCheerio('._content').html()!;
        }
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
      case 'wuxiaworld':
        bloatClasses = ['.MuiLink-root'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('h4 span').first().text()!;
        chapterContent = loadedCheerio('.chapter-content').html()!;
        chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
        break;
    }
    return chapterText;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let bloatClasses = [];
    let chapterTitle = '';
    let chapterContent = '';
    let chapterText = '';

    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const url = result.url.toLowerCase();
    const domain = url.split('/')[2].split('.');

    // console.log(result.url);

    // console.log('Redirected URL: ', result.chapterUrl);

    const loadedCheerio = parseHTML(body);
    /**
     * Generators are last
     */
    let isBlogspotStr = loadedCheerio(
      'meta[name="google-adsense-platform-domain"]',
    ).attr('content');

    let isBlogspot = false;
    if (isBlogspotStr) {
      isBlogspot = isBlogspotStr.toLowerCase().includes('blogspot');
    }

    let isWordPressStr =
      loadedCheerio('#dcl_comments-js-extra').html()! ||
      loadedCheerio('meta[name="generator"]').attr('content') ||
      loadedCheerio('footer').text();

    let isWordPress = false;
    if (isWordPressStr) {
      isWordPress =
        isWordPressStr.toLowerCase().includes('wordpress') ||
        isWordPressStr.includes('Site Kit by Google') ||
        loadedCheerio('.powered-by').text().toLowerCase().includes('wordpress');
    }

    const outliers = [
      'anotivereads',
      'asuratls',
      'novelworldtranslations',
      'sacredtexttranslations',
      'stabbingwithasyringe',
      'tinytranslation',
    ];
    if (domain.find(d => outliers.includes(d))) {
      isWordPress = false;
      isBlogspot = false;
    }
    /**
     * Blogspot Novels:
     * - AssedTL
     * - AsuraTls (Outlier)
     * - Novel World Translations (Outlier)
     * - SacredText Translation (Outlier)
     *
     * WordPress Novels:
     * - A Novel Reader Attempts Translating
     * - Anomalously Creative (Outlier)
     * - Arcane Translations
     * - Blossom Translation
     * - Dumah's Translations
     * - ElloTL
     * - Gem Novels Translations
     * - Genesis Translations
     * - Goblinslate
     * - Hel Scans
     * - Ippo Translations
     * - JATranslations
     * - Light Novels Translations
     * - Neosekai Translations
     * - Shanghai Fantasy
     * - Soafp Translations
     * - Stabbing with a Syringe (Outlier)
     * - Stone Scape
     * - Tiny Translation (Outlier)
     * - Wonder Novels
     * - Yong Library
     * - Zetro Translation
     */
    if (!isWordPress && !isBlogspot) {
      chapterText = await this.getChapterBody(loadedCheerio, domain, url);
    } else if (isBlogspot) {
      /**
       * Generators are last
       */
      bloatClasses = ['.button-container', '.separator'];
      bloatClasses.map(tag => loadedCheerio(tag).remove());
      chapterTitle =
        loadedCheerio('.entry-title').first().text() ||
        loadedCheerio('.post-title').first().text()!;
      chapterContent =
        loadedCheerio('.entry-content').html() ||
        loadedCheerio('.post-body').html()!;
      chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
    } else if (isWordPress) {
      bloatClasses = [
        '.ad',
        '.author-avatar',
        '.chapter-warning',
        '.entry-content .has-text-align-center',
        '.entry-meta',
        '.ezoic-ad',
        '.mb-center',
        '.patreon-widget',
        '.post-cats',
        '.pre-bar',
        '.sharedaddy',
        '.sidebar',
        '.wp-block-buttons',
        '.wp-block-columns',
        '.wp-block-image',
        '.wp-dark-mode-switcher',
        '.wp-next-post-navi',
        '#jp-post-flair',
        '#textbox',
      ];
      bloatClasses.map(tag => loadedCheerio(tag).remove());
      chapterTitle =
        loadedCheerio('.entry-title').first().text() ||
        loadedCheerio('.entry-title-main').first().text() ||
        loadedCheerio('.chapter__title').first().text() ||
        loadedCheerio('.sp-title').first().text() ||
        loadedCheerio('.title-content').first().text() ||
        loadedCheerio('.wp-block-post-title').first().text() ||
        loadedCheerio('.title_story').first().text() ||
        loadedCheerio('.active').first().text() ||
        loadedCheerio('head title').first().text()!;
      let chapterSubtitle = loadedCheerio('.cat-series').first().text() || '';
      chapterContent =
        loadedCheerio('.rdminimal').html() ||
        loadedCheerio('.entry-content').html() ||
        loadedCheerio('.chapter__content').html() ||
        loadedCheerio('.prevent-select').html() ||
        loadedCheerio('.text_story').html() ||
        loadedCheerio('.contenta').html() ||
        loadedCheerio('.single_post').html() ||
        loadedCheerio('.post-entry').html() ||
        loadedCheerio('.main-content').html() ||
        loadedCheerio('.content').html() ||
        loadedCheerio('.page-body').html() ||
        loadedCheerio('.td-page-content').html() ||
        loadedCheerio('#content').html() ||
        loadedCheerio('article.post').html()!;
      if (chapterSubtitle) {
        chapterTitle = `${chapterTitle} | ${chapterSubtitle}`;
      }
      chapterText = `<h1>${chapterTitle}</h1><br>${chapterContent}`;
    }

    if (!chapterText) {
      /**
       * Remove unnecessary tags
       */
      const tags = ['nav', 'header', 'footer', '.hidden'];
      tags.map(tag => loadedCheerio(tag).remove());
      chapterText = loadedCheerio('body').html()!;
    }

    if (chapterText) {
      /**
       * Convert relative urls to absolute
       */
      chapterText = chapterText.replace(
        /href="\//g,
        `href="${this.getLocation(result.url)}/`,
      );
    }

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site +
      '?s=' +
      searchTerm.replace(/\s+/g, '+') +
      '&post_type=seriesplans';
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'sdate',
      options: [
        { label: 'Last Updated', value: 'sdate' },
        { label: 'Rating', value: 'srate' },
        { label: 'Rank', value: 'srank' },
        { label: 'Reviews', value: 'sreview' },
        { label: 'Chapters', value: 'srel' },
        { label: 'Title', value: 'abc' },
        { label: 'Readers', value: 'sread' },
        { label: 'Frequency', value: 'sfrel' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Order',
      value: 'desc',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      label: 'Story Status (Translation)',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: '2' },
        { label: 'Ongoing', value: '3' },
        { label: 'Hiatus', value: '4' },
      ],
      type: FilterTypes.Picker,
    },
    language: {
      label: 'Language',
      value: [],
      options: [
        { label: 'Chinese', value: '495' },
        { label: 'Filipino', value: '9181' },
        { label: 'Indonesian', value: '9179' },
        { label: 'Japanese', value: '496' },
        { label: 'Khmer', value: '18657' },
        { label: 'Korean', value: '497' },
        { label: 'Malaysian', value: '9183' },
        { label: 'Thai', value: '9954' },
        { label: 'Vietnamese', value: '9177' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    novelType: {
      label: 'Novel Type',
      value: [],
      options: [
        { label: 'Light Novel', value: '2443' },
        { label: 'Published Novel', value: '26874' },
        { label: 'Web Novel', value: '2444' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genres: {
      label: 'Genres',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Action', value: '8' },
        { label: 'Adult', value: '280' },
        { label: 'Adventure', value: '13' },
        { label: 'Comedy', value: '17' },
        { label: 'Drama', value: '9' },
        { label: 'Ecchi', value: '292' },
        { label: 'Fantasy', value: '5' },
        { label: 'Gender Bender', value: '168' },
        { label: 'Harem', value: '3' },
        { label: 'Historical', value: '330' },
        { label: 'Horror', value: '343' },
        { label: 'Josei', value: '324' },
        { label: 'Martial Arts', value: '14' },
        { label: 'Mature', value: '4' },
        { label: 'Mecha', value: '10' },
        { label: 'Mystery', value: '245' },
        { label: 'Psychoical', value: '486' },
        { label: 'Romance', value: '15' },
        { label: 'School Life', value: '6' },
        { label: 'Sci-fi', value: '11' },
        { label: 'Seinen', value: '18' },
        { label: 'Shoujo', value: '157' },
        { label: 'Shoujo Ai', value: '851' },
        { label: 'Shounen', value: '12' },
        { label: 'Shounen Ai', value: '1692' },
        { label: 'Slice of Life', value: '7' },
        { label: 'Smut', value: '281' },
        { label: 'Sports', value: '1357' },
        { label: 'Supernatural', value: '16' },
        { label: 'Tragedy', value: '132' },
        { label: 'Wuxia', value: '479' },
        { label: 'Xianxia', value: '480' },
        { label: 'Xuanhuan', value: '3954' },
        { label: 'Yaoi', value: '560' },
        { label: 'Yuri', value: '922' },
      ],
    },
    genre_operator: {
      label: 'Genre (AND/OR)',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelUpdates();
