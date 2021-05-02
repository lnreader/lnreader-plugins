const express = require("express");
const cheerio = require("cheerio");
const request = require("request");
const {
    novelScraper,
    searchScraper,
    chapterScraper,
    novelsScraper,
} = require("./boxnovelScraper");

const router = express.Router();

// Top novels

router.get("/novels/:pageNo/", novelsScraper);

// Novel

router.get("/novel/:novelUrl", novelScraper);

// Chapter

router.get("/novel/:novelUrl/:chapterUrl", chapterScraper);

// Search

router.get("/search/", searchScraper);

module.exports = router;
