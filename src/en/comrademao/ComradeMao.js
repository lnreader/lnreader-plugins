const express = require("express");
const ComradeMaoScraper = require("./ComradeMaoScraper");

const router = express.Router();

router.get("/novels/", ComradeMaoScraper.novelsScraper);

router.get("/novel/:novelUrl", ComradeMaoScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", ComradeMaoScraper.chapterScraper);

router.get("/search/", ComradeMaoScraper.searchScraper);

module.exports = router;
