const express = require("express");
const YuukiTlsScraper = require("./YuukiTlsScraper");

const router = express.Router();

router.get("/novels/", YuukiTlsScraper.novelsScraper);

router.get("/novel/:novelUrl", YuukiTlsScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", YuukiTlsScraper.chapterScraper);

router.get("/search/", YuukiTlsScraper.searchScraper);

module.exports = router;
