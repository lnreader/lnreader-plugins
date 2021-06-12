const chromium = require("chrome-aws-lambda");
const { htmlToText } = require("html-to-text");
const puppeteer = require("puppeteer");
const UserAgent = require("user-agents");

const userAgent = new UserAgent();

const scraper = async (url) => {
    const browser = await puppeteer.launch({
        args: [
            ...chromium.args,
            "--hide-scrollbars",
            "--disable-web-security",
            "--user-agent=" + userAgent + "",
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: true,
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto(url);
    const body = await page.content();

    return body;
};

const parseHtml = (html) => {
    let text = htmlToText(html);
    text = text.replace(/\n{2,}/g, "\n\n");
    return text;
};

module.exports = { scraper, parseHtml };
