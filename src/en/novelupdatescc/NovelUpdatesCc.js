const express = require("express");
const NovelUpdatesCcScraper = require("./NovelUpdatesCcScraper");

const router = express.Router();

router.get("/novels/", NovelUpdatesCcScraper.novelsScraper);

router.get("/novel/:novelUrl", NovelUpdatesCcScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:chapterUrl",
    NovelUpdatesCcScraper.chapterScraper
);

router.get("/search/", NovelUpdatesCcScraper.searchScraper);

module.exports = router;
