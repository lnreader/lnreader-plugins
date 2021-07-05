const express = require("express");
const syosetuNovelScrapper = require("./SyosetuScrapper");

const router = express.Router();

router.get("/novels/", syosetuNovelScrapper.novelsScraper);
router.get("/novel/:novelUrl", syosetuNovelScrapper.novelScraper);
router.get("/novel/:novelUrl/:chapterUrl", syosetuNovelScrapper.chapterScraper);
router.get("/search/", syosetuNovelScrapper.searchScraper);

module.exports = router;
