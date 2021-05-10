const express = require("express");
const kissLightNovelsScraper = require("./KissLightNovelsScraper");

const router = express.Router();

router.get("/novels/", kissLightNovelsScraper.novelsScraper);

router.get("/novel/:novelUrl", kissLightNovelsScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:chapterUrl",
    kissLightNovelsScraper.chapterScraper
);

router.get("/search/", kissLightNovelsScraper.searchScraper);

module.exports = router;
