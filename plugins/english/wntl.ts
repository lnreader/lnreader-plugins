import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

const SITE = 'https://wntl.net';
const API = `${SITE}/api`;

const endpoints = {
  novels: () => `${API}/novels`,
  views: (ids: string[]) => `${API}/views?novelIds=${ids.join(',')}`,
  chapters: (id: string) => `${API}/chapters/${id}`,
  chapter: (id: string, file: string) => `${API}/chapter-content/${id}/${file}`,
};

type APINovel = {
  id: string;
  title: string;
  author?: string;
  cover?: string;
  description?: string;
  genre?: string[];
  views?: string;
  rating?: number;
  'alternate-title'?: string[];
  status?: string[];
  chapterCount?: number;
  schedule?: string[];
  latestChapter?: ChapterRef;
  recentChapters?: ChapterRef[];
};

type ChapterRef = {
  number?: number;
  publishedAt?: string;
  status?: string;
};

type APIChapter = {
  id: string;
  number: number;
  title: string;
  date: string;
  publishedAt: string;
  file: string;
  status: string;
};

const absolute = (url?: string) => {
  if (!url) return defaultCover;
  return url.startsWith('http') ? url : `${SITE}/${url.replace(/^\/+/, '')}`;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inline = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');

function markdownToHtml(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return '<hr>';
      return `<p>${inline(line)}</p>`;
    })
    .join('\n');
}

function parseViews(json: any): Record<string, number> {
  const out: Record<string, number> = {};
  const src = json?.views ?? json?.data ?? json;
  const countOf = (e: any) => Number(e?.viewCount ?? e?.views ?? e?.count) || 0;
  if (Array.isArray(src)) {
    for (const e of src) {
      const id = e?.novelId ?? e?.id ?? e?.novel_id;
      if (id != null) out[String(id)] = countOf(e);
    }
  } else if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      out[k] =
        v !== null && typeof v === 'object' ? countOf(v) : Number(v) || 0;
    }
  }
  return out;
}

function lastUpdated(n: APINovel): number {
  const now = Date.now();
  let newest = 0;
  for (const c of [n.latestChapter, ...(n.recentChapters || [])]) {
    if (!c || (c.status && c.status !== 'published')) continue;
    const t = Date.parse(c.publishedAt || '');
    if (!isNaN(t) && t <= now && t > newest) newest = t;
  }
  return newest;
}

function mapStatus(status?: string[]): string {
  const s = (status || []).join(' ').toLowerCase();
  if (s.includes('ongoing')) return NovelStatus.Ongoing;
  if (s.includes('complete')) return NovelStatus.Completed;
  if (s.includes('hiatus')) return NovelStatus.OnHiatus;
  return NovelStatus.Unknown;
}

class WNTLPlugin implements Plugin.PluginBase {
  id = 'WebNovelTraslation';
  name = 'Web Novel Translation';
  icon = 'src/en/webnoveltraslation/icon.png';
  site = 'https://wntl.net/';
  version = '2.3.0';

  private static readonly PAGE_SIZE = 20;
  private cache: { time: number; novels: APINovel[] } | null = null;

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status}). Try WebView.`);
    }
    return res.json();
  }

  // The whole catalogue comes back in one request, so cache it briefly.
  private async getAll(): Promise<APINovel[]> {
    if (this.cache && Date.now() - this.cache.time < 60_000) {
      return this.cache.novels;
    }
    const json = await this.getJson<{ novels: APINovel[] }>(endpoints.novels());
    const novels = json.novels || [];
    this.cache = { time: Date.now(), novels };
    return novels;
  }

  private toItem(n: APINovel): Plugin.NovelItem {
    return { name: n.title, path: n.id, cover: absolute(n.cover) };
  }

  private viewsCache: { time: number; views: Record<string, number> } | null =
    null;

  // we fetch views to later use it to sort for popularity.
  private async getViews(ids: string[]): Promise<Record<string, number>> {
    if (this.viewsCache && Date.now() - this.viewsCache.time < 5 * 60_000) {
      return this.viewsCache.views;
    }
    const views: Record<string, number> = {};
    try {
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += 20)
        batches.push(ids.slice(i, i + 20));
      const results = await Promise.all(
        batches.map(b =>
          fetchApi(endpoints.views(b)).then(r => (r.ok ? r.json() : {})),
        ),
      );
      results.forEach(r => Object.assign(views, parseViews(r)));
    } catch {}
    if (Object.keys(views).length) {
      this.viewsCache = { time: Date.now(), views };
    }
    return views;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions = {} as any,
  ): Promise<Plugin.NovelItem[]> {
    let all = (await this.getAll()).filter(n => n.id && n.title);

    if (showLatestNovels) {
      all = [...all].sort((a, b) => lastUpdated(b) - lastUpdated(a));
    } else {
      const views = await this.getViews(all.map(n => n.id));

      const score = (n: APINovel) => views[n.id] ?? (Number(n.views) || 0);
      // Array.sort is stable, so ties keep the API order.
      all = [...all].sort((a, b) => score(b) - score(a));
    }

    const start = (pageNo - 1) * WNTLPlugin.PAGE_SIZE;
    return all
      .slice(start, start + WNTLPlugin.PAGE_SIZE)
      .map(n => this.toItem(n));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const q = searchTerm.toLowerCase();
    const all = await this.getAll();
    return all
      .filter(
        n =>
          n.id &&
          n.title &&
          (n.title.toLowerCase().includes(q) ||
            (n['alternate-title'] || []).some(t =>
              t.toLowerCase().includes(q),
            )),
      )
      .map(n => this.toItem(n));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [all, chapterRes] = await Promise.all([
      this.getAll(),
      this.getJson<{ chapters: APIChapter[] }>(endpoints.chapters(novelPath)),
    ]);

    const n = all.find(x => x.id === novelPath);
    if (!n) {
      throw new Error('Novel not found. It may have been removed.');
    }

    const alt = (n['alternate-title'] || []).filter(Boolean);
    const summary =
      (n.description || '').trim() +
      (alt.length ? `\n\nAlternative titles: ${alt.join(', ')}` : '');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: n.title,
      cover: absolute(n.cover),
      author: n.author || '',
      summary,
      genres: (n.genre || []).join(', '),
      status: mapStatus(n.status),
    };

    novel.chapters = (chapterRes.chapters || [])
      .filter(c => c.status === 'published')
      .map(c => ({
        name: c.title,
        path: `${novelPath}/${c.file}`,
        releaseTime: c.publishedAt,
        chapterNumber: c.number,
      }))
      .sort((a, b) => a.chapterNumber! - b.chapterNumber!);

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [id, file] = chapterPath.split('/');
    const res = await fetchApi(endpoints.chapter(id, file));
    if (!res.ok) throw new Error(`Chapter fetch failed (${res.status})`);
    return markdownToHtml(await res.text());
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    const [id, file] = path.split('/');
    if (isNovel || !file) return `${SITE}/series/${id}`;
    return `${SITE}/read/${id}/${file.replace(/\.md$/, '')}`;
  }
}

export default new WNTLPlugin();
