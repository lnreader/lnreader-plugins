const express = require("express");
const MadaraScraper = require("./MadaraScraper");

const router = express.Router();

const getPath = (extensionId) => {
    const path = {
        38: { novels: "manga", novel: "manga", chapter: "manga" },
        39: { novels: "series", novel: "series", chapter: "series" },
        40: { novels: "novels", novel: "novel", chapter: "novel" },
        41: { novels: "manga", novel: "manga", chapter: "manga" },
        42: { novels: "all-novels", novel: "manga", chapter: "manga" },
        43: { novels: "series", novel: "series", chapter: "series" },
        44: { novels: "series", novel: "series", chapter: "series" },
        45: { novels: "novel", novel: "novel", chapter: "novel" },
        46: { novels: "novel", novel: "novel", chapter: "novel" },
        47: { novels: "novel-list", novel: "novel", chapter: "novel" },
    };

    return path[extensionId];
};

const madaraSources = [
    {
        extensionId: 38,
        scraper: new MadaraScraper(
            38,
            "https://skynovel.org/",
            "SkyNovel",
            getPath(38)
        ),
    },
    {
        extensionId: 39,
        scraper: new MadaraScraper(
            39,
            "https://novelcake.com/",
            "NovelCake",
            getPath(39)
        ),
    },
    {
        extensionId: 40,
        scraper: new MadaraScraper(
            40,
            "https://novelsrock.com/",
            "NovelsRock",
            getPath(40)
        ),
    },
    {
        extensionId: 41,
        scraper: new MadaraScraper(
            41,
            "https://zinnovel.com/",
            "ZinNovel",
            getPath(41)
        ),
    },
    {
        extensionId: 42,
        scraper: new MadaraScraper(
            42,
            "https://noveltranslate.com/",
            "NovelTranslate",
            getPath(42)
        ),
    },
    {
        extensionId: 43,
        scraper: new MadaraScraper(
            43,
            "https://www.lunarletters.com/",
            "LunarLetters",
            getPath(43)
        ),
    },
    {
        extensionId: 44,
        scraper: new MadaraScraper(
            44,
            "https://sleepytranslations.com/",
            "SleepyTranslations",
            getPath(44)
        ),
    },
    {
        extensionId: 45,
        scraper: new MadaraScraper(
            45,
            "https://freenovel.me/",
            "FreeNovelMe",
            getPath(45)
        ),
    },
    {
        extensionId: 46,
        scraper: new MadaraScraper(
            46,
            "https://1stkissnovel.love/",
            "1stKissNovel",
            getPath(46)
        ),
    },
    {
        extensionId: 47,
        scraper: new MadaraScraper(
            47,
            "https://daonovel.com/",
            "DaoNovel",
            getPath(47)
        ),
    },
];

madaraSources.map((source) => {
    router.get(`/${source.extensionId}/novels/`, source.scraper.novelsScraper);

    router.get(
        `/${source.extensionId}/novel/:novelUrl`,
        source.scraper.novelScraper
    );

    router.get(
        `/${source.extensionId}/novel/:novelUrl/:chapterUrl`,
        source.scraper.chapterScraper
    );

    router.get(`/${source.extensionId}/search/`, source.scraper.searchScraper);
});

module.exports = router;
