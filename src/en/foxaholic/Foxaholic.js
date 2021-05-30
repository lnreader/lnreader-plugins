const express = require("express");
const FoxaholicScraper = require("./FoxaholicScraper");

const router = express.Router();

router.get("/novels/", FoxaholicScraper.novelsScraper);

router.get("/novel/:novelUrl", FoxaholicScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:volumeUrl?/:chapterUrl",
    FoxaholicScraper.chapterScraper
);
router.get("/search/", FoxaholicScraper.searchScraper);

module.exports = router;
