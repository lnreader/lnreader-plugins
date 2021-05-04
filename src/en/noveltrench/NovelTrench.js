const express = require("express");
const novelTrenchScraper = require("./NovelTrenchScraper");

const router = express.Router();

router.get("/novels/", novelTrenchScraper.novelsScraper);

router.get("/novel/:novelUrl", novelTrenchScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", novelTrenchScraper.chapterScraper);

router.get("/search/", novelTrenchScraper.searchScraper);

module.exports = router;
