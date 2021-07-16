const express = require("express");
const WPMangaStreamScraper = require("./WPMangaStreamScraper");

const router = express.Router();

const madaraSources = [
    {
        extensionId: 53,
        scraper: new WPMangaStreamScraper(
            53,
            "https://kolnovel.com/",
            "KolNovel"
        ),
    },
    {
        extensionId: 54,
        scraper: new WPMangaStreamScraper(
            54,
            "https://rewayat-ar.site/",
            "Rewayat-Ar"
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
