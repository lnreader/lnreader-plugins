import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class NovelUpdates implements Plugin.PluginBase {
  id = 'novelupdates';
  name = 'Novel Updates';
  version = '0.7.3';
  icon = 'src/en/novelupdates/icon.png';
  customCSS = 'src/en/novelupdates/customCSS.css';
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
      filters?.language.value.length ||
      filters?.novelType.value.length ||
      filters?.genres.value.include?.length ||
      filters?.genres.value.exclude?.length ||
      filters?.reading_lists.value.length ||
      filters?.storyStatus.value !== ''
    ) {
      link += 'series-finder/?sf=1';

      if (filters?.language.value.length) {
        link += '&org=' + filters.language.value.join(',');
      }

      if (filters?.novelType.value.length) {
        link += '&nt=' + filters.novelType.value.join(',');
      }

      if (filters?.genres.value.include?.length) {
        link += '&gi=' + filters.genres.value.include.join(',');
      }

      if (filters?.genres.value.exclude?.length) {
        link += '&ge=' + filters.genres.value.exclude.join(',');
      }

      if (
        filters?.genres.value.include?.length ||
        filters?.genres.value.exclude?.length
      ) {
        link += '&mgi=' + filters.genre_operator.value;
      }

      if (filters?.reading_lists.value.length) {
        link += '&hd=' + filters?.reading_lists.value.join(',');
        link += '&mRLi=' + filters?.reading_list_operator.value;
      }

      if (filters?.storyStatus.value.length) {
        link += '&ss=' + filters.storyStatus.value;
      }

      link += '&sort=' + filters?.sort.value;

      link += '&order=' + filters?.order.value;
    } else if (showLatestNovels) {
      link += 'latest-series/?st=1';
    } else {
      link += 'series-ranking/?rank=week';
    }

    link += '&pg=' + page;

    const result = await fetchApi(link);
    const body = await result.text();

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

    const nameReplacements: Record<string, string> = {
      'v': 'volume ',
      'c': ' chapter ',
      'part': 'part ',
      'ss': 'SS',
    };

    loadedCheerio('li.sp_li_chp').each((i, el) => {
      let chapterName = loadedCheerio(el).text();
      for (const name in nameReplacements) {
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
    const match = href.match(
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

    const unwanted = ['app', 'blogspot', 'casper', 'wordpress', 'www'];
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
        const titleElement_asura = loadedCheerio('.post-body div b').first();
        chapterTitle = titleElement_asura.text()!;
        titleElement_asura.remove();
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
          .each((_, ele) => {
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
      case 'genesistudio':
        const url_genesis = `${url}/__data.json?x-sveltekit-invalidated=001`;
        const json_genesis = await fetchApi(url_genesis).then(r => r.json());

        const nodes_genesis = json_genesis.nodes;
        const data_genesis = nodes_genesis
          .filter((node: { type: string }) => node.type === 'data')
          .map((node: { data: any }) => node.data)[0];
        chapterText = data_genesis[data_genesis[0].content];
        break;
      case 'helscans':
        chapterTitle = loadedCheerio('.entry-title-main').first().text()!;
        const chapterString_helscans =
          'Chapter ' + chapterTitle.split('Chapter')[1].trim();
        loadedCheerio('#readerarea.rdminimal')
          .children()
          .each((_, ele) => {
            const elementText = loadedCheerio(ele).text();
            if (elementText.includes(chapterString_helscans)) {
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
        const matchResult_kofi = loadedCheerio(
          'script:contains("shadowDom.innerHTML")',
        )
          .html()
          ?.match(/shadowDom\.innerHTML \+= '(<div.*?)';/);
        if (matchResult_kofi && matchResult_kofi[1]) {
          chapterText = matchResult_kofi[1];
        } else {
          chapterText = '';
        }
        break;
      case 'mirilu':
        bloatClasses = ['#jp-post-flair'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        const titleElement_mirilu = loadedCheerio(
          '.entry-content p strong',
        ).first();
        chapterTitle = titleElement_mirilu.text()!;
        titleElement_mirilu.remove();
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
        const json_raei = await fetchApi(link_raei).then(r => r.json());
        const titleElement_raei = `Chapter ${json_raei.currentChapter.chapTag}`;
        chapterTitle = json_raei.currentChapter.chapTitle
          ? `${titleElement_raei} - ${json_raei.currentChapter.chapTitle}`
          : titleElement_raei;
        chapterContent = [
          json_raei.currentChapter.head,
          `<br><hr><br>`,
          json_raei.currentChapter.body,
          `<br><hr><br>Translator's Note:<br>`,
          json_raei.currentChapter.note,
        ].join('');
        chapterContent = chapterContent.replace(/\n/g, '<br>');
        if (chapterTitle && chapterContent) {
          chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        }
        break;
      case 'rainofsnow':
        const displayedDiv_snow = loadedCheerio('.bb-item').filter(function () {
          return loadedCheerio(this).css('display') === 'block';
        });
        const loadedCheerioSnow = parseHTML(displayedDiv_snow.html()!);
        bloatClasses = [
          '.responsivevoice-button',
          '.zoomdesc-cont p img',
          '.zoomdesc-cont p noscript',
        ];
        bloatClasses.map(tag => loadedCheerioSnow(tag).remove());
        chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
        const titleElement_snow = loadedCheerioSnow('.scroller h2').first();
        if (titleElement_snow.length) {
          chapterTitle = titleElement_snow.text()!;
          titleElement_snow.remove();
          chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
          if (chapterTitle && chapterContent) {
            chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
          }
        } else if (chapterContent) {
          chapterText = chapterContent;
        }
        break;
      case 'readingpia':
        bloatClasses = ['.ezoic-ad', '.ezoic-adpicker-ad', '.ez-video-wrap'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterText = loadedCheerio('.chapter-body').html()!;
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
        const ageVerification_skydemon = loadedCheerio('main')
          .text()
          .toLowerCase()!;
        if (ageVerification_skydemon.includes('age verification required')) {
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
        const link_syringe = loadedCheerio('.entry-content a').attr('href')!;
        const result_syringe = await fetchApi(link_syringe);
        const body_syringe = await result_syringe.text();
        const loadedCheerio_syringe = parseHTML(body_syringe);
        bloatClasses = [
          '.has-inline-color',
          '.wp-block-buttons',
          '.wpcnt',
          '#jp-post-flair',
        ];
        bloatClasses.map(tag => loadedCheerio_syringe(tag).remove());
        chapterContent = loadedCheerio_syringe('.entry-content').html()!;
        const titleElement_syringe =
          loadedCheerio_syringe('.entry-content h3').first();
        if (titleElement_syringe.length) {
          chapterTitle = titleElement_syringe.text();
          titleElement_syringe.remove();
          chapterContent = loadedCheerio_syringe('.entry-content').html()!;
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
      case 'wetriedtls':
        const scriptContent_wetried =
          loadedCheerio('script:contains("p dir=")').html() ||
          loadedCheerio('script:contains("u003c")').html();
        if (scriptContent_wetried) {
          const jsonString_wetried = scriptContent_wetried.slice(
            scriptContent_wetried.indexOf('.push(') + '.push('.length,
            scriptContent_wetried.lastIndexOf(')'),
          );
          chapterText = JSON.parse(jsonString_wetried)[1];
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
      case 'yoru':
        const chapterId_yoru = url.split('/').pop();
        const link_yoru = `https://pxp-main-531j.onrender.com/api/v1/book_chapters/${chapterId_yoru}/content`;
        const json_yoru = await fetchApi(link_yoru).then(r => r.json());
        chapterText = await fetchApi(json_yoru).then(r => r.text());
        break;
      case 'zetrotranslation':
        bloatClasses = ['hr', 'p:contains("\u00a0")'];
        bloatClasses.map(tag => loadedCheerio(tag).remove());
        chapterContent = loadedCheerio('.text-left').html()!;
        const titleElement_zetro = loadedCheerio('.text-left h2').first();
        if (titleElement_zetro.length) {
          chapterTitle = titleElement_zetro.text()!;
          titleElement_zetro.remove();
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
    const isBlogspotStr =
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
    const isWordPressStr =
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
      const chapterSubtitle = loadedCheerio('.cat-series').first().text() || '';
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
    genre_operator: {
      label: 'Genre (And/Or)',
      value: 'and',
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
    reading_list_operator: {
      label: 'Reading List (Include/Exclude)',
      value: 'include',
      options: [
        { label: 'Include', value: 'include' },
        { label: 'Exclude', value: 'exclude' },
      ],
      type: FilterTypes.Picker,
    },
    reading_lists: {
      label: 'Reading Lists',
      value: [],
      options: [{ label: 'All Reading Lists', value: '-1' }],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelUpdates();
