import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

const SITE = 'https://markazriwayat.com/';

const getCheerio = async (url: string, search = false): Promise<CheerioAPI> => {
  const r = await fetchApi(url);
  if (!r.ok && !search)
    throw new Error(
      'Could not reach site (' + r.status + ') try to open in webview.',
    );
  return parseHTML(await r.text());
};

class Markazriwayat implements Plugin.PluginBase {
  id = 'markazriwayat';
  name = 'Markazriwayat';
  version = '3.0.0';
  icon = 'src/ar/markazriwayat/icon.png';
  site = SITE;

  filters = {
    status: {
      label: 'الحالة',
      value: '',
      options: [
        { label: 'الكل', value: '' },
        { label: 'مستمرة', value: 'is-ongoing' },
        { label: 'مكتملة', value: 'is-complete' },
        { label: 'متوقفة', value: 'is-stopped' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      label: 'الترتيب',
      value: '',
      options: [
        { label: 'الأكثر شعبية', value: '' },
        { label: 'الأحدث', value: 'new' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = SITE + 'popular/';
    if (showLatestNovels || filters.sort.value === 'new') {
      url = SITE + 'new/';
    }
    if (pageNo > 1) url += 'page/' + pageNo + '/';

    const $ = await getCheerio(url, pageNo !== 1);
    const novels: Plugin.NovelItem[] = [];

    $('a.lib-card, a.novel-card').each((_, el) => {
      const card = $(el);
      const name = card.find('.lib-card__title, .novel-card__title').text().trim();
      const href = card.attr('href') || '';
      const img = card.find('img');
      const cover = img.attr('data-src') || img.attr('src') || defaultCover;
      const statusEl = card.find('.status-pill');
      const statusClass = statusEl.attr('class') || '';

      if (filters.status.value && !statusClass.includes(filters.status.value))
        return;

      if (!name || !href) return;

      novels.push({
        name,
        cover,
        path: href.replace(SITE, ''),
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await getCheerio(SITE + novelPath, false);

    const name =
      $('h1.manga-title').text().trim() ||
      $('h1').first().text().trim() ||
      '';

    const coverImg = $(
      '.manga-cover-wrap img, .summary_image > a > img',
    ).first();
    const cover =
      coverImg.attr('data-src') ||
      coverImg.attr('src') ||
      defaultCover;

    const author =
      $('.manga-author a.manga-author__link').text().trim() ||
      $('.manga-author').text().replace(/مترجم الرواية\s*:\s*/, '').trim() ||
      '';

    let status: string | undefined;
    const statusEl = $('.manga-status-pill, .status-pill');
    const statusClass = statusEl.attr('class') || '';
    if (statusClass.includes('is-ongoing')) status = NovelStatus.Ongoing;
    else if (statusClass.includes('is-complete')) status = NovelStatus.Completed;
    else if (statusClass.includes('is-stopped')) status = NovelStatus.OnHiatus;

    const summary = $('#manga-summary, .manga-summary').text().trim() || '';

    const genres = $('a[href*="/genre/"], a[href*="/tag/"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(', ');

    const chapters: Plugin.ChapterItem[] = [];

    const parseChaptersFromHtml = (cheerio: CheerioAPI) => {
      cheerio('.ch-row').each((index, element) => {
        const row = cheerio(element);
        const a = row.find('a').first();
        const chapterUrl = a.attr('href') || '';
        if (!chapterUrl) return;

        const chNum = parseInt(row.attr('data-ch-num') || '0', 10);
        const chTitle = row.find('.ch-title').text().trim();
        const chDate = row.find('.ch-date').text().trim();

        let releaseTime: string | null = chDate || null;
        if (releaseTime && /^\d{4}\/\d{2}\/\d{2}$/.test(releaseTime)) {
          releaseTime = releaseTime.replace(/\//g, '-');
        }

        chapters.push({
          name: chTitle || `الفصل ${chNum}`,
          path: chapterUrl.replace(SITE, ''),
          chapterNumber: chNum || index + 1,
          releaseTime,
        });
      });
    };

    parseChaptersFromHtml($);

    if (chapters.length === 0) {
      try {
        const ajaxUrl = SITE + novelPath + 'ajax/chapters/';
        const res = await fetchApi(ajaxUrl, {
          method: 'POST',
          referrer: SITE + novelPath,
        });
        if (res.ok) {
          const html = await res.text();
          if (html && html !== '0') {
            const $ajax = parseHTML(html);
            parseChaptersFromHtml($ajax);

            $ajax('.wp-manga-chapter').each((index, element) => {
              const el = $ajax(element);
              const a = el.find('a').first();
              const chapterUrl = a.attr('href') || '';
              if (!chapterUrl) return;

              const chapterName = a.text().trim();
              const releaseDate = el
                .find('span.chapter-release-date')
                .text()
                .trim();

              chapters.push({
                name: chapterName,
                path: chapterUrl.replace(SITE, ''),
                chapterNumber: chapters.length + 1,
                releaseTime: releaseDate || null,
              });
            });
          }
        }
      } catch {
        // AJAX chapter loading failed
      }
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name,
      cover,
      author,
      genres,
      summary,
      status,
      chapters,
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await getCheerio(SITE + chapterPath, false);

    const chapterText =
      $('.reading-content .text-right').html() ||
      $('.reading-content').html() ||
      $('.text-left').html() ||
      $('.text-right').html() ||
      $('.entry-content').html() ||
      '';

    if (chapterText) {
      const $content = parseHTML(chapterText);
      $content(
        'script, noscript, .theam-chobf, span[data-theam-chobf]',
      ).remove();
      $content('p:empty').remove();
      return $content.html() || '';
    }

    return '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo?: number,
  ): Promise<Plugin.NovelItem[]> {
    pageNo = pageNo || 1;

    try {
      const url =
        SITE +
        'wp-json/wp/v2/wp-manga?search=' +
        encodeURIComponent(searchTerm) +
        '&page=' +
        pageNo +
        '&per_page=20';
      const res = await fetchApi(url);
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0) {
          return data.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item: any) => ({
            name: item.title?.rendered || item.title || '',
            path: (item.link || '').replace(SITE, ''),
            cover: defaultCover,
          }));
        }
      }
    } catch {
      // WP REST API search failed
    }

    try {
      const $ = await getCheerio(
        SITE + '?s=' + encodeURIComponent(searchTerm) + '&post_type=wp-manga',
        true,
      );

      const novels: Plugin.NovelItem[] = [];

      $('a.lib-card, a.novel-card, .page-item-detail').each((_, el) => {
        const card = $(el);
        const name =
          card.find('.lib-card__title, .novel-card__title, .post-title').text().trim();
        const href = card.attr('href') || '';
        const img = card.find('img');
        const cover =
          img.attr('data-src') || img.attr('src') || defaultCover;

        if (!name || !href) return;

        novels.push({
          name,
          cover,
          path: href.replace(SITE, ''),
        });
      });

      if (novels.length > 0) return novels;
    } catch {
      // Search page scraping failed
    }

    try {
      const $ = await getCheerio(SITE + 'library/', true);

      const allItems = $('a.lib-card, a.novel-card');
      const term = searchTerm.toLowerCase();
      const novels: Plugin.NovelItem[] = [];

      allItems.each((_, el) => {
        const card = $(el);
        const name = card.find('.lib-card__title, .novel-card__title').text().trim();
        const href = card.attr('href') || '';
        const img = card.find('img');
        const cover = img.attr('data-src') || img.attr('src') || defaultCover;

        if (
          name &&
          href &&
          (name.toLowerCase().includes(term) || name.includes(searchTerm))
        ) {
          novels.push({
            name,
            cover,
            path: href.replace(SITE, ''),
          });
        }
      });

      return novels;
    } catch {
      // Library page search failed
    }

    return [];
  }
}

export default new Markazriwayat();
