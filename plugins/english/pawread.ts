import { CheerioAPI, load, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters, FilterTypes } from "@libs/filterInputs";

class PawRead implements Plugin.PluginBase {
    id = "pawread";
    name = "PawRead";
    version = "1.0.0";
    icon = "src/en/pawread/icon.png";
    site = "https://www.pawread.com/";

    parseNovels(loadedCheerio:CheerioAPI){
        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".list-comic").each((idx, ele) => {
            const novelName = loadedCheerio(ele).find('h3').text();
            const novelCover = loadedCheerio(ele).find('img').attr('src');
            const novelUrl = loadedCheerio(ele).find('h3 a').attr('href')?.slice(1);

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                path: novelUrl,
            };

            novels.push(novel);
        });

        return novels;
    }

    async popularNovels(
        page: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {  
        let link = `${this.site}list/`;

        const filterValues = [
            filters.status.value, 
            filters.lang.value, 
            filters.genre.value
        ];

        link += filterValues.filter(value => value !== '').join('-');
        if (filterValues.some(value => value !== ''))
            link += '/';

        if (filters.order.value)
            link += '-';
        
        link += filters.sort.value;
        link += `/?page=${page}`;

        const body = await fetchApi(link).then((r) => r.text());        

        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const result = await fetchApi(this.site + novelPath);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: loadedCheerio(".col-md-9 h1").text() || "Untitled",
            summary: loadedCheerio("#simple-des").text().trim(),
            status: loadedCheerio('h4 span').text(),
            chapters: [],
        };

        novel.cover = loadedCheerio('#tab1_board .col-md-3 div')
            .attr('style')
            ?.match(/url\((.*?)\)/i)![1];

        novel.author = loadedCheerio('.glyphicon-user:first')
            .next()
            .text()
            .replace("Author: ", "");

        novel.genres = loadedCheerio('a.btn-default')
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        const chapter: Plugin.ChapterItem[] = [];

        loadedCheerio(".col-md-10").each((idx, ele) => {
        	const releaseDate = loadedCheerio(ele).find('small').text().trim();
        	if (releaseDate === "Advanced Chapter") return;
            const chapterName = loadedCheerio(ele).find("span").text().trim();
            const chapterUrl = loadedCheerio(ele).parent().attr("onclick")?.match(/\d+/);
            if (!chapterUrl) return;

            chapter.push({
                name: chapterName,
                path: `${novelPath}${chapterUrl[0]}.html`,
                releaseTime: new Date(releaseDate).toISOString(),
            });
        });

        novel.chapters = chapter;
        return novel;
    }


    async parseChapter(chapterPath: string): Promise<string> {
        const result = await fetchApi(this.site + chapterPath);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio("#chapter_item").html() || '';

        return chapterText;
    }

    async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.site}search/?keywords=${searchTerm}&page=${page}`;

        const result = await fetchApi(searchUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }

    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

    filters = {
        status: {
            value: "",
            label: "Status",
            options: [
                { label: "All", value: "" },
                { label: "Completed", value: "wanjie" },
                { label: "Ongoing", value: "lianzai" },
                { label: "Hiatus", value: "hiatus" },       
            ],
            type: FilterTypes.Picker,
        },
        lang: {
            value: "",
            label: "Languages",
            options: [
                { label: "All", value: "" },
                { label: "Chinese", value: "chinese" },
                { label: "Korean", value: "korean" },
                { label: "Japanese", value: "japanese" },     
            ],
            type: FilterTypes.Picker,
        },
        genre: {
            value: "",
            label: "Genres",
            options: [
                { label: "All", value: "" },
                { label: "Fantasy", value: "Fantasy" },
                { label: "Action", value: "Action" },
                { label: "Xuanhuan", value: "Xuanhuan" },
                { label: "Romance", value: "Romance" },
                { label: "Comedy", value: "Comedy" },
                { label: "Mystery", value: "Mystery" },
                { label: "Mature", value: "Mature" },
                { label: "Harem", value: "Harem" },
                { label: "Wuxia", value: "Wuxia" },
                { label: "Xianxia", value: "Xianxia" },
                { label: "Tragedy", value: "Tragedy" },
                { label: "Sci-fi", value: "Scifi" },
                { label: "Historical", value: "Historical" },
                { label: "Ecchi", value: "Ecchi" },
                { label: "Adventure", value: "Adventure" },
                { label: "Adult", value: "Adult" },
                { label: "Supernatural", value: "Supernatural" },
                { label: "Psychological", value: "Psychological" },
                { label: "Drama", value: "Drama" },
                { label: "Horror", value: "Horror" },
                { label: "Josei", value: "Josei" },
                { label: "Mecha", value: "Mecha" },
                { label: "Seinen", value: "Seinen" },
                { label: "Shoujo", value: "Shoujo" },
                { label: "Shounen", value: "Shounen" },
                { label: "Smut", value: "Smut" },
                { label: "Yaoi", value: "Yaoi" },
                { label: "Yuri", value: "Yuri" },
                { label: "Martial Arts", value: "MartialArts" },
                { label: "School Life", value: "SchoolLife" },
                { label: "Shoujo Ai", value: "ShoujoAi" },
                { label: "Shounen Ai", value: "ShounenAi" },
                { label: "Slice of Life", value: "SliceofLife" },
                { label: "Gender Bender", value: "GenderBender" },
                { label: "Sports", value: "Sports" },
                { label: "Urban", value: "Urban" },
                { label: "Adventurer", value: "Adventurer" }
            ],
            type: FilterTypes.Picker,
        },
        sort: {
            value: "click",
            label: "Sort By",
            options: [
                { label: "Time Updated", value: "update" },
                { label: "Time Posted", value: "post" },
                { label: "Clicks", value: "click" },    
            ],
            type: FilterTypes.Picker,
        },
        order: {
            value: false,
            label: "Order ↑ ↓",
            type: FilterTypes.Switch,
        },
    } satisfies Filters;
}

export default new PawRead();