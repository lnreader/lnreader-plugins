const express = require("express");
const wuxiaWorldCoScraper = require("./WuxiaWorldCoScraper");

const router = express.Router();

router.get("/novels/", wuxiaWorldCoScraper.novelsScraper);

router.get("/novel/:novelUrl", wuxiaWorldCoScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", wuxiaWorldCoScraper.chapterScraper);

router.get("/search/", wuxiaWorldCoScraper.searchScraper);

module.exports = router;
