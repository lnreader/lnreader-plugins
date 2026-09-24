import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

// ======================================================================
// Plugin ID   : kolnovel
// Site        : https://kolnovel.com  (WordPress / Madara theme)
// Language    : Arabic
// Selectors verified against real HTML samples on 2026-07-18
// ======================================================================

const SITE = 'https://kolnovel.com';

function abs(path: string): string {
  return path.startsWith('http') ? path : SITE + path;
}

class KolNovelPlugin implements Plugin.PluginBase {
  id = 'kolnovel';
  name = 'ملوك الروايات (KolNovel)';
  icon = 'src/ar/kolnovel/icon.png';
  site = SITE;
  version = '1.0.0';

  filters = {
    status: {
      label: 'الحالة',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'الكل', value: '' },
        { label: 'مستمرة', value: 'ongoing' },
        { label: 'مكتملة', value: 'completed' },
        { label: 'متوقفة', value: 'hiatus' },
      ],
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const basePath = showLatestNovels
      ? '/series/?status=&type=&order=update'
      : '/series/';

    const statusParam =
      !showLatestNovels && filters?.status?.value
        ? `?status=${filters.status.value}&order=`
        : '';

    const path = showLatestNovels ? basePath : basePath + statusParam;
    const sep = path.includes('?') ? '&' : '?';
    const url = abs(path) + sep + `page=${pageNo}`;

    const html = await fetchApi(url).then(r => r.text());
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    $('article.maindet').each((_, el) => {
      const linkEl = $(el).find('h2[itemprop="headline"] a').first();
      const novelPath = linkEl.attr('href');
      const name = linkEl.text().trim();
      const cover =
        $(el).find('.mdthumb img').attr('data-src') ||
        $(el).find('.mdthumb img').attr('src');

      if (novelPath && name) {
        novels.push({
          name,
          path: novelPath.replace(SITE, ''),
          cover: cover || defaultCover,
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await fetchApi(abs(novelPath)).then(r => r.text());
    const $ = loadCheerio(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1.entry-title').first().text().trim() || 'بدون عنوان',
    };

    novel.cover =
      $('.sertothumb img').attr('data-src') ||
      $('.sertothumb img').attr('src') ||
      defaultCover;

    // Summary: only <p> tags to avoid donation/chat widgets embedded in description
    novel.summary = $('.sersys.entry-content > p')
      .map((_, p) => $(p).text().trim())
      .get()
      .filter(Boolean)
      .join('\n\n');

    novel.genres = $('.sertogenre a')
      .map((_, g) => $(g).text().trim())
      .get()
      .join(', ');

    // Status: the class name itself is the English status (Hiatus/Ongoing/Completed)
    const statusClass =
      $('.sertostat span').first().attr('class')?.trim() ?? '';
    novel.status =
      (
        {
          Completed: NovelStatus.Completed,
          Ongoing: NovelStatus.Ongoing,
          Hiatus: NovelStatus.OnHiatus,
        } as Record<string, string>
      )[statusClass] ?? NovelStatus.Unknown;

    // Author / Translator from .sertoauth .serl rows
    $('.sertoauth .serl').each((_, row) => {
      const label = $(row).find('.sername').first().text().trim();
      const value = $(row).find('.serval').first().text().trim();
      if (label.includes('الكاتب')) novel.author = value;
      if (label.includes('المترجم')) novel.artist = value;
    });

    // Chapters: each <li> inside .bxcl.epcheck contains <a> with .epl-num / .epl-title / .epl-date
    const chapters: Plugin.ChapterItem[] = [];
    $('.bxcl.epcheck .eplister li a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const numText = $(el).find('.epl-num').first().text().trim();
      const titleText = $(el).find('.epl-title').first().text().trim();
      const dateText = $(el).find('.epl-date').first().text().trim();

      // Extract chapter number after keyword "الفصل", fallback to last number in text
      const afterKeyword = numText.match(/الفصل\s*([\d]+(?:\.[\d]+)?)/);
      const anyNumber = numText.match(/([\d]+(?:\.[\d]+)?)\s*$/);
      const chapterNumber = afterKeyword
        ? parseFloat(afterKeyword[1])
        : anyNumber
          ? parseFloat(anyNumber[1])
          : i + 1;

      chapters.push({
        name:
          titleText && titleText !== String(chapterNumber)
            ? `${numText} — ${titleText}`
            : numText,
        path: href.replace(SITE, ''),
        chapterNumber,
        releaseTime: dateText,
      });
    });

    // DOM order is newest-first; reverse to get chronological order
    novel.chapters = chapters.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchApi(abs(chapterPath)).then(r => r.text());
    const $ = loadCheerio(html);

    // Remove noise elements
    $('script, style, .ads, .code-block').remove();

    const container = $('#kol_content, .epcontent.entry-content').first();

    // Strip copy-protection attributes (onmousedown / onselectstart / oncopy)
    // present on #kol_content so they don't interfere with in-app reader
    container
      .find('*')
      .addBack()
      .each((_, el) => {
        $(el)
          .removeAttr('onmousedown')
          .removeAttr('onselectstart')
          .removeAttr('oncopy');
      });

    return container.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      abs('/?s=' + encodeURIComponent(searchTerm)) + `&page=${pageNo}`;
    const html = await fetchApi(url).then(r => r.text());
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    $('article.maindet').each((_, el) => {
      const linkEl = $(el).find('h2[itemprop="headline"] a').first();
      const novelPath = linkEl.attr('href');
      const name = linkEl.text().trim();
      const cover =
        $(el).find('.mdthumb img').attr('data-src') ||
        $(el).find('.mdthumb img').attr('src');

      if (novelPath && name) {
        novels.push({
          name,
          path: novelPath.replace(SITE, ''),
          cover: cover || defaultCover,
        });
      }
    });

    return novels;
  }

  resolveUrl = (path: string) => abs(path);
}

export default new KolNovelPlugin();
