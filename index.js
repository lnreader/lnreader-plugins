require('module-alias/register');

const path = require('path');
const dayjs = require('dayjs')
const express = require('express');
const bodyParser = require('body-parser');
const pluginApi = require('@api/plugins');
const localizedFormat = require('dayjs/plugin/localizedFormat');

const app = express();
const port = 3000;
const host = 'localhost';

app.use(bodyParser.json());
app.use('/static', express.static(path.join(__dirname, 'test_web', 'static')));
app.get('/all_plugins', (req, res) => {
    res.json(pluginApi.all_plugins());
});
app.post('/popularNovels/', async (req, res) => {
    const filters = req.body['filters'] || {};
    const showLatestNovels = req.body['showLatestNovels'] || false
    const novels = await pluginApi.popularNovels(req.body['pluginRequirePath'], {showLatestNovels, filters});
    res.json(novels);
});
app.post('/searchNovels/', async(req, res) => {
    const novels = await pluginApi.searchNovels(req.body['pluginRequirePath'], req.body['searchTerm']);
    res.json(novels);
})
app.post('/parseNovelAndChapters/', async(req, res) => {
    const sourceNovel = await pluginApi.parseNovelAndChapters(req.body['pluginRequirePath'], req.body['novelUrl']);
    res.json(sourceNovel);
})
app.post('/parseChapter/', async(req, res) => {
    const chapterText = await pluginApi.parseChapter(req.body['pluginRequirePath'], req.body['chapterUrl']);
    res.json(chapterText);
})
app.post('/fetchImage/', async(req, res) => {
    const base64 = await pluginApi.fetchImage(req.body['pluginRequirePath'], req.body['url']);
    res.json(base64);
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test_web', 'index.html'));
});


app.listen(port, host, () => {
    console.log("Testing plugins web listening on http://localhost:3000");
});

//Dayjs localization
const language = Intl?.DateTimeFormat()?.resolvedOptions()?.locale || "en";

require("dayjs/locale/ar");
require("dayjs/locale/de");
require("dayjs/locale/es");
require("dayjs/locale/it");
require("dayjs/locale/pt");
require("dayjs/locale/ru");
require("dayjs/locale/tr");
require("dayjs/locale/uk");
require("dayjs/locale/zh");

dayjs.locale(language);
dayjs.extend(localizedFormat);