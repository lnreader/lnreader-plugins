const express = require("express");
const lightNovelPubScraper = require("./LightNovelPubScraper");

const router = express.Router();

router.get("/novels/", lightNovelPubScraper.novelsScraper);

router.get("/novel/:novelUrl", lightNovelPubScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", lightNovelPubScraper.chapterScraper);

router.get("/search/", lightNovelPubScraper.searchScraper);

module.exports = router;
