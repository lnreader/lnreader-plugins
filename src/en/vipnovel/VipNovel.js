const express = require("express");
const vipNovelScraper = require("./VipNovelScraper");

const router = express.Router();

router.get("/novels/", vipNovelScraper.novelsScraper);

router.get("/novel/:novelUrl", vipNovelScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", vipNovelScraper.chapterScraper);

router.get("/search/", vipNovelScraper.searchScraper);

module.exports = router;
