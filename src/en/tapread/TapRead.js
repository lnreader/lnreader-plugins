const express = require("express");
const tapReadScraper = require("./TapReadScraper");

const router = express.Router();

router.get("/novels/", tapReadScraper.novelsScraper);

router.get("/novel/:novelUrl", tapReadScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", tapReadScraper.chapterScraper);

router.get("/search/", tapReadScraper.searchScraper);

module.exports = router;
