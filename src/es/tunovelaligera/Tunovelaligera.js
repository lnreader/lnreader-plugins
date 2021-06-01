const express = require("express");
const tunovelaligeraScraper = require("./TunovelaligeraScraper");

const router = express.Router();

router.get("/novels/", tunovelaligeraScraper.novelsScraper);

router.get("/novel/:novelUrl", tunovelaligeraScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:volumeUrl?/:chapterUrl",
    tunovelaligeraScraper.chapterScraper
);

router.get("/search/", tunovelaligeraScraper.searchScraper);

module.exports = router;
