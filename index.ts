require('module-alias/register');

import path from 'path';
import dayjs from 'dayjs';
import express from 'express';
import bodyParser from 'body-parser';
import * as pluginApi from './test_web/api/plugins';
import localizedFormat from 'dayjs/plugin/localizedFormat';

const app = express();
const port = Number(process.argv[2]);
if (!port) {
  process.exit(0);
}
const host = 'localhost';

const dirname = path.join(__dirname, '..');

export const getHeaders = () => {
  return pluginApi.fetchHeaders;
};

app.use((req, res, next) => {
  const xHeaders = req.headers['x-custom-headers'];
  if (xHeaders && typeof xHeaders === 'string') {
    for (const [headerName, headerValue] of Object.entries(
      pluginApi.fetchHeaders,
    )) {
      if (typeof headerName === 'string' && typeof headerValue === 'string')
        delete pluginApi.fetchHeaders[headerName];
    }
    const headers = JSON.parse(xHeaders);
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (typeof headerName === 'string' && typeof headerValue === 'string')
        pluginApi.fetchHeaders[headerName] = headerValue;
    }
  }
  if (pluginApi.fetchHeaders.userAgent)
    console.log('Custom headers: ', pluginApi.fetchHeaders);
  next();
});

app.use(bodyParser.json());
app.use('/static', express.static(path.join(dirname, 'test_web', 'static')));
app.use('/icons', express.static(path.join(dirname, 'icons')));
app.get('/all_plugins', (req, res) => {
  const allPlugins = pluginApi.all_plugins();
  res.json(allPlugins);
});
app.post('/filters', async (req, res) => {
  const filters = await pluginApi.getFilter(req.body['pluginRequirePath']);
  res.json(filters || []);
});
app.post('/popularNovels/', async (req, res) => {
  const requirePath = req.body['pluginRequirePath'];
  const showLatestNovels = req.body['showLatestNovels'] || false;
  const defaultFilters = await pluginApi.getFilter(requirePath);
  const filters = showLatestNovels
    ? defaultFilters
    : req.body['filters'] || defaultFilters;
  const page = parseInt(req.body['page']);
  try {
    const novels = await pluginApi.popularNovels(requirePath, page || 1, {
      showLatestNovels,
      filters,
    });
    res.json(novels);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/searchNovels/', async (req, res) => {
  const page = parseInt(req.body['page']) || 1;
  try {
    const novels = await pluginApi.searchNovels(
      req.body['pluginRequirePath'],
      page,
      req.body['searchTerm'],
    );
    res.json(novels);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/parseNovel/', async (req, res) => {
  try {
    const sourceNovel = await pluginApi.parseNovel(
      req.body['pluginRequirePath'],
      req.body['novelPath'],
    );
    res.json(sourceNovel);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/hasParsePage', async (req, res) => {
  try {
    const parsePage = await pluginApi.hasParsePage(
      req.body['pluginRequirePath'],
    );
    res.json({ hasParsePage: parsePage !== undefined });
  } catch (err: unknown) {
    res.json({ hasParsePage: false });
  }
});
app.post('/parsePage/', async (req, res) => {
  try {
    const sourcePage = await pluginApi.parsePage(
      req.body['pluginRequirePath'],
      req.body['novelPath'],
      req.body['page'],
    );
    res.json(sourcePage);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/parseChapter/', async (req, res) => {
  try {
    const chapterText = await pluginApi.parseChapter(
      req.body['pluginRequirePath'],
      req.body['chapterPath'],
    );
    res.send(chapterText);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/fetchImage/', async (req, res) => {
  try {
    const base64 = await pluginApi.fetchImage(
      req.body['pluginRequirePath'],
      req.body['url'],
    );
    res.send(base64);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});
app.post('/resolveUrl/', async (req, res) => {
  try {
    const fullURL = await pluginApi.resolveUrl(
      req.body['pluginRequirePath'],
      req.body['path'],
      req.body['isNovel'],
    );
    res.send(fullURL);
  } catch (err: unknown) {
    res.json({ error: String(err) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(dirname, 'test_web', 'index.html'));
});

app.listen(port, host, () => {
  console.log(`Testing plugins web listening on http://localhost:${port}`);
});

//Dayjs localization
const language = Intl?.DateTimeFormat()?.resolvedOptions()?.locale || 'en';

require('dayjs/locale/ar');
require('dayjs/locale/de');
require('dayjs/locale/es');
require('dayjs/locale/it');
require('dayjs/locale/pt');
require('dayjs/locale/ru');
require('dayjs/locale/tr');
require('dayjs/locale/uk');
require('dayjs/locale/zh');

dayjs.locale(language);
dayjs.extend(localizedFormat);
