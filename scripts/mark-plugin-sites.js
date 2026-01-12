#!/usr/bin/env node

import { fileURLToPath } from 'url';
import fs from 'fs';
import path, { dirname } from 'path';
import languages from './languages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportFile = path.join(__dirname, '..', 'broken-sites-report.json');
const missedFile = path.join(__dirname, '..', 'missed-sites-report.json');
const pluginDir = path.join(__dirname, '..', 'plugins');

// Languages.js is backwards from what I want
function swap(json) {
  var ret = {};
  for (var key in json) {
    ret[json[key]] = key.toLowerCase();
  }
  return ret;
}

const langLookup = swap(languages);

async function renameFile(oldFile, newFileInject = '.broken') {
  try {
    const fileToRename = path.basename(oldFile);
    const directory = path.dirname(oldFile);
    const ext = path.extname(fileToRename);
    const fileBaseName = path.basename(oldFile, ext);

    // Ignore generated files if they exist
    if (fileToRename.toString().includes('].ts')) {
      return false;
    }
    if (fileBaseName.toString().includes(newFileInject)) {
      return true;
    }

    // Inject newFileInject into file name
    const finalNewName = fileBaseName + newFileInject + ext;

    // Construct full path
    const newPath = path.join(directory, finalNewName);

    // Rename the file
    await fs.renameSync(oldFile, newPath);

    console.log(`Successfully renamed: ${fileToRename} -> ${finalNewName}`);
    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function updateMultisrc(srcFile, url) {
  try {
    // Read and parse JSON file
    const jsonData = await fs.readFileSync(
      srcFile,
      'utf8',
      err => err && console.error(err),
    );
    const data = JSON.parse(jsonData);
    const date = new Date();
    const dateWithoutTime = date.toISOString().split('T')[0];

    for (const source of data) {
      const siteUrl = source.sourceSite;
      if (siteUrl != url) {
        continue;
      }
      // Set JSON modifications in here
      // Checking for existence of options
      if (!source.hasOwnProperty('options')) {
        source.options = {};
      }
      source.options.down = true;
      source.options.downSince = dateWithoutTime;
      break;
    }

    // Write data back to file with previous formatting and a return
    await fs.writeFileSync(srcFile, JSON.stringify(data, null, 2) + '\n');

    console.log(`Successfully rewrote: ${srcFile} for ${url}`);
    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function searchFilesForString(directory, searchString, options = {}) {
  const {
    recursive = false,
    multisrc = false,
    caseSensitive = false,
    fileExtensions = ['.ts', '.js', '.json'],
    showLineNumbers = false,
  } = options;

  const results = [];

  async function searchDirectory(dir) {
    try {
      const entries = await fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          // Check file extension filter
          if (
            fileExtensions &&
            !fileExtensions.includes(path.extname(entry.name))
          ) {
            continue;
          } else if (
            entry.isFile() &&
            multisrc &&
            path.basename(entry.name) != 'sources.json'
          ) {
            continue;
          }

          try {
            const content = await fs.readFileSync(fullPath, 'utf8');
            const searchTerm = caseSensitive
              ? searchString
              : searchString.toLowerCase();
            const searchContent = caseSensitive
              ? content
              : content.toLowerCase();

            if (searchContent.includes(searchTerm)) {
              const fileResult = {
                file: fullPath,
                matches: [],
              };

              if (showLineNumbers) {
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                  const checkLine = caseSensitive ? line : line.toLowerCase();
                  if (checkLine.includes(searchTerm)) {
                    fileResult.matches.push({
                      line: index + 1,
                      content: line.trim(),
                    });
                  }
                });
              }

              results.push(fileResult);
            }
          } catch (err) {
            // Skip files that can't be read as text
            if (err.code !== 'EISDIR') {
              console.warn(`Could not read file: ${fullPath}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err.message);
    }
  }

  await searchDirectory(directory);
  return results;
}

function displayResults(results, searchString) {
  if (results.length === 0) {
    console.log(`\nNo files found containing "${searchString}"\n`);
    return;
  }

  console.log(`\nFound "${searchString}" in ${results.length} file(s):\n`);

  results.forEach(result => {
    console.log(`📄 ${result.file}`);

    if (result.matches.length > 0) {
      result.matches.forEach(match => {
        console.log(`   Line ${match.line}: ${match.content}`);
      });
    }
    console.log('');
  });
}

async function main() {
  console.log(`Loading ${reportFile}...\n`);

  try {
    // Read and parse JSON file
    const jsonData = await fs.readFileSync(
      reportFile,
      'utf8',
      err => err && console.error(err),
    );
    const data = JSON.parse(jsonData);
    const broken = data.brokenSites;

    console.log(`Successfully indexed ${broken.length} plugins.\n`);

    const missed = [];
    const retry = [];

    for (const site of broken) {
      const lang = langLookup[site.lang];
      const url = site.url;

      const langDir = path.join(pluginDir, lang);

      const results = await searchFilesForString(langDir, url);

      if (results.length == 0) {
        console.warn(`No match for ${url}`);
        retry.push(site);
        continue;
      }
      for (const result of results) {
        const success = await renameFile(result.file);
        if (success === false) {
          console.warn(`Bad rename for ${url}`);
          retry.push(site);
        }
      }
    }

    if (retry.length > 0) {
      for (const site of retry) {
        const lang = 'multisrc';
        const url = site.url;

        const langDir = path.join(pluginDir, lang);
        const options = { recursive: true, multisrc: true };

        const results = await searchFilesForString(langDir, url, options);

        if (results.length == 0) {
          console.warn(`No match for ${url}`);
          missed.push(site);
          continue;
        }
        for (const result of results) {
          if (!(await updateMultisrc(result.file, url))) {
            missed.push(site);
          }
        }
      }
    }

    if (missed.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('Missed:');
      console.log('='.repeat(80));

      fs.writeFileSync(
        missedFile,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            total: missed.length,
            brokenSites: missed,
          },
          null,
          2,
        ),
      );

      console.log(`\n\nDetailed report saved to: ${missedFile}`);
    } else {
      console.log('\n✓ All sites marked!');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
