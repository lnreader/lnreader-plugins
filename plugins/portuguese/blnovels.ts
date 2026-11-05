import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

const SITE = 'https://blnovels.com';

// Titles used by Cloudflare/bot interstitials; seeing one of these in a
// response means we got a challenge instead of the requested page.
const CHALLENGE_TITLES = [
  'Just a moment...',
  'Attention Required! | Cloudflare',
  'Checking your browser...',
  'One moment please...',
  'Bot Verification',
  'You are being redirected...',
  'Redirecting...',
];

type FetchHtmlOptions = {
  method?: string;
  referrer?: string;
  // Treat HTTP 404 as an empty result instead of throwing: used when paging
  // past the last listing/search page (WordPress answers those with 404).
  allowNotFound?: boolean;
};

class BlNovels implements Plugin.PluginBase {
  id = 'blnovels';
  name = 'BL Novels';
  version = '1.0.0';
  icon = 'src/pt-br/blnovels/icon.png';
  site = SITE;

  // Browser-like headers — blnovels.com is fronted by Cloudflare and
  // UA-less requests from runner networks can be answered with a bot check.
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    Referer: `${SITE}/`,
  };

  private async fetchHtml(
    url: string,
    options: FetchHtmlOptions = {},
  ): Promise<string> {
    const res = await fetchApi(url, {
      headers: this.headers,
      method: options.method,
      referrer: options.referrer,
    });
    if (!res.ok) {
      if (options.allowNotFound && res.status === 404) return '';
      // Attach the status so a runner-side block (403/503) surfaces as an
      // INCONCLUSIVE site block instead of a false "no novels" result.
      throw Object.assign(
        new Error(`Could not reach site (HTTP ${res.status}) at ${url}`),
        { status: res.status },
      );
    }
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1]?.trim() || '';
    if (CHALLENGE_TITLES.includes(title)) {
      throw new Error(`Bot challenge page returned by site ("${title}")`);
    }
    return html;
  }

  // WordPress stores covers as `name-WxH.ext` thumbnails; strip the size
  // suffix to use the full-size original (all suffix-stripped URLs checked
  // live returned HTTP 200).
  private coverUrl(src?: string): string {
    if (!src) return defaultCover;
    if (!/^https?:\/\//.test(src)) return src;
    if (src === SITE) return defaultCover;
    const stripped = src.replace(/-\d+x\d+(\.\w+)$/, '$1');
    return stripped || defaultCover;
  }

  private toPath(url: string): string {
    return url.startsWith(SITE) ? url.slice(SITE.length) : url;
  }

  parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('.manga-title-badges').remove();
    $('.page-item-detail, .c-tabs-item__content').each((_, element) => {
      const link = $(element).find('.post-title a').first();
      const name =
        link.text().trim() || $(element).find('.post-title').text().trim();
      const href = link.attr('href') || '';
      if (!name || !href) return;

      const path = this.toPath(href);
      if (seen.has(path)) return;
      seen.add(path);

      const img = $(element).find('img').first();
      const cover =
        this.coverUrl(
          img.attr('data-src') ||
            img.attr('data-srcset')?.split(' ')[0] ||
            img.attr('src'),
        ) || defaultCover;

      novels.push({ name, cover, path });
    });

    return novels;
  }

  private buildListingUrl(
    pageNo: number,
    searchTerm: string,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions<Filters>,
  ): string {
    let url = `/page/${pageNo}/?s=`;
    if (searchTerm) url += encodeURIComponent(searchTerm);
    url += '&post_type=wp-manga';

    if (showLatestNovels) url += '&m_orderby=latest';

    const active: Plugin.PopularNovelsOptions<Filters>['filters'] =
      filters || this.filters;
    for (const key in active) {
      const value = active[key].value;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item) url += `&${key}=${encodeURIComponent(item)}`;
        }
      } else if (typeof value === 'boolean') {
        // The site's own advanced-search form submits "1" for the
        // "match ALL selected genres" switch.
        if (value) url += `&${key}=1`;
      } else if (value) {
        url += `&${key}=${encodeURIComponent(String(value))}`;
      }
    }
    return SITE + url;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.buildListingUrl(pageNo, '', options);
    // Page 1 failing (any status) must throw; only a genuine past-the-end
    // 404 on later pages is allowed to come back empty.
    const html = await this.fetchHtml(url, {
      allowNotFound: pageNo > 1,
    });
    if (!html) return [];
    return this.parseNovels(parseHTML(html));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.buildListingUrl(pageNo, searchTerm, {
      filters: this.filters,
    });
    const html = await this.fetchHtml(url, { allowNotFound: true });
    if (!html) return [];
    return this.parseNovels(parseHTML(html));
  }

  private parseStatus(text: string): string | undefined {
    if (!text) return undefined;
    if (/on\s*-?\s*going/i.test(text)) return NovelStatus.Ongoing;
    if (/complet/i.test(text)) return NovelStatus.Completed;
    if (/cancel/i.test(text)) return NovelStatus.Cancelled;
    if (/hold|hiatus|hiato/i.test(text)) return NovelStatus.OnHiatus;
    if (/upcoming|em breve/i.test(text)) return NovelStatus.Unknown;
    return undefined;
  }

  // Chapter dates render as e.g. `title="15 horas ago"` on the "new" tag
  // anchor (mixed Portuguese unit + English "ago"); older chapters ship an
  // empty placeholder, for which we return null rather than inventing a date.
  private parseReleaseDate(raw?: string): string | null {
    if (!raw) return null;
    const match = raw.match(/(\d+)\s*([a-záéêíóúãõç]+)/i);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let calendarUnit: string;
    if (unit.startsWith('seg') || unit.startsWith('second')) {
      calendarUnit = 'second';
    } else if (unit.startsWith('min')) {
      calendarUnit = 'minute';
    } else if (unit.startsWith('hor') || unit.startsWith('hour')) {
      calendarUnit = 'hour';
    } else if (unit.startsWith('dia') || unit.startsWith('day')) {
      calendarUnit = 'day';
    } else if (unit.startsWith('sem') || unit.startsWith('week')) {
      calendarUnit = 'week';
    } else if (
      unit.startsWith('month') ||
      unit.startsWith('me') ||
      unit.startsWith('m')
    ) {
      calendarUnit = 'month';
    } else if (unit.startsWith('an') || unit.startsWith('year')) {
      calendarUnit = 'year';
    } else {
      return null;
    }
    return dayjs()
      .subtract(amount, calendarUnit as dayjs.ManipulateType)
      .format('YYYY-MM-DD');
  }

  private parseChapters($: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const items = $('li.wp-manga-chapter');
    const total = items.length;

    items.each((index, element) => {
      const link = $(element).find('a').first();
      const href = link.attr('href') || '';
      const name = link.text().replace(/\s+/g, ' ').trim();
      if (!href || !name || href === '#') return;

      const releaseRaw =
        $(element).find('span.chapter-release-date a').attr('title') ||
        $(element).find('span.chapter-release-date').text().trim();

      chapters.push({
        name,
        path: this.toPath(href),
        releaseTime: this.parseReleaseDate(releaseRaw),
        // The site lists chapters newest first; number them from the oldest
        // chapter and reverse below so the app reads oldest first.
        chapterNumber: total - index,
      });
    });

    return chapters.reverse();
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelUrl = SITE + novelPath;
    const html = await this.fetchHtml(novelUrl);
    const $ = parseHTML(html);

    $('.manga-title-badges').remove();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.post-title h1').first().text().trim(),
      cover: this.coverUrl(
        $('.summary_image img').first().attr('data-src') ||
          $('.summary_image img').first().attr('src'),
      ),
    };

    $('.post-content_item').each((_, element) => {
      const heading = $(element).find('h5').first().text().trim();
      if (/^autor/i.test(heading)) {
        const authors = $(element)
          .find('.author-content a')
          .map((i, el) => $(el).text().trim())
          .get()
          .filter(Boolean);
        novel.author = authors.length
          ? authors.join(', ')
          : $(element).find('.summary-content').first().text().trim();
      } else if (/^g[eê]nero/i.test(heading)) {
        const genres = $(element)
          .find('.genres-content a')
          .map((i, el) => $(el).text().trim())
          .get()
          .filter(Boolean);
        if (genres.length) novel.genres = genres.join(',');
      } else if (/^status/i.test(heading)) {
        novel.status = this.parseStatus(
          $(element).find('.summary-content').first().text(),
        );
      } else if (/^artist/i.test(heading)) {
        novel.artist = $(element)
          .find('.summary-content')
          .first()
          .text()
          .trim();
      }
    });

    if (!novel.genres) {
      const genres = $('.genres-content a')
        .map((i, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
      if (genres.length) novel.genres = genres.join(',');
    }

    const rating = parseFloat(
      $('.post-rating .post-total-rating span.score').first().text().trim(),
    );
    if (!Number.isNaN(rating)) novel.rating = rating;

    const summaryContainer = $(
      'div.description-summary div.summary__content',
    ).first();
    const paragraphs = summaryContainer
      .find('p')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    novel.summary = paragraphs.length
      ? paragraphs.join('\n\n')
      : summaryContainer.text().trim() || undefined;

    // Chapter list is rendered inline server-side. If that ever stops being
    // true, fall back to Madara's ajax chapter-list endpoint (verified live:
    // POST <novel>/ajax/chapters/ returns the same <li class="wp-manga-chapter">
    // markup, unpaginated).
    let chapters = this.parseChapters($);
    if (chapters.length === 0) {
      const ajaxHtml = await this.fetchHtml(`${novelUrl}ajax/chapters/`, {
        method: 'POST',
        referrer: novelUrl,
      });
      if (ajaxHtml) chapters = this.parseChapters(parseHTML(ajaxHtml));
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(SITE + chapterPath);
    const $ = parseHTML(html);
    const content = $('.text-left').first();
    const chapterHtml = content.html()?.trim() || '';
    if (chapterHtml.length < 200) {
      throw new Error(
        `Chapter content not found or too short at ${chapterPath}`,
      );
    }
    return chapterHtml;
  }

  resolveUrl = (path: string): string => SITE + path;

  filters = {
    'genre[]': {
      type: FilterTypes.CheckboxGroup,
      label: 'Gêneros',
      value: [] as string[],
      options: [
        { label: 'Abuso', value: 'abuso' },
        { label: 'Ação', value: 'acao' },
        { label: 'Anti-herói', value: 'anti-heroi' },
        { label: 'Aventura', value: 'aventura' },
        { label: 'BG', value: 'bg' },
        { label: 'BL', value: 'bl' },
        { label: 'Boyslove', value: 'boyslove' },
        { label: 'Comédia', value: 'comedia' },
        { label: 'Crime', value: 'crime' },
        { label: 'Cultivo', value: 'cultivo' },
        { label: 'Danmei', value: 'danmei' },
        { label: 'Delulu', value: 'delulu' },
        { label: 'Detetive', value: 'detetive' },
        { label: 'Drama', value: 'drama' },
        { label: 'Escolar', value: 'escolar' },
        { label: 'Español', value: 'espanol' },
        { label: 'Fantasia', value: 'fantasia' },
        { label: 'Ficção Científica', value: 'ficcao-cientifica' },
        { label: 'Girls Love', value: 'girls-love' },
        { label: 'GL', value: 'gl' },
        { label: 'Guideverse', value: 'guideverse' },
        { label: 'Hardcore', value: 'hardcore' },
        { label: 'Histórico', value: 'historico' },
        { label: 'Horror', value: 'horror' },
        { label: 'Incesto', value: 'incesto' },
        { label: 'Interestelar', value: 'interestelar' },
        { label: 'Máfia', value: 'mafia' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mistério', value: 'misterio' },
        { label: 'Moderno', value: 'moderno' },
        { label: 'Mpreg', value: 'mpreg' },
        { label: 'Obsessivo', value: 'obsessivo' },
        { label: 'Omegaverse', value: 'omegaverse' },
        { label: 'Policial', value: 'policial' },
        { label: 'Português', value: 'portugues' },
        { label: 'Prostituição', value: 'prostituicao' },
        { label: 'Psicológico', value: 'psicologico' },
        { label: 'Renascimento', value: 'renascimento' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen-ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sobrenatural', value: 'sobrenatural' },
        { label: 'Submissão', value: 'submissao' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Suspense', value: 'suspense' },
        { label: 'Terror', value: 'terror' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragédia', value: 'tragedia' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Transmigração', value: 'transmigracao' },
        { label: 'Vingança', value: 'vinganca' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yakuza', value: 'yakuza' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
    },
    op: {
      type: FilterTypes.Switch,
      label: 'E (tendo todos os gêneros selecionados)',
      value: false,
    },
    author: {
      type: FilterTypes.TextInput,
      label: 'Autor',
      value: '',
    },
    artist: {
      type: FilterTypes.TextInput,
      label: 'Artista',
      value: '',
    },
    release: {
      type: FilterTypes.TextInput,
      label: 'Ano de Lançado',
      value: '',
    },
    adult: {
      type: FilterTypes.Picker,
      label: 'Conteúdo adulto',
      value: '',
      options: [
        { label: 'Tudo', value: '' },
        { label: 'Nenhum conteúdo adulto', value: '0' },
        { label: 'APENAS CONTEÚDO ADULTO', value: '1' },
      ],
    },
    'status[]': {
      type: FilterTypes.CheckboxGroup,
      label: 'Status',
      value: [] as string[],
      options: [
        { label: 'OnGoing', value: 'on-going' },
        { label: 'Completed', value: 'end' },
        { label: 'Canceled', value: 'canceled' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Upcoming', value: 'upcoming' },
      ],
    },
    m_orderby: {
      type: FilterTypes.Picker,
      label: 'Ordem',
      value: '',
      options: [
        { label: 'Relevância', value: '' },
        { label: 'Mais recentes', value: 'latest' },
        { label: 'A-Z', value: 'alphabet' },
        { label: 'Votos', value: 'rating' },
        { label: 'Tendências', value: 'trending' },
        { label: 'Mais Vistas', value: 'views' },
        { label: 'Novo', value: 'new-manga' },
      ],
    },
  } satisfies Filters;
}

export default new BlNovels();
