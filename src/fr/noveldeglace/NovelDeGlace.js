const express = require("express");
const NovelDeGlaceScraper = require("./NovelDeGlaceScraper");

const router = express.Router();

router.get("/novels/", NovelDeGlaceScraper.novelsScraper);

router.get("/novel/:novelUrl", NovelDeGlaceScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", NovelDeGlaceScraper.chapterScraper);

router.get("/search/", NovelDeGlaceScraper.searchScraper);

module.exports = router;
