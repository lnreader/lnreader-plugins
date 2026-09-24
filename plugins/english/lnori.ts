import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

class LnorisPlugin implements Plugin.PluginBase {
  id = 'lnori';
  name = 'LNORI';
  icon = 'src/en/lnori/icon.png';
  site = 'https://lnori.com/';
  version = '1.0.1';

  private async getLibraryNovels(): Promise<
    {
      novel: Plugin.NovelItem;
      author: string;
      tags: string[];
    }[]
  > {
    const url = this.site + 'library';
    const body = await fetchText(url);
    const $ = parseHTML(body);

    const parsedList: {
      novel: Plugin.NovelItem;
      author: string;
      tags: string[];
    }[] = [];

    $('article.card').each((i, el) => {
      const name = $(el).attr('data-t') || '';
      const author = $(el).attr('data-a') || '';
      const tagsAttr = $(el).attr('data-tags') || '';
      const tags = tagsAttr.split(',').map(t => t.trim().toLowerCase());

      const coverImg = $(el).find('.card-cover img').first();
      let cover = coverImg.attr('src') || '';
      if (cover && cover.startsWith('/')) {
        cover = this.site + cover.substring(1);
      }

      const link = $(el).find('a.stretched-link').first();
      let path = link.attr('href') || '';
      if (path.startsWith('/')) {
        path = path.substring(1);
      }

      if (path && name) {
        parsedList.push({
          novel: {
            name,
            path,
            cover: cover || defaultCover,
          },
          author,
          tags,
        });
      }
    });

    return parsedList;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const parsedList = await this.getLibraryNovels();

    let filteredList = parsedList;
    const selectedGenre = filters?.genre?.value;
    if (selectedGenre) {
      filteredList = filteredList.filter(item =>
        item.tags.includes(selectedGenre.toLowerCase()),
      );
    }

    const selectedSort = filters?.sort?.value;
    if (selectedSort === 'title-az') {
      filteredList.sort((a, b) => a.novel.name.localeCompare(b.novel.name));
    } else if (selectedSort === 'title-za') {
      filteredList.sort((a, b) => b.novel.name.localeCompare(a.novel.name));
    }

    const pageSize = 36;
    const offset = (pageNo - 1) * pageSize;
    return filteredList
      .slice(offset, offset + pageSize)
      .map(item => item.novel);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const body = await fetchText(url);
    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.hero-card h1.s-title').text().trim() || 'Untitled',
    };

    const coverUrl = $('.hero-card .cover-wrap img').attr('src');
    if (coverUrl) {
      novel.cover = coverUrl.startsWith('/')
        ? this.site + coverUrl.substring(1)
        : coverUrl;
    } else {
      novel.cover = defaultCover;
    }

    const dataTagsAttr = $('nav.tags-box.desktop').attr('data-tags');
    if (dataTagsAttr) {
      try {
        const parsedTags = JSON.parse(dataTagsAttr);
        novel.genres = parsedTags
          .map((t: { name: string }) => t.name)
          .join(', ');
      } catch (e) {
        // Fallback
      }
    }

    if (!novel.genres) {
      const genres: string[] = [];
      $('nav.tags-box.desktop a, nav.tags-box a').each((i, el) => {
        const text = $(el).text().trim();
        if (text) genres.push(text);
      });
      novel.genres = genres.join(', ');
    }

    const summaryParagraphs: string[] = [];
    $('section.desc-box p.description').each((i, el) => {
      const text = $(el).text().trim();
      if (text) summaryParagraphs.push(text);
    });
    novel.summary = summaryParagraphs.join('\n\n');

    novel.author = $('.hero-card p.author').text().trim();

