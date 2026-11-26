import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

// Lorachi — юри-портал переводов. У сайта есть публичный JSON API (/api/v1),
// документация: https://lorachi.baconana.com/api-docs

interface NovelCard {
  id: string;
  title: string;
  coverUrl?: string | null;
}

interface ChapterRef {
  id: string;
  number: string;
  volume?: number;
  title?: string | null;
  isPaid?: boolean;
  url?: string;
  publishedAt?: string | null;
}

class LorachiPlugin implements Plugin.PluginBase {
  id = 'lorachi';
  name = 'Lorachi';
  icon = 'src/ru/lorachi/icon.png'; // положи свою иконку 96x96 (путь смотри у соседних плагинов)
  site = 'https://lorachi.baconana.com';
  version = '1.0.3';

  private api = `${this.site}/api/v1`;
  private headers = { Accept: 'application/json' };

  // ---------- helpers ----------

  private abs(url?: string | null): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return this.site + url;
    return url;
  }

  private async getJson(url: string): Promise<any> {
    const res = await fetchApi(url, { headers: this.headers });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        'Сайт вернул не JSON (возможно, блокировка, капча или VPN). Открой сайт в WebView.',
      );
    }
    if (!res.ok) {
      const code = json?.error?.code ? ` [${json.error.code}]` : '';
      throw new Error((json?.error?.message || `HTTP ${res.status}`) + code);
    }
    return json;
  }

  private toNovelItem(card: NovelCard): Plugin.NovelItem {
    return {
      name: card.title,
      path: `/novel/${card.id}`,
      cover: this.abs(card.coverUrl),
    };
  }

  private novelId(path: string): string {
    return path.split('?')[0].split('/').filter(Boolean).pop() as string;
  }

  private chapterId(path: string): string {
    const m = path.match(/[?&]cid=([^&]+)/);
    if (m) return m[1];
    return this.novelId(path);
  }

  private parseStatus(s?: string | null): string {
    const v = (s || '').toLowerCase();
    if (/ongoing|онгоинг|выходит|продолжа/.test(v)) return NovelStatus.Ongoing;
    if (/complet|finish|заверш|законч/.test(v)) return NovelStatus.Completed;
    if (/hiatus|pause|froz|заморож|пауз/.test(v)) return NovelStatus.OnHiatus;
    if (/cancel|drop|брош|отмен/.test(v)) return NovelStatus.Cancelled;
    if (/licens|лиценз/.test(v)) return NovelStatus.Licensed;
    return NovelStatus.Unknown;
  }

  // ---------- каталог ----------

  private async fetchCatalog(
    pageNo: number,
    params: Record<string, string>,
  ): Promise<Plugin.NovelItem[]> {
    const build = (extra: Record<string, string>) => {
      const q = new URLSearchParams({
        type: 'novel',
        page: String(pageNo),
        limit: '30',
        ...extra,
      });
      return `${this.api}/catalog?${q.toString()}`;
    };

    // значения sort известны (views, ratings.average, createdAt, title),
    // поэтому тихого повтора без сортировки больше нет: ошибки видны сразу
    const json = await this.getJson(build(params));

    const items: NovelCard[] = json?.data || [];
    return items.map(c => this.toNovelItem(c));
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // значения sort взяты с самого сайта: views, ratings.average, createdAt, title
    const params: Record<string, string> = showLatestNovels
      ? { sort: 'createdAt', order: 'desc' }
      : {
          sort: (filters?.sort?.value as string) || 'views',
          order: (filters?.order?.value as string) || 'desc',
        };

    const genre = filters?.genre?.value?.trim();
    if (genre) params.genre = genre;

    return this.fetchCatalog(pageNo, params);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (term.length < 2) return []; // API требует минимум 2 символа

    // отдельная ручка поиска: data.novels + meta (page, limit, total, hasMore)
    const limit = 30;
    const q = new URLSearchParams({
      q: term,
      type: 'novel',
      page: String(pageNo),
      limit: String(limit),
    });
    const json = await this.getJson(`${this.api}/search?${q.toString()}`);

    // если страница уже за пределами результатов — отдаём пусто, чтобы поиск не крутился вечно
    const total = json?.meta?.total;
    if (typeof total === 'number' && (pageNo - 1) * limit >= total) return [];

    const cards: NovelCard[] = json?.data?.novels || [];
    return cards.map(c => this.toNovelItem(c));
  }

  // ---------- тайтл ----------

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = this.novelId(novelPath);
    const json = await this.getJson(`${this.api}/novels/${id}`);
    const n = json.data;

    const genres: string[] = [...(n.genres || []), ...(n.tags || [])];

    const novel: Plugin.SourceNovel = {
      path: `/novel/${id}`,
      name: n.title,
      cover: this.abs(n.coverUrl),
      summary: n.description || undefined,
      author: n.author || undefined,
      artist: n.artist || undefined,
      genres: Array.from(new Set(genres)).join(', ') || undefined,
      status: this.parseStatus(n.status || n.publishStatus),
      chapters: [],
    };

    // собираем все страницы списка глав (limit до 100)
    const refs: ChapterRef[] = [];
    for (let page = 1; page <= 300; page++) {
      const res = await this.getJson(
        `${this.api}/novels/${id}/chapters?page=${page}&limit=100`,
      );
      refs.push(...((res.data as ChapterRef[]) || []));
      if (!res.meta?.hasMore) break;
    }

    // порядок в API не задокументирован — определяем и приводим к возрастающему
    const num = (c: ChapterRef) => parseFloat(c.number);
    if (refs.length > 1) {
      const a = refs[0];
      const b = refs[refs.length - 1];
      const va = a.volume ?? 0;
      const vb = b.volume ?? 0;
      const descending =
        va !== vb
          ? va > vb
          : !isNaN(num(a)) && !isNaN(num(b)) && num(a) > num(b);
      if (descending) refs.reverse();
    }

    const multiVolume = new Set(refs.map(c => c.volume ?? 1)).size > 1;

    novel.chapters = refs.map((c, i) => {
      const parsed = num(c);
      const base = c.url || `/novel/${id}/chapter/${c.number}`;
      const vol = multiVolume ? `Том ${c.volume ?? 1}. ` : '';
      const lock = c.isPaid ? '🔒 ' : '';
      return {
        name: `${lock}${vol}Глава ${c.number}${c.title ? `: ${c.title}` : ''}`,
        path: `${base}?cid=${c.id}`,
        releaseTime: c.publishedAt || undefined,
        chapterNumber: isNaN(parsed) ? i + 1 : parsed,
      };
    });

    return novel;
  }

  // ---------- глава ----------

  async parseChapter(chapterPath: string): Promise<string> {
    const id = this.chapterId(chapterPath);
    const json = await this.getJson(`${this.api}/chapters/${id}`);
    const content: string = json?.data?.content || '';

    if (!content.trim()) {
      throw new Error('Глава пуста (или это глава манги).');
    }

    // всегда проходим через экранирование: сырой HTML с сайта не возвращаем
    return this.markdownToHtml(content);
  }

  // ---------- мини-конвертер markdown -> html ----------

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // пропускаем только http(s)-ссылки, javascript: и прочее отбрасываем
  private safeUrl(url: string): string {
    const full = this.abs(url) || '';
    return /^https?:\/\//i.test(full) ? full : '#';
  }

  private inline(text: string): string {
    let t = this.escapeHtml(text);
    t = t.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g,
      (_m, alt, src) => `<img src="${this.safeUrl(src)}" alt="${alt}">`,
    );
    t = t.replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label, href) => `<a href="${this.safeUrl(href)}">${label}</a>`,
    );
    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');
    t = t.replace(
      /(^|[^*])\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g,
      '$1<em>$2</em>',
    );
    t = t.replace(/~~(.+?)~~/g, '<s>$1</s>');
    return t;
  }

  private markdownToHtml(md: string): string {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let para: string[] = [];

    const flush = () => {
      if (para.length) {
        out.push('<p>' + para.map(l => this.inline(l)).join('<br>') + '</p>');
        para = [];
      }
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        flush();
        continue;
      }
      if (/^([*_-])(\s*\1){2,}$/.test(line)) {
        flush();
        out.push('<hr>');
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flush();
        out.push(`<h${h[1].length}>${this.inline(h[2])}</h${h[1].length}>`);
        continue;
      }
      const q = line.match(/^>\s?(.*)$/);
      if (q) {
        flush();
        out.push(`<blockquote>${this.inline(q[1])}</blockquote>`);
        continue;
      }
      para.push(line);
    }
    flush();
    return out.join('\n');
  }

  // ---------- фильтры ----------

  filters = {
    sort: {
      label: 'Сортировка',
      value: 'views',
      options: [
        { label: 'По просмотрам', value: 'views' },
        { label: 'По рейтингу', value: 'ratings.average' },
        { label: 'По дате', value: 'createdAt' },
        { label: 'По названию', value: 'title' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      label: 'Порядок',
      value: 'desc',
      options: [
        { label: 'По убыванию', value: 'desc' },
        { label: 'По возрастанию', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Жанр (как на сайте, например «Юри»)',
      value: '',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new LorachiPlugin();
