import { load } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";

class NovelDeGlacePlugin implements Plugin.PluginBase{
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    userAgent: string;
    cookieString: string;
    constructor() {
        this.id = "NDG.com";
        this.name = "NovelDeGlace";
        this.icon = "src/fr/noveldeglace/icon.png";
        this.site = "https://noveldeglace.com/";
        this.version = "1.0.0";
        this.userAgent = "''";
        this.cookieString = "''";
    }

    async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
        let url = this.site + "roman";
        const result = await fetchApi(url, {headers: { 'Accept-Encoding': 'deflate' },});
        const body = await result.text();
        let loadedCheerio = load(body);
    
        let novels: Plugin.NovelItem[] = [];
    
        loadedCheerio("article").each(function () {
            const novelName = loadedCheerio(this).find("h2").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
    
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
    
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
            const url = novelUrl;
            const result = await fetchApi(url, {headers: { 'Accept-Encoding': 'deflate' }});
            const body = await result.text();
    
            let loadedCheerio = load(body);
    
            let novel: Plugin.SourceNovel = { url };
    
            novel.name = (loadedCheerio("div.entry-content > div > strong"
            )[0].nextSibling as Text | null)?.nodeValue?.trim() || '';  
    
            novel.cover = loadedCheerio(".su-row > div > div > img").attr("src");
    
            novel.summary = loadedCheerio("div[data-title=Synopsis]").text();
    
            novel.author = loadedCheerio("strong:contains('Auteur :')"
            ).parent().text().replace("Auteur : ", "").trim();
    
            // novel.artist = loadedCheerio("strong:contains('Illustrateur :')"
            // ).parent().text().replace("Illustrateur : ", "").trim();
    
            const categorie = loadedCheerio(".categorie")
                .text()
                .replace("Catégorie :", "")
                .trim();
            const genres = loadedCheerio(".genre")
                .text()
                .replace("Genre :", "")
                .replace(/, /g, ",")
                .trim();
            if (categorie && categorie != "Autre")
                novel.genres = categorie;
            if (genres)
                novel.genres = novel.genres ? novel.genres + "," + genres : genres;
    
            let status = loadedCheerio("strong:contains('Statut :')"
            ).parent().attr("class");
            switch (status) {
                case "type etat0":
                    novel.status = NovelStatus.Ongoing;
                    break;
                case "type etat1":
                    novel.status = NovelStatus.Ongoing;
                    break;
                case "type etat4":
                    novel.status = NovelStatus.OnHiatus;
                    break;
                case "type etat5":
                    novel.status = NovelStatus.Completed;
                    break;
                case "type etat6":
                    novel.status = NovelStatus.Cancelled;
                    break;
                default:
                    novel.status = NovelStatus.Unknown;
                    break;
            }
    
            let novelChapters: Plugin.ChapterItem[] = [];
    
            loadedCheerio(".chpt").each(function () {
                const chapterName = loadedCheerio(this).find("a").text().trim();
                const releaseDate = null;
                const chapterUrl = loadedCheerio(this).find("a").attr("href");
    
                if (!chapterUrl) return;
    
                const chapter = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };
    
                novelChapters.push(chapter);
            });
    
            novel.chapters = novelChapters;
    
            return novel;
        };
    
    async parseChapter(chapterUrl: string): Promise<string> {
        const url = chapterUrl;
        const result = await fetchApi(url, {headers: { 'Accept-Encoding': 'deflate' }});
        const body = await result.text();
    
        let loadedCheerio = load(body);
    
        loadedCheerio(".mistape_caption").remove();
        let chapterText = loadedCheerio(".chapter-content").html() || "Chapitre introuvable";
        return chapterText;
    };
    
    async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
        let url = this.site + "roman";
        const result = await fetchApi(url, {headers: { 'Accept-Encoding': 'deflate' }});
        const body = await result.text();
    
        let loadedCheerio = load(body);
    
        let novels: Plugin.NovelItem[] = [];
    
        loadedCheerio("article").each(function () {
            const novelName = loadedCheerio(this).find("h2").text().trim();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h2 > a").attr("href");
    
            if (!novelUrl) return;
    
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
    
            novels.push(novel);
        });
    
        novels = novels.filter((novel) =>
            novel.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    
        return novels;
    };
    async fetchImage(url: string): Promise<string | undefined>{
        return await fetchFile(url);
    }
}

export default new NovelDeGlacePlugin();