    // Map unique volume URLs
    const volumeMap: Record<string, string> = {};
    $('a[href^="/book/"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (href) {
        if (
          !volumeMap[href] ||
          (text && text.length > volumeMap[href].length)
        ) {
          volumeMap[href] = text;
        }
      }
    });

    const getVolumeName = (href: string, text: string) => {
      let cleanText = text.replace(/Start Reading/gi, '').trim();
      if (!cleanText) {
        const parts = href.split('/');
        const slug = parts[parts.length - 1] || parts[parts.length - 2] || '';
        cleanText = slug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      return cleanText;
    };

    const volumeUrls = Object.keys(volumeMap);

    /**
     * Volume pages weigh ~0.5MB each and a long series has dozens, so
     * building the chapter list used to download and fully parse ~15MB at
     * once — about a minute of blank screen on a phone, and one failed
     * request failed the whole novel. The chapter names live in the page's
     * <nav> table of contents, which is a few KB: parse just that when it
     * can name every chapter, and fall back to the full page when it
     * cannot. Volumes are fetched a few at a time for the same reason.
     */
    const parseVolume = (
      volUrl: string,
      volHtml: string,
      isTocOnly: boolean,
    ): Plugin.ChapterItem[] | null => {
      const $vol = parseHTML(volHtml);

      const volChapters: Plugin.ChapterItem[] = [];
      const tocLinks = $vol(
        'nav.toc-view a[href^="#"], nav#toc-list a[href^="#"]',
      );

      if (tocLinks.length > 0) {
        let needFullPage = false;
        tocLinks.each((i, el) => {
          const href = $vol(el).attr('href');
          if (!href) return;
          const id = href.substring(1);
          const tocTitle = $vol(el).text().trim().replace(/\s+/g, ' ');

          // A nameless TOC entry falls back to the chapter's own heading,
          // which only the full page has.
          if (isTocOnly && !tocTitle) {
            needFullPage = true;
            return false;
          }

          const section = $vol(`section#${id}`);
          const h2Title = section
            .find('h2.chapter-title, h2, h3')
            .first()
            .text()
            .trim();

          const chapterName =
            tocTitle || h2Title || `Page ${id.replace(/\D/g, '')}`;

          const volTitle = getVolumeName(volUrl, volumeMap[volUrl]);
          let path = volUrl;
          if (path.startsWith('/')) {
            path = path.substring(1);
          }
          path = path + '#' + id;

          volChapters.push({
            name: `${volTitle} - ${chapterName}`,
            path,
          });
        });
        if (needFullPage) {
          return null;
        }
      } else if (isTocOnly) {
        // No anchors in the TOC — chapters can only come from the page's
        // sections.
        return null;
      } else {
        $vol('section.chapter').each((i, el) => {
          const id = $vol(el).attr('id');
          if (id) {
            const h2Title = $vol(el)
              .find('h2.chapter-title, h2, h3')
              .first()
              .text()
              .trim();

            if (!h2Title) return;

            const volTitle = getVolumeName(volUrl, volumeMap[volUrl]);
            let path = volUrl;
            if (path.startsWith('/')) {
              path = path.substring(1);
            }
            path = path + '#' + id;

            volChapters.push({
              name: `${volTitle} - ${h2Title}`,
              path,
            });
          }
        });
      }
      return volChapters;
    };

    const sliceToc = (html: string): string | undefined => {
      const start = html.search(
        /<nav[^>]*(?:class="[^"]*\btoc-view\b|id="toc-list")/,
      );
      if (start === -1) return undefined;
      const end = html.indexOf('</nav>', start);
      if (end === -1) return undefined;
      return html.slice(start, end + '</nav>'.length);
    };

    const CONCURRENT_VOLUMES = 4;
    const chapters2D: Plugin.ChapterItem[][] = [];
    for (let i = 0; i < volumeUrls.length; i += CONCURRENT_VOLUMES) {
      const batch = volumeUrls.slice(i, i + CONCURRENT_VOLUMES);
      const results = await Promise.all(
        batch.map(async volUrl => {
          const fullVolUrl = this.site.replace(/\/$/, '') + volUrl;
          const volHtml = await fetchText(fullVolUrl);

          const toc = sliceToc(volHtml);
          if (toc) {
            const fromToc = parseVolume(volUrl, toc, true);
            if (fromToc) {
              return fromToc;
            }
          }
          return parseVolume(volUrl, volHtml, false) ?? [];
        }),
      );
      chapters2D.push(...results);
    }

    const chapters = chapters2D.flat();

    novel.chapters = chapters.map((chap, idx) => ({
      ...chap,
      chapterNumber: idx + 1,
    }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [pathWithoutAnchor, anchor] = chapterPath.split('#');
    const url = this.site.replace(/\/$/, '') + '/' + pathWithoutAnchor;

    const body = await fetchText(url);
    const $ = parseHTML(body);

    const tocAnchors: string[] = [];
    $('nav.toc-view a[href^="#"], nav#toc-list a[href^="#"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        tocAnchors.push(href.substring(1));
      }
    });

    const chapterSelector = anchor ? `section#${anchor}` : 'section.chapter';
    const section = $(chapterSelector);

    if (!section.length) {
      throw new Error(`Chapter section not found: ${chapterPath}`);
    }

    if (tocAnchors.length > 0 && anchor) {
      const currentIndex = tocAnchors.indexOf(anchor);
      const nextAnchor =
        currentIndex !== -1 && currentIndex + 1 < tocAnchors.length
          ? tocAnchors[currentIndex + 1]
          : null;

      const pagesContent: string[] = [];
      let stepSection = section;

      while (stepSection.length) {
        const mainContent = stepSection.find('.main').length
          ? stepSection.find('.main').clone()
          : stepSection.clone();

        mainContent.find('h2, h3, .chapter-title').remove();

        mainContent.find('img').each((i, el) => {
          const src = $(el).attr('src');
          if (src && src.startsWith('/')) {
            $(el).attr('src', this.site.replace(/\/$/, '') + src);
          }
        });

        mainContent.find('source').each((i, el) => {
          const srcset = $(el).attr('srcset');
          if (srcset && srcset.startsWith('/')) {
            $(el).attr('srcset', this.site.replace(/\/$/, '') + srcset);
          }
        });

        const html = mainContent.html();
        if (html) {
          pagesContent.push(html);
        }

        let nextSibling = stepSection.next();
        while (nextSibling.length && !nextSibling.is('section.chapter')) {
          nextSibling = nextSibling.next();
        }
        stepSection = nextSibling;

        if (nextAnchor && stepSection.attr('id') === nextAnchor) {
          break;
        }
      }

      return pagesContent.join('\n');
    } else {
      const mainContent = section.find('.main').length
        ? section.find('.main').clone()
        : section.clone();

      mainContent.find('h2, h3, .chapter-title').remove();

      mainContent.find('img').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('/')) {
          $(el).attr('src', this.site.replace(/\/$/, '') + src);
        }
      });

      mainContent.find('source').each((i, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset && srcset.startsWith('/')) {
          $(el).attr('srcset', this.site.replace(/\/$/, '') + srcset);
        }
      });

      return mainContent.html() || '';
    }
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const parsedList = await this.getLibraryNovels();

    const term = searchTerm.toLowerCase();
    const filteredList = parsedList.filter(item => {
      return (
        item.novel.name.toLowerCase().includes(term) ||
        item.author.toLowerCase().includes(term) ||
        item.tags.some(t => t.includes(term))
      );
    });

    const pageSize = 36;
    const offset = (pageNo - 1) * pageSize;
    return filteredList
      .slice(offset, offset + pageSize)
      .map(item => item.novel);
  }

  // resolveUrl = (path: string, _isNovel?: boolean) => {
  //   return new URL(path, this.site).href;
  // };

  filters = {
    sort: {
      label: 'Sort By',
      value: 'popular',
      options: [
        { label: 'Popular (Default)', value: 'popular' },
        { label: 'Title A-Z', value: 'title-az' },
        { label: 'Title Z-A', value: 'title-za' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Genre',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Academy', value: 'academy' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Magic', value: 'magic' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Female Protagonist', value: 'female protagonist' },
        { label: 'Male Protagonist', value: 'male protagonist' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LnorisPlugin();
