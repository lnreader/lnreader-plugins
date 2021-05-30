const express = require("express");
const WuxiaWorldCloudScraper = require("./WuxiaWorldCloudScraper");

const router = express.Router();

router.get("/novels/", WuxiaWorldCloudScraper.novelsScraper);

router.get("/novel/:novelUrl", WuxiaWorldCloudScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:chapterUrl",
    WuxiaWorldCloudScraper.chapterScraper
);

router.get("/search/", WuxiaWorldCloudScraper.searchScraper);

module.exports = router;
