const express = require("express");
const NovelaWuxiaScraper = require("./NovelaWuxiaScraper");

const router = express.Router();

router.get("/novels/", NovelaWuxiaScraper.novelsScraper);

router.get("/novel/:novelUrl", NovelaWuxiaScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:year/:month/:chapterUrl",
    NovelaWuxiaScraper.chapterScraper
);

router.get("/search/", NovelaWuxiaScraper.searchScraper);

module.exports = router;
