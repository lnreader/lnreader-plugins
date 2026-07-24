import { fetchText, fetchApi } from '@libs/fetch';
import { load as loadCheerio } from 'cheerio';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';

const STATUS_MAP: Record<string, NovelStatus> = {
    'ongoing': NovelStatus.Ongoing,
    'completed': NovelStatus.Completed,
    'complete': NovelStatus.Completed,
    'hiatus': NovelStatus.OnHiatus,
    'paused': NovelStatus.OnHiatus,
};

type SearchResult = {
    title?: string;
    cover_path?: string;
    slug?: string;
};

export class LightNovelWorldPlugin implements Plugin.PluginBase {
    id = "lightnovelworld";
    name = "LightNovelWorld";
    icon = "src/en/lightnovelworld/icon.png";
    site = "https://lightnovelworld.org/";
    version = "1.1.4";

    async popularNovels(
        pageNo: number,
        options?: Plugin.PopularNovelsOptions
    ): Promise<Plugin.NovelItem[]> {
        const order = options?.showLatestNovels ? 'updates' : 'popular';
        const url = `${this.site}advanced-search/?order=${order}&page=${pageNo}`;
        const html = await fetchText(url);
        return this.parseNovelList(html);
    }

    async fetchAllChapters(slug: string): Promise<Plugin.ChapterItem[]> {
        const LIMIT = 500;
        const apiBase = `${this.site}api/novel/${slug}/chapters/?limit=${LIMIT}`;

        const firstRes = await fetchApi(`${apiBase}&offset=0`);
        const firstJson = (await firstRes.json()) as {
            chapters: { number: number; title: string }[];
            total_chapters: number;
        };

        const total = firstJson.total_chapters;
        const offsets: number[] = [];
        for (let offset = LIMIT; offset < total; offset += LIMIT) {
            offsets.push(offset);
        }

        const remainingResults = await Promise.all(
            offsets.map(async (offset) => {
                try {
                    const res = await fetchApi(`${apiBase}&offset=${offset}`);
                    const json = (await res.json()) as { chapters: { number: number; title: string }[] };
                    return json.chapters || [];
                } catch {
                    return [];
                }
            })
        );

        const rawChapters = [...(firstJson.chapters || []), ...remainingResults.flat()];

        return rawChapters
            .map((ch) => ({
                name: (ch.title || `Chapter ${ch.number}`).trim(),
                path: `novel/${slug}/chapter/${ch.number}/`,
                chapterNumber: ch.number,
            }))
            .sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const html = await fetchText(`${this.site}${novelPath}`);
        const $ = loadCheerio(html);

        const title = $('.novel-title').text().trim() || 'Untitled Novel';

        const $cover = $('.novel-cover img');
        const rawCover = $cover.attr('src') || '';
        const cover = rawCover ? `${this.site}${rawCover.replace(/^\//, '')}` : '';

        const summary = $('.summary-content').text().trim();
        const author = $('.author-link').text().trim() || 'Unknown Author';

        const rawStatus = $('.status-badge').text().trim().toLowerCase();
        const status = STATUS_MAP[rawStatus] || NovelStatus.Unknown;

        const genres = $('.genre-tag').map((_, el) => $(el).text().trim()).get().join(', ');

        const slug = novelPath.replace(/^\/?novel\/|\/$/g, '');
        let chapters: Plugin.ChapterItem[] = [];

        if (slug) {
            try {
                chapters = await this.fetchAllChapters(slug);
            } catch {
                chapters = [];
            }
        }

        return {
            path: novelPath,
            name: title,
            cover,
            summary,
            author,
            status,
            genres,
            chapters,
        };
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const html = await fetchText(`${this.site}${chapterPath}`);
        const $ = loadCheerio(html);

        const container = $('#chapterText');
        if (!container.length) {
            return '<p>No content found.</p>';
        }

        container.find('script, style, ins, iframe, .ads, .ad-container, .watermark').remove();
        container.find('[style]').removeAttr('style');

        const content = container.html()?.trim() || '';
        return content || '<p>No content found.</p>';
    }

    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        if (!searchTerm?.trim() || pageNo > 1) return [];
        const url = `${this.site}api/search/?q=${encodeURIComponent(searchTerm)}&search_type=title`;
        try {
            const res = await fetchApi(url);
            const json = (await res.json()) as { novels?: SearchResult[] };
            if (!json?.novels || !Array.isArray(json.novels)) {
                return [];
            }
            return json.novels
                .filter((item): item is SearchResult & { title: string; slug: string } => !!item.slug && !!item.title)
                .map((item) => {
                    const rawCover = item.cover_path || '';
                    const cover = rawCover ? `${this.site}${rawCover.replace(/^\//, '')}` : '';
                    return {
                        name: item.title,
                        cover,
                        path: `novel/${item.slug}/`,
                    };
                });
        } catch {
            return [];
        }
    }

    parseNovelList(html: string): Plugin.NovelItem[] {
        const $ = loadCheerio(html);
        const novels: Plugin.NovelItem[] = [];
        const seen = new Set<string>();

        $('.novel-item').each((_, el) => {
            const item = $(el);
            const linkEl = item.find("a[href*='/novel/']");
            const rawPath = linkEl.attr('href') || '';
            if (!rawPath) return;

            const name = linkEl.attr('title')?.trim() || '';
            const imgEl = item.find('.card-cover-link img');
            const rawCover = imgEl.attr('src') || '';

            if (name && rawPath) {
                let cleanPath = rawPath.replace(/^\//, '');
                if (!cleanPath.endsWith('/')) cleanPath += '/';
                if (seen.has(cleanPath)) return;
                seen.add(cleanPath);

                const cover = rawCover ? `${this.site}${rawCover.replace(/^\//, '')}` : '';
                novels.push({ name, cover, path: cleanPath });
            }
        });

        return novels;
    }
}

export default new LightNovelWorldPlugin();
