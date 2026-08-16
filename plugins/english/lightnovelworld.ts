import { fetchText, fetchApi } from '@libs/fetch';
import { load as loadCheerio } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

const STATUS_MAP: Record<string, string> = {
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
    version = "1.0.2";

    filters = {
        sort: {
            label: 'Sort By',
            value: 'rank',
            options: [
                { label: 'Rank', value: 'rank' },
                { label: 'Popular', value: 'popular' },
                { label: 'Rating', value: 'rating' },
                { label: 'Bookmarks', value: 'bookmarks' },
                { label: 'Views', value: 'views' },
                { label: 'Chapters', value: 'chapters' },
                { label: 'New', value: 'new' },
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
        status: {
            label: 'Status',
            value: [],
            options: [
                { label: 'Ongoing', value: 'ongoing' },
                { label: 'Completed', value: 'completed' },
                { label: 'Hiatus', value: 'hiatus' },
            ],
            type: FilterTypes.CheckboxGroup,
        },
        genre_logic: {
            label: 'Genre Logic',
            value: 'AND',
            options: [
                { label: 'AND', value: 'AND' },
                { label: 'OR', value: 'OR' },
            ],
            type: FilterTypes.Picker,
        },
        genres: {
            label: 'Genres',
            value: { include: [], exclude: [] },
            options: [
                { label: 'Action', value: 'Action' },
                { label: 'Adult', value: 'Adult' },
                { label: 'Adventure', value: 'Adventure' },
                { label: 'Comedy', value: 'Comedy' },
                { label: 'Drama', value: 'Drama' },
                { label: 'Eastern', value: 'Eastern' },
                { label: 'Ecchi', value: 'Ecchi' },
                { label: 'Fan-Fiction', value: 'Fan-Fiction' },
                { label: 'Fantasy', value: 'Fantasy' },
                { label: 'Game', value: 'Game' },
                { label: 'Gender-Bender', value: 'Gender-Bender' },
                { label: 'Harem', value: 'Harem' },
                { label: 'Historical', value: 'Historical' },
                { label: 'Horror', value: 'Horror' },
                { label: 'Isekai', value: 'Isekai' },
                { label: 'Josei', value: 'Josei' },
                { label: 'LGBT+', value: 'LGBT+' },
                { label: 'Magic', value: 'Magic' },
                { label: 'Magical Realism', value: 'Magical-Realism' },
                { label: 'Martial Arts', value: 'Martial-Arts' },
                { label: 'Mature', value: 'Mature' },
                { label: 'Mecha', value: 'Mecha' },
                { label: 'Mystery', value: 'Mystery' },
                { label: 'Psychological', value: 'Psychological' },
                { label: 'Romance', value: 'Romance' },
                { label: 'School-Life', value: 'School-Life' },
                { label: 'Sci-Fi', value: 'Sci-Fi' },
                { label: 'Seinen', value: 'Seinen' },
                { label: 'Shoujo', value: 'Shoujo' },
                { label: 'Shounen', value: 'Shounen' },
                { label: 'Slice of Life', value: 'Slice-of-Life' },
                { label: 'Sports', value: 'Sports' },
                { label: 'Supernatural', value: 'Supernatural' },
                { label: 'Thriller', value: 'Thriller' },
                { label: 'Tragedy', value: 'Tragedy' },
                { label: 'Wuxia', value: 'Wuxia' },
                { label: 'Xianxia', value: 'Xianxia' },
                { label: 'Xuanhuan', value: 'Xuanhuan' },
                { label: 'Yaoi', value: 'Yaoi' },
                { label: 'Yuri', value: 'Yuri' },
            ],
            type: FilterTypes.ExcludableCheckboxGroup,
        },
        tags_include: {
            label: 'Include Tags',
            value: '',
            type: FilterTypes.TextInput,
        },
        tags_exclude: {
            label: 'Exclude Tags',
            value: '',
            type: FilterTypes.TextInput,
        },
        chapter_range: {
            label: 'Chapter Count',
            value: 'all',
            options: [
                { label: 'All', value: 'all' },
                { label: '<50', value: '<50' },
                { label: '50-100', value: '50-100' },
                { label: '100-500', value: '100-500' },
                { label: '500-1000', value: '500-1000' },
                { label: '>1000', value: '>1000' },
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
        const params = new URLSearchParams();

        for (const genre of filters.genres.value.include ?? []) {
            params.append('genres_include', genre);
        }
        for (const genre of filters.genres.value.exclude ?? []) {
            params.append('genres_exclude', genre);
        }

        if (filters.genre_logic.value !== 'AND') {
            params.set('genre_logic', filters.genre_logic.value);
        }

        if (filters.tags_include.value) {
            params.set('tags_include', filters.tags_include.value);
        }
        if (filters.tags_exclude.value) {
            params.set('tags_exclude', filters.tags_exclude.value);
        }

        if (filters.chapter_range.value !== 'all') {
            params.set('chapter_range', filters.chapter_range.value);
        }

        for (const s of filters.status.value) {
            params.append('status', s);
        }

        if (showLatestNovels) {
            params.set('sort', 'new');
        } else if (filters.sort.value !== 'rank') {
            params.set('sort', filters.sort.value);
        }

        if (filters.order.value !== 'asc') {
            params.set('order', filters.order.value);
        }

        if (pageNo > 1) {
            params.set('page', pageNo.toString());
        }

        const url = `${this.site}advanced-search/?${params.toString()}`;
        const html = await fetchText(url);
        return this.parseNovelList(html);
    }

    async fetchAllChapters(slug: string): Promise<Plugin.ChapterItem[]> {
        const LIMIT = 500;
        const apiBase = `${this.site}api/novel/${slug}/chapters/?limit=${LIMIT}`;

        const firstRes = await fetchApi(`${apiBase}&offset=0`);
        if (!firstRes.ok) {
            throw new Error(
                `Failed to fetch chapters (HTTP ${firstRes.status})`,
            );
        }
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
                const res = await fetchApi(`${apiBase}&offset=${offset}`);
                if (!res.ok) {
                    throw new Error(
                        `Failed to fetch chapters page ${offset} (HTTP ${res.status})`,
                    );
                }
                const json = (await res.json()) as {
                    chapters: { number: number; title: string }[];
                };
                return json.chapters || [];
            })
        );

        const rawChapters = [
            ...(firstJson.chapters || []),
            ...remainingResults.flat(),
        ];

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

        const $cover = $('.novel-cover');
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
            chapters = await this.fetchAllChapters(slug);
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
        const url = `${this.site}${chapterPath}`;
        const res = await fetchApi(url);
        if (!res.ok) {
            throw new Error(`Could not load chapter (HTTP ${res.status})`);
        }
        const html = await res.text();
        const $ = loadCheerio(html);

        const container = $('#chapterText');
        if (!container.length) {
            throw new Error('Could not load chapter');
        }

        container
            .find('script, style, ins, iframe, .ads, .ad-container, .watermark')
            .remove();
        container.find('[style]').removeAttr('style');

        const content = container.html()?.trim() || '';
        if (!content) {
            throw new Error('Could not load chapter');
        }
        return content;
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

        $('.card-cover-link').each((_, el) => {
            const item = $(el);
            const rawPath = item.attr('href') || '';
            if (!rawPath) return;

            const rawCover = item.find('img');
            const name = rawCover.attr('alt')?.trim() || '';
            const imgEl = rawCover.attr('src') || '';

            if (name && rawPath) {
                let cleanPath = rawPath.replace(/^\//, '');
                if (!cleanPath.endsWith('/')) cleanPath += '/';
                if (seen.has(cleanPath)) return;
                seen.add(cleanPath);

                const cover = imgEl ? `${this.site}${imgEl.replace(/^\//, '')}` : '';
                novels.push({ name, cover, path: cleanPath });
            }
        });

        return novels;
    }
}

export default new LightNovelWorldPlugin();
