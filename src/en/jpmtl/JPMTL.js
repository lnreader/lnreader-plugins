const express = require("express");
const JPMTLScraper = require("./JPMTLScraper");

const router = express.Router();

router.get("/novels/", JPMTLScraper.novelsScraper);

router.get("/novel/:novelUrl", JPMTLScraper.novelScraper);

router.get("/novel/:novelUrl/:chapterUrl", JPMTLScraper.chapterScraper);

router.get("/search/", JPMTLScraper.searchScraper);

module.exports = router;
