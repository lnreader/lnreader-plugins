const express = require("express");
const OasisTranslationsScraper = require("./OasisTranslationsScraper");

const router = express.Router();

router.get("/novels/", OasisTranslationsScraper.novelsScraper);

router.get("/novel/:novelUrl", OasisTranslationsScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:chapterUrl",
    OasisTranslationsScraper.chapterScraper
);

router.get("/search/", OasisTranslationsScraper.searchScraper);

module.exports = router;
