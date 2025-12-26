import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';

class NovelUpdates implements Plugin.PluginBase {
  id = 'novelupdates';
  name = 'Novel Updates';
  version = '0.9.5';
  icon = 'src/en/novelupdates/icon.png';
  customCSS = 'src/en/novelupdates/customCSS.css';
  site = 'https://www.novelupdates.com/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];
    loadedCheerio('div.search_main_box_nu').each((_, el) => {
      const novelUrl = loadedCheerio(el).find('.search_title > a').attr('href');
      if (!novelUrl) return;
      novels.push({
        name: loadedCheerio(el).find('.search_title > a').text(),
        cover: loadedCheerio(el).find('img').attr('src'),
        path: novelUrl.replace(this.site, ''),
      });
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
    let url = this.site;

    // Build the URL based on filters
    if (showLatestNovels) {
      url += 'series-finder/?sf=1&sort=sdate&order=desc';
    } else if (
      filters?.sort.value === 'popmonth' ||
      filters?.sort.value === 'popular'
    ) {
      url += 'series-ranking/?rank=' + filters.sort.value;
    } else {
      url += 'series-finder/?sf=1';
      if (
        filters?.genres.value.include?.length ||
        filters?.genres.value.exclude?.length
      ) {
        url += '&mgi=' + filters.genre_operator.value;
      }
      if (filters?.novelType.value.length) {
        url += '&nt=' + filters.novelType.value.join(',');
      }
      if (filters?.reading_lists.value.length) {
        url += '&hd=' + filters?.reading_lists.value.join(',');
        url += '&mRLi=' + filters?.reading_list_operator.value;
      }
      url += '&sort=' + filters?.sort.value;
      url += '&order=' + filters?.order.value;
    }

    // Add common filters
    if (filters?.language.value.length)
      url += '&org=' + filters.language.value.join(',');
    if (filters?.genres.value.include?.length)
      url += '&gi=' + filters.genres.value.include.join(',');
    if (filters?.genres.value.exclude?.length)
      url += '&ge=' + filters.genres.value.exclude.join(',');
    if (filters?.storyStatus.value) url += '&ss=' + filters.storyStatus.value;

    url += '&pg=' + page;

    const response = await fetchApi(url);
    const body = await response.text();
    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const response = await fetchApi(url);
    const body = await response.text();
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.seriestitlenu').text() || 'Untitled',
      cover: loadedCheerio('.wpb_wrapper img').attr('src'),
      chapters: [],
    };
    novel.author = loadedCheerio('#authtag')
      .map((_, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(', ');
    novel.genres = loadedCheerio('#seriesgenre')
      .children('a')
      .map((_, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');
    novel.status = loadedCheerio('#editstatus').text().includes('Ongoing')
      ? 'Ongoing'
      : 'Completed';

    const type = loadedCheerio('#showtype').text().trim();
    const summary = loadedCheerio('#editdescription').text().trim();
    novel.summary = summary + `\n\nType: ${type}`;
    const rating = loadedCheerio('.seriesother .uvotes')
      .text()
      .match(/(\d+\.\d+) \/ \d+\.\d+/)?.[1];
    if (rating) {
      novel.rating = parseFloat(rating);
    }

    const novelId = loadedCheerio('input#mypostid').attr('value')!;
    const formData = new FormData();
    formData.append('action', 'nd_getchapters');
    formData.append('mygrr', '0');
    formData.append('mypostid', novelId);

    const chaptersHtml = await fetchApi(`${this.site}wp-admin/admin-ajax.php`, {
      method: 'POST',
      body: formData,
    }).then(data => data.text());

    const chaptersCheerio = parseHTML(chaptersHtml);
    const chapters: Plugin.ChapterItem[] = [];

    chaptersCheerio('li.sp_li_chp').each((_, el) => {
      const chapterName = chaptersCheerio(el)
        .text()
        .replace('v', 'volume ')
        .replace('c', ' chapter ')
        .replace('part', 'part ')
        .replace('ss', 'SS')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();

      const chapterPath =
        'https:' + chaptersCheerio(el).find('a').first().next().attr('href');

      if (chapterPath)
        chapters.push({
          name: chapterName,
          path: chapterPath.replace(this.site, ''),
        });
    });

    novel.chapters = chapters.reverse();
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
    chapterPath: string,
  ) {
    let bloatElements = [];
    let chapterTitle = '';
    let chapterContent = '';
    let chapterText = '';

    const unwanted = ['app', 'blogspot', 'casper', 'wordpress', 'www'];
    const targetDomain = domain.find(d => !unwanted.includes(d));

    switch (targetDomain) {
      // Last edited in 0.9.4 by Batorian - 15/10/2025
      case 'akutranslations': {
        try {
          const apiUrl = chapterPath.replace('/novel', '/api/novel');
          const response = await fetchApi(apiUrl);
          const json = await response.json();

          if (!json?.content) {
            throw new Error('Invalid API response structure.');
          }

          chapterContent = json.content
            .trim()
            .split(/\n+/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0)
            .map((p: string) => `<p>${p}</p>`)
            .join('\n');
          break;
        } catch (error) {
          throw new Error(`Failed to parse AkuTranslations chapter: ${error}`);
        }
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'asuratls': {
        const titleElement = loadedCheerio('.post-body div b').first();
        chapterTitle = titleElement.text();
        titleElement.remove();
        chapterContent = loadedCheerio('.post-body').html()!;
        break;
      }
      // Last edited in 0.9.2 by Batorian - 08/09/2025
      case 'brightnovels': {
        // Modular extraction inspired by W2e
        const extractBrightNovelsContent = (cheerioInstance: CheerioAPI) => {
          // Remove ad-related bloat elements
          const bloatElements = ['.ad-container', 'script', 'style'];
          bloatElements.forEach(tag => cheerioInstance(tag).remove());

          // Extract the data-page attribute from <div id="app">
          const dataPage = cheerioInstance('#app').attr('data-page');
          if (!dataPage) {
            throw new Error('data-page attribute not found on Bright Novels.');
          }

          // Parse the JSON from data-page
          let pageData;
          try {
            pageData = JSON.parse(dataPage) as {
              component: string;
              props: {
                chapter: {
                  id: number;
                  title: string;
                  content: string;
                };
              };
            };
          } catch (e) {
            throw new Error(
              'Failed to parse data-page JSON for Bright Novels.',
            );
          }

          const chapterTitle = pageData.props.chapter.title;
          let chapterContent = pageData.props.chapter.content;

          // Clean up content (remove inline styles/scripts if needed)
          const chapterCheerio = parseHTML(chapterContent);
          chapterCheerio('script, style').remove();
          chapterContent = chapterCheerio.html()!;

          // Return formatted HTML
          return `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
        };

        try {
          chapterText = extractBrightNovelsContent(loadedCheerio);
        } catch (err) {
          // Fallback: try to extract whatever is in #app or body
          let fallbackContent =
            loadedCheerio('#app').html() || loadedCheerio('body').html() || '';
          // Remove scripts/styles
          const fallbackCheerio = parseHTML(fallbackContent);
          fallbackCheerio('script, style').remove();
          fallbackContent = fallbackCheerio.html()!;
          chapterText = fallbackContent;
        }
        break;
      }
      // Last edited in 0.9.2 by Batorian - 08/09/2025
      case 'canonstory': {
        try {
          const parts = chapterPath.split('/');
          if (parts.length < 7) {
            throw new Error('Invalid chapter URL structure');
          }

          const novelSlug = parts[4];
          const chapterSlug = parts[6];
          const url = `${parts[0]}//${parts[2]}/api/public/chapter-by-slug/${novelSlug}/${chapterSlug}`;

          const response = await fetchApi(url);
          const json = await response.json();
          if (!json?.data?.currentChapter) {
            throw new Error('Invalid API response structure.');
          }

          const data = json.data.currentChapter;
          const { chapterNumber, title, content } = data;

          const titleElement = `Chapter ${chapterNumber}`;
          chapterTitle = title ? `${titleElement} - ${title}` : titleElement;
          chapterContent = content.replace(/\n/g, '<br>');
          break;
        } catch (error) {
          throw new Error(`Failed to parse Canon Story chapter: ${error}`);
        }
      }
      // Last edited in 0.9.3 by Batorian - 09/09/2025
      case 'daoist': {
        chapterTitle = loadedCheerio('.chapter__title').first().text();

        // Remove locked content indicators
        loadedCheerio('span.patreon-lock-icon').remove();

        // Handle lazy-loaded images
        loadedCheerio('img[data-src]').each((_, el) => {
          const $el = loadedCheerio(el);
          const dataSrc = $el.attr('data-src');
          if (dataSrc) {
            $el.attr('src', dataSrc);
            $el.removeAttr('data-src');
          }
        });

        chapterContent = loadedCheerio('.chapter__content').html()!;
        break;
      }
      // Last edited in 0.9.5 by Batorian - 26/12/2025
      case 'dreamy-translations': {
        chapterTitle = loadedCheerio('h1 > span').first().text();
        chapterContent = loadedCheerio('.chapter-content').html()!;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'fictionread': {
        bloatElements = [
          '.content > style',
          '.highlight-ad-container',
          '.meaning',
          '.word',
        ];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.title-image span').first().text();
        loadedCheerio('.content')
          .children()
          .each((_, el) => {
            if (loadedCheerio(el).attr('id')?.includes('Chaptertitle-info')) {
              loadedCheerio(el).remove();
              return false;
            }
          });
        chapterContent = loadedCheerio('.content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'genesistudio': {
        const url = `${chapterPath}/__data.json?x-sveltekit-invalidated=001`;
        try {
          // Fetch the chapter's data in JSON format
          const json = await fetchApi(url).then(r => r.json());
          const nodes = json.nodes;
          const data = nodes
            .filter((node: { type: string }) => node.type === 'data')
            .map((node: { data: any }) => node.data)[0];
          // Look for chapter container with required fields
          const contentKey = 'content';
          const notesKey = 'notes';
          const footnotesKey = 'footnotes';
          // Iterate over each property in data to find chapter containers
          for (const key in data) {
            const mapping = data[key];
            // Check container for keys that match the required fields
            if (
              mapping &&
              typeof mapping === 'object' &&
              contentKey in mapping &&
              notesKey in mapping &&
              footnotesKey in mapping
            ) {
              // Retrieve the chapter's content, notes, and footnotes using the mapping.
              const content = data[mapping[contentKey]];
              const notes = data[mapping[notesKey]];
              const footnotes = data[mapping[footnotesKey]];
              // Combine the parts with appropriate formatting
              chapterText =
                content +
                (notes ? `<h2>Notes</h2><br>${notes}` : '') +
                (footnotes ?? '');
              break;
            }
          }
        } catch (error) {
          throw new Error(`Failed to fetch chapter data: ${error}`);
        }
        break;
      }
      // Last edited in 0.9.5 by Batorian - 26/12/2025
      case 'greenztl': {
        const chapterSlug = chapterPath.split('/').pop();
        const apiUrl = `https://greenztl.com/api/chapters/slug/${chapterSlug}`;

        try {
          const response = await fetchApi(apiUrl);
          const json = await response.json();

          const chapterName = json.data.name;
          const chapterNumber = json.data.chapterNumber;
          const chapterCheerio = parseHTML(json.data.content);

          chapterTitle = `Chapter ${chapterNumber} - ${chapterName}`;
          chapterContent = chapterCheerio.html()!;
        } catch (error) {
          throw new Error(`Failed to parse GreenzTL chapter: ${error}`);
        }
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'hiraethtranslation': {
        chapterTitle = loadedCheerio('li.active').first().text();
        chapterContent = loadedCheerio('.text-left').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'hostednovel': {
        chapterTitle = loadedCheerio('#chapter-title').first().text();
        chapterContent = loadedCheerio('#chapter-content').html()!;
        break;
      }
      // Last edited in 0.9.5 by Batorian - 26/12/2025
      case 'infinitenoveltranslations': {
        // Get the chapter link from the main page
        const url = loadedCheerio('article > p > a').first().attr('href')!;
        if (url) {
          const response = await fetchApi(url);
          const body = await response.text();
          loadedCheerio = parseHTML(body);
        }
        chapterContent = loadedCheerio('.entry-content').html()!;
        chapterTitle = loadedCheerio('.entry-title').text();
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'inoveltranslation': {
        bloatElements = ['header', 'section'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterText = loadedCheerio('.styles_content__JHK8G').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      // mii translates
      case 'isotls': {
        bloatElements = [
          'footer',
          'header',
          'nav',
          '.ezoic-ad',
          '.ezoic-adpicker-ad',
          '.ezoic-videopicker-video',
        ];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('head title').first().text();
        chapterContent = loadedCheerio('main article').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'ko-fi': {
        const matchResult = loadedCheerio(
          'script:contains("shadowDom.innerHTML")',
        )
          .html()
          ?.match(/shadowDom\.innerHTML \+= '(<div.*?)';/);
        if (matchResult && matchResult[1]) {
          chapterText = matchResult[1];
        }
        break;
      }
      // Last edited in 0.9.2 by Batorian - 08/09/2025
      case 'machineslicedbread': {
        const urlPath = chapterPath.split('/').filter(Boolean);
        const pathSegments = urlPath.slice(2);
        const pathDepth = pathSegments.length;

        let loadedCheerioSlicedBread = loadedCheerio;

        // Handle redirect pages
        if (pathDepth === 1) {
          const chapterPath = loadedCheerio('.entry-content a')
            .first()
            .attr('href');
          if (!chapterPath) {
            throw new Error('Chapter path not found.');
          }

          const response = await fetchApi(chapterPath);
          if (!response.ok) {
            throw new Error(`Failed to fetch chapter: ${response.status}`);
          }

          const body = await response.text();
          loadedCheerioSlicedBread = parseHTML(body);
        }

        // Extract chapter content
        chapterText = loadedCheerioSlicedBread('.entry-content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'mirilu': {
        bloatElements = ['#jp-post-flair'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        const titleElement = loadedCheerio('.entry-content p strong').first();
        chapterTitle = titleElement.text();
        titleElement.remove();
        chapterContent = loadedCheerio('.entry-content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'novelplex': {
        bloatElements = ['.passingthrough_adreminder'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.halChap--jud').first().text();
        chapterContent = loadedCheerio('.halChap--kontenInner ').html()!;
        break;
      }
      case 'novelshub': {
        const segments = chapterPath.split('/');
        const novelSlug = segments[segments.length - 2];
        const chapterSlug = segments[segments.length - 1];
        const apiUrl = `https://api.novelshub.org/api/chapter?mangaslug=${novelSlug}&chapterslug=${chapterSlug}`;

        try {
          const response = await fetchApi(apiUrl);
          const json = await response.json();

          const chapterNumber = json.chapter.number;
          const chapterCheerio = parseHTML(json.chapter.content);

          chapterTitle = `Chapter ${chapterNumber}`;
          chapterCheerio('div').each((_, element) => {
            const el = chapterCheerio(element);
            const style = el.attr('style');
            if (!style) return; // Skip elements without inline styles
            // Orange box
            if (/border:.*#ff6b00/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_box_orange');
              // Orange box title
            } else if (
              /color:.*#ff6b00.*text-transform:.*uppercase/.test(style)
            ) {
              el.removeAttr('style').addClass('novels-hub_box-title_orange');
              // Orange box text
            } else if (/color:.*white.*border-top:.*#ff6b00/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_box-text_orange');
              // Green box
            } else if (/border:.*#00ff88/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_box_green');
              // Green box title
            } else if (
              /color:.*#00ff88.*text-transform:.*uppercase/.test(style)
            ) {
              el.removeAttr('style').addClass('novels-hub_box-title_green');
              // Green comment
            } else if (/border-left:.*#00ff88/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_comment_green');
              // Blue box
            } else if (/border:.*#0066ff/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_box_blue');
              // Blue box title
            } else if (
              /color:.*#0099ff.*text-transform:.*uppercase/.test(style)
            ) {
              el.removeAttr('style').addClass('novels-hub_box-title_blue');
              // Blue box text
            } else if (/color:.*#d0d0d0/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_box-text_blue');
            }
          });
          chapterCheerio('span').each((_, element) => {
            const el = chapterCheerio(element);
            const style = el.attr('style');
            if (!style) return; // Skip elements without inline styles
            // Red text
            if (/color:.*#ff6b6b/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_text_red');
              // Blue text
            } else if (/color:.*#4d9fff/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_text_blue');
              // Purple text
            } else if (/color:.*#a78bfa/.test(style)) {
              el.removeAttr('style').addClass('novels-hub_text_purple');
            }
          });
          chapterContent = chapterCheerio.html()!;
        } catch (error) {
          throw new Error(`Failed to parse GreenzTL chapter: ${error}`);
        }
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'novelworldtranslations': {
        bloatElements = ['.separator img'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
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
        chapterTitle = loadedCheerio('.entry-title').first().text();
        chapterContent = loadedCheerio('.entry-content')
          .html()!
          .replace(/&nbsp;/g, '')
          .replace(/\n/g, '<br>');
        // Load the chapter content into Cheerio and clean up empty elements
        const chapterCheerio = parseHTML(chapterContent);
        chapterCheerio('span, p, div').each((_, el) => {
          if (chapterCheerio(el).text().trim() === '') {
            chapterCheerio(el).remove();
          }
        });
        chapterContent = chapterCheerio.html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'raeitranslations': {
        const parts = chapterPath.split('/');
        const url = `${parts[0]}//api.${parts[2]}/api/chapters/single?id=${parts[3]}&num=${parts[4]}`;
        const json = await fetchApi(url).then(r => r.json());
        const titleElement = `Chapter ${json.currentChapter.chapTag}`;
        chapterTitle = json.currentChapter.chapTitle
          ? `${titleElement} - ${json.currentChapter.chapTitle}`
          : titleElement;
        chapterContent = [
          json.novelHead,
          `<br><hr><br>`,
          json.currentChapter.body,
          `<br><hr><br>Translator's Note:<br>`,
          json.currentChapter.note,
        ].join('');
        chapterContent = chapterContent.replace(/\n/g, '<br>');
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'rainofsnow': {
        const displayedDiv = loadedCheerio('.bb-item').filter(function () {
          return loadedCheerio(this).css('display') === 'block';
        });
        const loadedCheerioSnow = parseHTML(displayedDiv.html()!);
        bloatElements = [
          '.responsivevoice-button',
          '.zoomdesc-cont p img',
          '.zoomdesc-cont p noscript',
        ];
        bloatElements.forEach(tag => loadedCheerioSnow(tag).remove());
        chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
        const titleElement = loadedCheerioSnow('.scroller h2').first();
        if (titleElement.length) {
          chapterTitle = titleElement.text();
          titleElement.remove();
          chapterContent = loadedCheerioSnow('.zoomdesc-cont').html()!;
        }
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'readingpia': {
        bloatElements = ['.ezoic-ad', '.ezoic-adpicker-ad', '.ez-video-wrap'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterText = loadedCheerio('.chapter-body').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'redoxtranslation': {
        const chapterId = chapterPath.split('/').pop();
        chapterTitle = `Chapter ${chapterId}`;
        const url = `${chapterPath.split('chapter')[0]}txt/${chapterId}.txt`;
        chapterContent = await fetchApi(url)
          .then(r => r.text())
          .then(text => {
            // Split text into sentences based on newline characters
            const sentences = text.split('\n');
            // Process each sentence individually
            const formattedSentences = sentences.map(sentence => {
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
            return formattedSentences.join('<br>');
          });
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'sacredtexttranslations': {
        bloatElements = [
          '.entry-content blockquote',
          '.entry-content div',
          '.reaction-buttons',
        ];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.entry-title').first().text();
        chapterContent = loadedCheerio('.entry-content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'scribblehub': {
        bloatElements = ['.wi_authornotes'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.chapter-title').first().text();
        chapterContent = loadedCheerio('.chp_raw').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'skydemonorder': {
        // Check for age verification
        const ageVerification = loadedCheerio('main').text().toLowerCase()!;
        if (ageVerification.includes('age verification required')) {
          throw new Error('Age verification required, please open in webview.');
        }
        chapterTitle = `${loadedCheerio('header .font-medium.text-sm').first().text().trim()}`;
        chapterContent = loadedCheerio('#chapter-body').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'stabbingwithasyringe': {
        // Get the chapter link from the main page
        const url = loadedCheerio('.entry-content a').attr('href')!;
        if (url) {
          const response = await fetchApi(url);
          const body = await response.text();
          loadedCheerio = parseHTML(body);
        }
        bloatElements = [
          '.has-inline-color',
          '.wp-block-buttons',
          '.wpcnt',
          '#jp-post-flair',
        ];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterContent = loadedCheerio('.entry-content').html()!;
        const titleElement = loadedCheerio('.entry-content h3').first();
        if (titleElement.length) {
          chapterTitle = titleElement.text();
          titleElement.remove();
          chapterContent = loadedCheerio('.entry-content').html()!;
        }
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'tinytranslation': {
        bloatElements = [
          '.content noscript',
          '.google_translate_element',
          '.navigate',
          '.post-views',
          'br',
        ];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('.title-content').first().text();
        loadedCheerio('.title-content').first().remove();
        chapterContent = loadedCheerio('.content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'tumblr': {
        chapterText = loadedCheerio('.post').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'vampiramtl': {
        // Get the chapter link from the main page
        const url = loadedCheerio('.entry-content a').attr('href')!;
        if (url) {
          const response = await fetchApi(chapterPath + url);
          const body = await response.text();
          loadedCheerio = parseHTML(body);
        }
        chapterTitle = loadedCheerio('.entry-title').first().text();
        chapterContent = loadedCheerio('.entry-content').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'wattpad': {
        chapterTitle = loadedCheerio('.h2').first().text();
        chapterContent = loadedCheerio('.part-content pre').html()!;
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'webnovel': {
        chapterTitle = loadedCheerio('.cha-tit .pr .dib').first().text();
        chapterContent = loadedCheerio('.cha-words').html()!;
        if (!chapterContent) {
          chapterContent = loadedCheerio('._content').html()!;
        }
        break;
      }
      case 'wetriedtls': {
        const scriptContent =
          loadedCheerio('script:contains("p dir=")').html() ||
          loadedCheerio('script:contains("u003c")').html();
        if (scriptContent) {
          const jsonString_wetried = scriptContent.slice(
            scriptContent.indexOf('.push(') + '.push('.length,
            scriptContent.lastIndexOf(')'),
          );
          chapterText = JSON.parse(jsonString_wetried)[1];
        }
        break;
      }
      // Last edited in 0.9.0 by Batorian - 19/03/2025
      case 'wuxiaworld': {
        bloatElements = ['.MuiLink-root'];
        bloatElements.forEach(tag => loadedCheerio(tag).remove());
        chapterTitle = loadedCheerio('h4 span').first().text();
        chapterContent = loadedCheerio('.chapter-content').html()!;
        break;
      }
      case 'yoru': {
        const chapterId = chapterPath.split('/').pop();
        const url = `https://pxp-main-531j.onrender.com/api/v1/book_chapters/${chapterId}/content`;
        const json = await fetchApi(url).then(r => r.json());
        chapterText = await fetchApi(json).then(r => r.text());
        break;
      }
    }
    if (!chapterText) {
      if (chapterTitle) {
        chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
      } else {
        chapterText = chapterContent;
      }
    }
    return chapterText;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let chapterText;

    const response = await fetchApi(this.site + chapterPath);
    const body = await response.text();
    const url = response.url;
    const domainParts = url.toLowerCase().split('/')[2].split('.');

    const loadedCheerio = parseHTML(body);

    // Handle CAPTCHA cases
    const blockedTitles = [
      'bot verification',
      'just a moment...',
      'redirecting...',
      'un instant...',
      'you are being redirected...',
    ];
    const title = loadedCheerio('title').text().trim().toLowerCase();
    if (blockedTitles.includes(title)) {
      throw new Error('Captcha detected, please open in webview.');
    }

    // Check if chapter url is wrong or site is down
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${response.url}: ${response.status} ${response.statusText}`,
      );
    }

    // Helper to safely check if any element matches a regex or string
    const matches = (selector: string, attr: string | null, regex: RegExp) => {
      let found = false;
      loadedCheerio(selector).each((_, el) => {
        const val = attr
          ? loadedCheerio(el).attr(attr)
          : loadedCheerio(el).html() || loadedCheerio(el).text();
        if (val && regex.test(val.toLowerCase())) {
          found = true;
          return false;
        }
      });
      return found;
    };

    // --- WordPress Detection ---
    let isWordPress = [
      // 1. Meta Generator
      matches('meta[name="generator"]', 'content', /wordpress|site kit/i),
      // 2. Resource Paths (The most reliable way)
      matches('link, script, img', 'src', /\/wp-content\/|\/wp-includes\//i),
      matches('link', 'href', /\/wp-content\/|\/wp-includes\//i),
      // 3. Header Links (REST API, RSD, etc.)
      matches('link[rel="https://api.w.org/"]', 'href', /.*/),
      matches('link[rel="EditURI"]', 'href', /xmlrpc\.php/i),
      // 4. Common Body Classes
      matches('body', 'class', /wp-admin|wp-custom-logo|logged-in/i),
      // 5. Scripts containing WP globals
      matches('script', null, /wp-embed|wp-emoji|wp-block/i),
    ].some(Boolean);

    // --- Blogspot / Blogger Detection ---
    let isBlogspot = [
      // 1. Meta Tags
      matches('meta[name="generator"]', 'content', /blogger/i),
      matches(
        'meta[name="google-adsense-platform-domain"]',
        'content',
        /blogspot/i,
      ),
      // 2. Feed links
      matches(
        'link[rel="alternate"]',
        'href',
        /blogger\.com\/feeds|blogspot\.com\/feeds/i,
      ),
      // 3. Specific Blogger CSS/Template markers
      matches(
        'link',
        'href',
        /www\.blogger\.com\/static|www\.blogger\.com\/dyn-css/i,
      ),
      // 4. Blogger Script Widget Manager
      matches(
        'script',
        null,
        /_WidgetManager\._Init|_WidgetManager\._RegisterWidget/i,
      ),
    ].some(Boolean);

    // Handle outlier sites
    const outliers = [
      'asuratls',
      'fictionread',
      'hiraethtranslation',
      'infinitenoveltranslations',
      'machineslicedbread',
      'mirilu',
      'novelworldtranslations',
      'sacredtexttranslations',
      'stabbingwithasyringe',
      'tinytranslation',
      'vampiramtl',
    ];
    if (domainParts.some(d => outliers.includes(d))) {
      isWordPress = false;
      isBlogspot = false;
    }

    // Last edited in 0.9.5 - 26/12/2025
    /**
     * Blogspot sites:
     * - ¼-Assed
     * - AsuraTls (Outlier)
     * - FictionRead (Outlier)
     * - Novel World Translations (Outlier)
     * - SacredText TL (Outlier)
     * - Toasteful
     *
     * WordPress sites:
     * - Dumah's Translations
     * - Ether Reads
     * - Femme Fables
     * - Gadgetized Panda Translation
     * - Goblinslate
     * - Hiraeth Translation (Outlier)
     * - Infinite Novel Translations (Outlier)
     * - ippotranslations
     * - JATranslations
     * - Light Novels Translations
     * - Machine Sliced Bread (Outlier)
     * - Mirilu - Novel Reader Attempts Translating (Outlier)
     * - Neosekai Translations
     * - Noice Translations
     * - Shanghai Fantasy
     * - Sleepy Translations
     * - Soafp
     * - Stabbing with a Syringe (Outlier)
     * - StoneScape
     * - TinyTL (Outlier)
     * - VampiraMTL (Outlier)
     * - Wonder Novels
     * - Yong Library
     * - Zetro Translation
     */

    // Define Platform Configurations
    const PLATFORM_CONFIG = {
      wordpress: {
        bloat: [
          '.ad',
          '.author-avatar',
          '.chapter-warning',
          '.entry-meta',
          '.ezoic-ad',
          '.mb-center',
          '.modern-footnotes-footnote__note',
          '.patreon-widget',
          '.post-cats',
          '.pre-bar',
          '.sharedaddy',
          '.sidebar',
          '.swg-button-v2-light',
          '.wp-block-buttons',
          '.wp-dark-mode-switcher',
          '.wp-next-post-navi',
          '#hpk',
          '#jp-post-flair',
          '#textbox',
        ],
        title: [
          '.entry-title',
          '.chapter__title',
          '.title-content',
          '.wp-block-post-title',
          '.title_story',
          '#chapter-heading',
          '.chapter-title',
          'head title',
          'h1:first-of-type',
          'h2:first-of-type',
          '.active',
        ],
        content: [
          '.chapter__content',
          '.entry-content',
          '.text_story',
          '.post-content',
          '.contenta',
          '.single_post',
          '.main-content',
          '.reader-content',
          '#content',
          '#the-content',
          'article.post',
          '.chp_raw',
        ],
      },
      blogspot: {
        bloat: ['.button-container', '.ChapterNav', '.ch-bottom', '.separator'],
        title: ['.entry-title', '.post-title', 'head title'],
        content: ['.content-post', '.entry-content', '.post-body'],
      },
    };

    // Extraction Logic
    if (!isWordPress && !isBlogspot) {
      chapterText = await this.getChapterBody(loadedCheerio, domainParts, url);
    } else {
      const config = isWordPress
        ? PLATFORM_CONFIG.wordpress
        : PLATFORM_CONFIG.blogspot;

      // Remove platform-specific bloat
      config.bloat.forEach(tag => loadedCheerio(tag).remove());

      // Extract Title (Simplified find)
      let chapterTitle = config.title
        .map(sel => loadedCheerio(sel).first().text().trim())
        .find(text => text.length > 0);

      // Handle Subtitles
      const chapterSubtitle =
        loadedCheerio('.cat-series').first().text() ||
        loadedCheerio('h1.leading-none ~ span').first().text() ||
        loadedCheerio('.breadcrumb .active').first().text();

      if (chapterSubtitle) chapterTitle = chapterSubtitle;

      // Extract Content (Scoped search)
      const chapterContent = config.content
        .map(sel => {
          const el = loadedCheerio(sel).first();
          // Ensure we don't pick up empty containers
          return el.text().trim().length > 50 ? el.html() : null;
        })
        .find(html => html);

      // Construct Final Text
      if (chapterTitle && chapterContent) {
        chapterText = `<h2>${chapterTitle}</h2><hr><br>${chapterContent}`;
      } else {
        chapterText = chapterContent || '';
      }
    }

    // Fallback content extraction
    if (!chapterText) {
      ['nav', 'header', 'footer', '.hidden'].forEach(tag =>
        loadedCheerio(tag).remove(),
      );
      chapterText = loadedCheerio('body').html()!;
    }

    // Convert relative URLs to absolute
    chapterText = chapterText.replace(
      /href="\//g,
      `href="${this.getLocation(response.url)}/`,
    );

    // Process images
    const chapterCheerio = parseHTML(chapterText);
    chapterCheerio('noscript').remove();

    chapterCheerio('img').each((_, el) => {
      const $el = chapterCheerio(el);

      // Only update if the lazy-loaded attribute exists
      if ($el.attr('data-lazy-src')) {
        $el.attr('src', $el.attr('data-lazy-src'));
      }
      if ($el.attr('data-lazy-srcset')) {
        $el.attr('srcset', $el.attr('data-lazy-srcset'));
      }

      // Remove lazy-loading class if it exists
      if ($el.hasClass('lazyloaded')) {
        $el.removeClass('lazyloaded');
      }
    });

    return chapterCheerio.html()!;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    // Split searchTerm by specific special characters and find the longest split
    const splits = searchTerm.split('*');
    const longestSearchTerm = splits.reduce(
      (a, b) => (a.length > b.length ? a : b),
      '',
    );
    searchTerm = longestSearchTerm.replace(/[‘’]/g, "'").replace(/\s+/g, '+');

    const url = `${this.site}series-finder/?sf=1&sh=${searchTerm}&sort=srank&order=asc&pg=${page}`;
    const response = await fetchApi(url);
    const body = await response.text();

    const loadedCheerio = parseHTML(body);

    return this.parseNovels(loadedCheerio);
  }

  filters = {
    sort: {
      label: 'Sort Results By',
      value: 'popmonth',
      options: [
        { label: 'Popular (Month)', value: 'popmonth' },
        { label: 'Popular (All)', value: 'popular' },
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
      label: 'Order (Not for Popular)',
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
    genre_operator: {
      label: 'Genre (And/Or) (Not for Popular)',
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
      label: 'Novel Type (Not for Popular)',
      value: [],
      options: [
        { label: 'Light Novel', value: '2443' },
        { label: 'Published Novel', value: '26874' },
        { label: 'Web Novel', value: '2444' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    reading_list_operator: {
      label: 'Reading List (Include/Exclude) (Not for Popular)',
      value: 'include',
      options: [
        { label: 'Include', value: 'include' },
        { label: 'Exclude', value: 'exclude' },
      ],
      type: FilterTypes.Picker,
    },
    reading_lists: {
      label: 'Reading Lists (Not for Popular)',
      value: [],
      options: [{ label: 'All Reading Lists', value: '-1' }],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelUpdates();
