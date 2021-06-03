const express = require("express");
const HasutlScraper = require("./HasutlScraper");

const router = express.Router();

router.get("/novels/", HasutlScraper.novelsScraper);

router.get("/novel/:novelUrl", HasutlScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", HasutlScraper.chapterScraper);

router.get("/search/", HasutlScraper.searchScraper);

module.exports = router;
