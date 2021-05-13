const express = require("express");
const WuxiaWorldScraper = require("./WuxiaWorldSiteScraper");

const router = express.Router();

router.get("/novels/", WuxiaWorldSiteScraper.novelsScraper);

router.get("/novel/:novelUrl", WuxiaWorldSiteScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", WuxiaWorldSiteScraper.chapterScraper);

router.get("/search/", WuxiaWorldSiteScraper.searchScraper);

module.exports = router;
