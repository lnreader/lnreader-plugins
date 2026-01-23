import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const key = 'fpoiKLUues81werht039';

async function getFilters(name, url) {
  const filters = {
    genres: {
      type: 'Checkbox',
      label: 'Жанры: все жанры любой жанр',
      value: '',
      options: [],
    },
  };

  try {
    const genres = await fetch(`${url}/api3/genres?key=${key}`).then(res =>
      res.json(),
    );

    if (genres.status === 'success' && genres.response?.length) {
      genres.response.forEach(genre => {
        filters.genres.options.push({
          label: genre.title,
          value: genre.id.toString(),
        });
      });
      filters.genres.options.sort((a, b) => a.label.localeCompare(b.label));
    }

    const filtersDir = path.join(__dirname, 'filters');
    if (!fs.existsSync(filtersDir)) {
      fs.mkdirSync(filtersDir);
    }

    fs.writeFileSync(
      path.join(filtersDir, `${name}.json`),
      JSON.stringify({ filters }, null, 2),
    );

    console.log(`✅ Filter updated for ${name}`);
  } catch (error) {
    console.error(`❌ Error processing filters for ${name}:`, error);
  }
}

try {
  const sourcesRaw = fs.readFileSync(
    path.join(__dirname, 'sources.json'),
    'utf-8',
  );
  const sources = JSON.parse(sourcesRaw);

  for (const source of sources) {
    if (source.id && source.sourceSite) {
      await getFilters(source.sourceName, source.sourceSite);
    }
  }
} catch (e) {
  console.error('Error reading or parsing sources.json', e);
}
