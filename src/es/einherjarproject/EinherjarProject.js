const express = require("express");
const einherjarProjectScraper = require("./EinherjarProjectScraper");

const router = express.Router();

router.get("/novels/", einherjarProjectScraper.novelsScraper);

router.get("/novel/:novelUrl", einherjarProjectScraper.novelScraper);

router.get(
    "/novel/:novelUrl/:chapterUrl",
    einherjarProjectScraper.chapterScraper
);

router.get("/search/", einherjarProjectScraper.searchScraper);

module.exports = router;
