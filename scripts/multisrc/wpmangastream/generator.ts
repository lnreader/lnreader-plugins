import { ScrpitGeneratorFunction } from "../generate";
import list from "./sources.json";

type sourceData = (typeof list)[number];

export const generateAll: ScrpitGeneratorFunction = function () {
    return list.map((source) => {
        return generator(source);
    });
};

const generator = function generator(sourceJson: sourceData) {
    const pluginId = sourceJson.id;
    const sourceName = sourceJson.sourceName;
    const site = sourceJson.sourceSite;
	const reverseChapters = sourceJson.reverseChapters;
    const iconFileName = sourceName.split('.')[0].toLowerCase() + '.png';
    const pluginScript = `
import { CheerioAPI, load } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";

class LightNovelFRPlugin implements Plugin.PluginBase {
	id: string;
	name: string;
	icon: string;
	site: string;
	version: string;
	userAgent: string;
	cookieString: string;
	constructor() {
		this.id = "${pluginId}";
		this.name = "${sourceName}[wpmangastream]";
		this.icon = "multisrc/wpmangastream/icons/${pluginId}.png";
		this.site = "${site}";
		this.version = "1.0.0";
		this.userAgent = "''";
		this.cookieString = "''";
	}

	async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
		let url = this.site + 'series/?page=' + page + '&status=&order=popular';
		const body = await(await fetchApi(url, {})).text();
		const loadedCheerio = load(body);

		let novels: Plugin.NovelItem[] = [];

		loadedCheerio('article.maindet').each(function () {
			const novelName = loadedCheerio(this).find('h2').text();
			let image = loadedCheerio(this).find('img');
			const novelCover = image.attr('data-src') || image.attr('src');
			const novelUrl = loadedCheerio(this).find('h2 a').attr('href');

			if (!novelUrl) return;

			const novel = {
				name: novelName,
				cover: novelCover,
				url: novelUrl,
			};

			novels.push(novel);
		});

		return novels;
	}

	async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
		const url = novelUrl;
		const body = await(await fetchApi(url, {})).text();
		let loadedCheerio = load(body);

		const novel: Plugin.SourceNovel = { url };

		// novel.url = url;
		novel.name = loadedCheerio('h1.entry-title').text();
		novel.cover =
		loadedCheerio('img.wp-post-image').attr('data-src') ||
		loadedCheerio('img.wp-post-image').attr('src');
		novel.status = loadedCheerio('div.sertostat > span').attr('class');

		loadedCheerio('div.serl > span').each(function () {
			const detailName = loadedCheerio(this).text().trim();
			const detail = loadedCheerio(this).next().text().trim();
	
			switch (detailName) {
			case 'الكاتب':
			case 'Author':
			case 'Auteur':
				novel.author = detail;
				break;
			}
		});

		novel.genres = loadedCheerio('.sertogenre')
		.children('a')
		.map((i, el) => loadedCheerio(el).text())
		.toArray()
		.join(',');

		let summary = loadedCheerio('.sersys > p').siblings().remove("div").end();
		novel.summary = ""
		for (let i = 0; i < summary.length; i++) {
			const p = summary[i];
			novel.summary += loadedCheerio(p).text().trim() + "\\n\\n";
		}

		let novelChapters:Plugin.ChapterItem[] = [];

		loadedCheerio('.eplister')
		.find('li')
		.each(function () {
			const chapterName =
			loadedCheerio(this).find('.epl-num').text() +
			' - ' +
			loadedCheerio(this).find('.epl-title').text();

			const releaseDate = loadedCheerio(this).find('.epl-date').text().trim();

			const chapterUrl = loadedCheerio(this).find('a').attr('href');

			if (!chapterUrl) return;

			const chapter = {
			name: chapterName,
			url: chapterUrl,
			releaseDate,
			};

			novelChapters.push(chapter);
		});

		novel.chapters = novelChapters;

		${reverseChapters ? "if (novel.chapters) novel.chapters.reverse()" : ""}

		return novel;
	}


	async parseChapter(chapterUrl: string): Promise<string> {
		const url = chapterUrl;
		const body = await(await fetchApi(url, {})).text();
		const loadedCheerio = load(body);

		let chapterText = loadedCheerio('.epcontent').html() || '';

		return chapterText;
	};

	async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
		const url = this.site + "?s=" + searchTerm;
		const body = await(await fetchApi(url, {})).text();
		const loadedCheerio = load(body);

		let novels: Plugin.NovelItem[] = [];

		loadedCheerio('article.maindet').each(function () {
		const novelName = loadedCheerio(this).find('h2').text();
		let image = loadedCheerio(this).find('img');
		const novelCover = image.attr('data-src') || image.attr('src');
		const novelUrl = loadedCheerio(this).find('h2 a').attr('href');

		if (!novelUrl) return;

		const novel = {
			name: novelName,
			cover: novelCover,
			url: novelUrl,
		};

		novels.push(novel);
		});

		return novels;
	};
	async fetchImage(url: string): Promise<string | undefined>{
		return await fetchFile(url);
	}
}

export default new LightNovelFRPlugin();`;
	
    return {
        lang: sourceJson.lang,
        filename: sourceName,
        pluginScript,
    };
};