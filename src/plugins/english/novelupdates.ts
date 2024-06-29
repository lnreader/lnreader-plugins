import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class NovelUpdates implements Plugin.PluginBase {
  id = 'novelupdates';
  name = 'Novel Updates';
  version = '0.6.0';
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

    const nameReplacements: { [key: string]: string } = {
      'v': 'volume ',
      'c': ' chapter ',
      'part': 'part ',
      'ss': 'SS',
    };

    loadedCheerio('li.sp_li_chp').each((i, el) => {
      let chapterName = loadedCheerio(el).text();
      for (let name in nameReplacements) {
        chapterName = chapterName.replace(name, nameReplacements[name]);
      }
      chapterName = chapterName.replace(/\b\w/g, l => l.toUpperCase()).trim();
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

    const unwanted = ['blogspot', 'casper', 'wordpress', 'www'];
    const targetDomain = domain.find(d => !unwanted.includes(d));

    switch (targetDomain) {
      case 'anotivereads':
        chapterTitle = loadedCheerio('#comic-nav-name').first().text()!;
        chapterContent = loadedCheerio('#spliced-comic').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'asuratls':
        let titleElementAsura = loadedCheerio('.post-body div b').first();
        chapterTitle = titleElementAsura.text()!;
        titleElementAsura.remove();
        chapterContent = loadedCheerio('.post-body').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'fictionread':
        bloatClasses = [
          '.content > style',
          '.highlight-ad-container',
          '.meaning',
          '.word',
        ];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.title-image span').first().text()!;
        loadedCheerio('.content')
          .children()
          .each((idx, ele) => {
            if (loadedCheerio(ele).attr('id')?.includes('Chaptertitle-info')) {
              loadedCheerio(ele).remove();
              return false;
            }
          });
        chapterContent = loadedCheerio('.content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'helscans':
        chapterTitle = loadedCheerio('.entry-title-main').first().text()!;
        const chapterStringHelScans =
          'Chapter ' + chapterTitle.split('Chapter')[1].trim();
        loadedCheerio('#readerarea.rdminimal')
          .children()
          .each((idx, ele) => {
            let elementText = loadedCheerio(ele).text();
            if (elementText.includes(chapterStringHelScans)) {
              chapterTitle = elementText;
              loadedCheerio(ele).remove();
              return false;
            }
          });
        chapterContent = loadedCheerio('#readerarea.rdminimal').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'hiraethtranslation':
        chapterTitle = loadedCheerio('li.active').first().text()!;
        chapterContent = loadedCheerio('.text-left').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'hostednovel':
        chapterTitle = loadedCheerio('#chapter-title').first().text()!;
        chapterContent = loadedCheerio('#chapter-content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
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
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'isotls': // mii translates
        bloatClasses = [
          'footer',
          'header',
          'nav',
          '.ezoic-ad',
          '.ezoic-adpicker-ad',
          '.ezoic-videopicker-video',
        ];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('head title').first().text()!;
        chapterContent = loadedCheerio('main article').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'ko-fi':
        chapterText = loadedCheerio('script:contains("shadowDom.innerHTML")')
          .html()
          ?.match(/shadowDom\.innerHTML \+= '(<div.*?)';/)![1]!;
        break;
      case 'mirilu':
        bloatClasses = ['#jp-post-flair'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        let titleElementMirilu = loadedCheerio(
          '.entry-content p strong',
        ).first();
        chapterTitle = titleElementMirilu.text()!;
        titleElementMirilu.remove();
        chapterContent = loadedCheerio('.entry-content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'novelplex':
        bloatClasses = ['.passingthrough_adreminder'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.halChap--jud').first().text()!;
        chapterContent = loadedCheerio('.halChap--kontenInner ').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'novelworldtranslations':
        bloatClasses = ['.separator img'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        loadedCheerio('.entry-content a')
          .filter((_, el) => {
            return (
              loadedCheerio(el)
                .attr('href')
                ?.includes('https://novelworldtranslations.blogspot.com') ||
              false
            );
          })
          .each((_, el) => {
            loadedCheerio(el).parent().remove();
          });
        chapterTitle = loadedCheerio('.entry-title').first().text()!;
        chapterContent = loadedCheerio('.entry-content')
          .html()!
          .replace(/&nbsp;/g, '')
          .replace(/\n/g, '<br>');
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'raeitranslations':
        const parts = url.split('/');
        const link_raei = `${parts[0]}//api.${parts[2]}/api/chapters/?id=${parts[3]}&num=${parts[4]}`;
        const json = await fetchApi(link_raei).then(r => r.json());
        chapterTitle = 'Chapter ' + json.currentChapter.num;
        chapterContent =
          json.currentChapter.head +
          `<br><hr><br>` +
          json.currentChapter.body +
          `<br><hr><br>Translator's Note:<br>` +
          json.currentChapter.note;
        chapterContent = chapterContent.replace(/\n/g, '<br>');
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'rainofsnow':
        let displayedDivSnow = loadedCheerio('.bb-item').filter(function () {
          return loadedCheerio(this).css('display') === 'block';
        });
        let loadedCheerioSnow = parseHTML(displayedDivSnow.html()!);
        bloatClasses = [
          '.responsivevoice-button',
          '.zoomdesc-cont p img',
          '.zoomdesc-cont p noscript',
        ];
        bloatClasses.map(tag => loadedCheerioSnow(tag).remove());
        chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
        let titleElementSnow = loadedCheerioSnow('.scroller h2').first();
        if (titleElementSnow.length) {
          chapterTitle = titleElementSnow.text()!;
          titleElementSnow.remove();
          chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
          if (chapterTitle && chapterContent) {
            chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
          }
        } else if (chapterContent) {
          chapterText = chapterContent;
        }
        break;
      case 'redoxtranslation':
        const chapterID_redox = url.split('/').pop();
        chapterTitle = `Chapter ${chapterID_redox}`;
        const url_redox = `${url.split('chapter')[0]}txt/${chapterID_redox}.txt`;
        chapterContent = await fetchApi(url_redox)
          .then(r => r.text())
          .then(text => {
            // Split text into sentences based on newline characters
            const sentences_redox = text.split('\n');
            // Process each sentence individually
            const formattedSentences_redox = sentences_redox.map(sentence => {
              // Check if the sentence contains "<hr>"
              if (sentence.includes('{break}')) {
                // Create a centered sentence with three stars
                return '<br> <p>****</p>';
              } else {
                // Replace text enclosed within ** with <strong> tags
                sentence = sentence.replace(
                  /\*\*(.*?)\*\*/g,
                  '<strong>$1</strong>',
                );
                // Replace text enclosed within ++ with <em> tags
                sentence = sentence.replace(/\+\+(.*?)\+\+/g, '<em>$1</em>');
                return sentence;
              }
            });
            // Join the formatted sentences back together with newline characters
            return formattedSentences_redox.join('<br>');
          });
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'sacredtexttranslations':
        bloatClasses = [
          '.entry-content blockquote',
          '.entry-content div',
          '.reaction-buttons',
        ];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.entry-title').first().text()!;
        chapterContent = loadedCheerio('.entry-content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'scribblehub':
        bloatClasses = ['.wi_authornotes'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.chapter-title').first().text()!;
        chapterContent = loadedCheerio('.chp_raw').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'skydemonorder':
        /**
         * Check for age verification
         */
        const ageVerification = loadedCheerio('main').text().toLowerCase()!;
        if (ageVerification.includes('age verification required')) {
          throw new Error('Age verification required, please open in webview.');
        }
        chapterTitle = `${loadedCheerio('.pl-4 h1').first().text()!} | ${loadedCheerio('.pl-4 div').first().text()!}`;
        chapterContent = loadedCheerio('#startContainer + * > *')
          .first()
          .html()!;
        if (!chapterContent) {
          chapterContent = `${loadedCheerio('#chapter-body').html()!}<hr><br>There could be missing content, please check in webview.`;
        }
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'stabbingwithasyringe':
        /**
         * Get the chapter link from the main page
         */
        const linkSyringe = loadedCheerio('.entry-content a').attr('href')!;
        const resultSyringe = await fetchApi(linkSyringe);
        const bodySyringe = await resultSyringe.text();
        const loadedCheerioSyringe = parseHTML(bodySyringe);
        bloatClasses = [
          '.has-inline-color',
          '.wp-block-buttons',
          '.wpcnt',
          '#jp-post-flair',
        ];
        bloatClasses.map(tag => loadedCheerioSyringe(tag).remove());
        chapterContent = loadedCheerioSyringe('.entry-content').html()!;
        let titleElementSyringe =
          loadedCheerioSyringe('.entry-content h3').first();
        if (titleElementSyringe.length) {
          chapterTitle = titleElementSyringe.text();
          titleElementSyringe.remove();
          chapterContent = loadedCheerioSyringe('.entry-content').html()!;
          if (chapterTitle && chapterContent) {
            chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
          }
        } else if (chapterContent) {
          chapterText = chapterContent;
        }
        break;
      case 'tinytranslation':
        bloatClasses = [
          '.content noscript',
          '.google_translate_element',
          '.navigate',
          '.post-views',
          'br',
        ];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.title-content').first().text()!;
        loadedCheerio('.title-content').first().remove();
        chapterContent = loadedCheerio('.content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2>${chapterContent}`;
        }
        break;
      case 'tumblr':
        chapterText = loadedCheerio('.post').html()!;
        break;
      case 'wattpad':
        chapterTitle = loadedCheerio('.h2').first().text()!;
        chapterContent = loadedCheerio('.part-content pre').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'webnovel':
        chapterTitle = loadedCheerio('.cha-tit .pr .dib').first().text()!;
        chapterContent = loadedCheerio('.cha-words').html()!;
        if (!chapterContent) {
          chapterContent = loadedCheerio('._content').html()!;
        }
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'wuxiaworld':
        bloatClasses = ['.MuiLink-root'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('h4 span').first().text()!;
        chapterContent = loadedCheerio('.chapter-content').html()!;
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'zetrotranslation':
        bloatClasses = ['hr', 'p:contains("\u00a0")'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterContent = loadedCheerio('.text-left').html()!;
        let titleElementZetro = loadedCheerio('.text-left h2').first();
        if (titleElementZetro.length) {
          chapterTitle = titleElementZetro.text()!;
          titleElementZetro.remove();
          chapterContent = loadedCheerio('.text-left').html()!;
          if (chapterTitle && chapterContent) {
            chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
          }
        } else if (chapterContent) {
          chapterTitle = loadedCheerio('.active').first().text()!;
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
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
    const url = result.url;
    const domain = url.toLowerCase().split('/')[2].split('.');

    const loadedCheerio = parseHTML(body);

    /**
     * Check for Captcha
     */
    const title = loadedCheerio('title').text().toLowerCase().trim();
    if (
      title == 'bot verification' ||
      title == 'just a moment...' ||
      title == 'redirecting...' ||
      title == 'un instant...' ||
      title == 'you are being redirected...'
    ) {
      throw new Error('Captcha error, please open in webview.');
    }
    if (!result.ok) {
      /**
       * Check if the chapter url is wrong or the site is genuinely down
       */
      throw new Error(
        `Could not reach site (${result.status}), try to open in webview.`,
      );
    }

    /**
     * Detect if the site is a Blogspot site
     */
    let isBlogspotStr =
      loadedCheerio('meta[name="google-adsense-platform-domain"]').attr(
        'content',
      ) || loadedCheerio('meta[name="generator"]').attr('content');
    let isBlogspot = false;
    if (isBlogspotStr) {
      isBlogspot =
        isBlogspotStr.toLowerCase().includes('blogspot') ||
        isBlogspotStr.toLowerCase().includes('blogger');
    }

    /**
     * Detect if the site is a WordPress site
     */
    let isWordPressStr =
      loadedCheerio('#dcl_comments-js-extra').html() ||
      loadedCheerio('meta[name="generator"]').attr('content') ||
      loadedCheerio('footer').text()!;
    let isWordPress = false;
    if (isWordPressStr) {
      isWordPress =
        isWordPressStr.toLowerCase().includes('wordpress') ||
        isWordPressStr.includes('Site Kit by Google') ||
        loadedCheerio('.powered-by').text().toLowerCase().includes('wordpress');
    }

    /**
     * In case sites are not detected correctly
     */
    const manualWordPress = ['genesistls', 'soafp'];
    if (!isWordPress && domain.find(wp => manualWordPress.includes(wp))) {
      isWordPress = true;
    }

    /**
     * Sites that are WordPress or Blogspot but have different structure
     */
    const outliers = [
      'anotivereads',
      'asuratls',
      'fictionread',
      'helscans',
      'mirilu',
      'novelworldtranslations',
      'sacredtexttranslations',
      'stabbingwithasyringe',
      'tinytranslation',
      'zetrotranslation',
    ];
    if (domain.find(d => outliers.includes(d))) {
      isWordPress = false;
      isBlogspot = false;
    }

    /**
     * Blogspot sites:
     * - ¼-Assed
     * - AsuraTls (Outlier)
     * - FictionRead (Outlier)
     * - Novel World Translations (Outlier)
     * - SacredText TL (Outlier)
     *
     * WordPress sites:
     * - Anomlaously Creative (Outlier)
     * - Arcane Translations
     * - Blossom Translation
     * - Dumahs Translations
     * - ElloMTL
     * - Femme Fables
     * - Gem Novels
     * - Genesis Translations (Manually added)
     * - Goblinslate
     * - Hel Scans (Outlier)
     * - ippotranslations
     * - JATranslations
     * - Light Novels Translations
     * - Mirilu - Novel Reader Attempts Translating (Outlier)
     * - Neosekai Translations
     * - Shanghai Fantasy
     * - Soafp (Manually added)
     * - Stabbing with a Syringe (Outlier)
     * - StoneScape
     * - TinyTL (Outlier)
     * - Wonder Novels
     * - Yong Library
     * - Zetro Translation (Outlier)
     */
    if (!isWordPress && !isBlogspot) {
      chapterText = await this.getChapterBody(loadedCheerio, domain, url);
    } else if (isBlogspot) {
      bloatClasses = ['.button-container', '.separator'];
      bloatClasses.map(tag => loadedCheerio(tag).remove());
      chapterTitle =
        loadedCheerio('.entry-title').first().text() ||
        loadedCheerio('.post-title').first().text()!;
      chapterContent =
        loadedCheerio('.entry-content').html() ||
        loadedCheerio('.post-body').html()!;
      if (chapterTitle && chapterContent) {
        chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
      }
    } else if (isWordPress) {
      bloatClasses = [
        '.ad',
        '.author-avatar',
        '.chapter-warning',
        '.entry-meta',
        '.ezoic-ad',
        '.genesistls-watermark',
        '.mb-center',
        '.modern-footnotes-footnote__note',
        '.patreon-widget',
        '.post-cats',
        '.pre-bar',
        '.sharedaddy',
        '.sidebar',
        '.swg-button-v2-light',
        '.wp-block-buttons',
        '.wp-block-image',
        '.wp-dark-mode-switcher',
        '.wp-next-post-navi',
        '#hpk',
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
      if (chapterSubtitle) {
        chapterTitle = chapterSubtitle;
      }
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
        loadedCheerio('.post-content').html() ||
        loadedCheerio('.content').html() ||
        loadedCheerio('.page-body').html() ||
        loadedCheerio('.td-page-content').html() ||
        loadedCheerio('#content').html() ||
        loadedCheerio('article.post').html()!;
      if (chapterTitle && chapterContent) {
        chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
      }
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
    /**
     * Split searchTerm by specific special characters and find the longest split
     */
    const splits = searchTerm.split('*');
    const longestSearchTerm = splits.reduce(
      (a, b) => (a.length > b.length ? a : b),
      '',
    );
    searchTerm = longestSearchTerm.replace(/[‘’]/g, "'").replace(/\s+/g, '+');

    const url = `${this.site}series-finder/?sf=1&sh=${searchTerm}&sort=srank&order=asc&pg=${page}`;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
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
