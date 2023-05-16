require('module-alias/register');
const fs = require('fs');
const languages = require('@libs/languages');
const path = require('path')
const root = path.dirname(__dirname);
const config = fs.existsSync(path.join(root, "config.json")) ? require("../config.json") : {};
const username = config.githubUsername;
const repo = config.githubRepository;
const branch = config.githubBranch;

if(!username || !repo || !branch){
    process.exit();
}
if(!fs.existsSync(path.join(root, "dist", username))){
    fs.mkdirSync(path.join(root, "dist", username));
}
const githubIconsLink = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/icons`;
const githubPluginsLink = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/plugins`;

const json = {};
const jsonPath = path.join(root, 'dist', username, 'plugins.json');
const jsonMinPath = path.join(root, 'dist', username, 'plugins.min.json');

for (let language in languages) {     // language with English name
    const langPath = path.join(root, 'plugins', language.toLowerCase());
    if (!fs.existsSync(langPath)) continue;
    const plugins = fs.readdirSync(langPath);
    json[languages[language]] = [];
    plugins.forEach(plugin => {
        if(plugin.startsWith('.')) return;
        const instance = require(`@plugins/${language.toLowerCase()}/${plugin.split('.')[0]}`);

        const { id, name, site, lang, version, icon, description } = instance;
        // lang: language with native name
        const info = { id, name, site, lang, version, description }
        info.url = `${githubPluginsLink}/${language.toLowerCase()}/${plugin}`;
        info.iconUrl = `${githubIconsLink}/${icon}`;

        json[lang].push(info);

        console.log('Collected', name);
    });
}

for(let lang in json) json[lang].sort((a, b) => a.id.localeCompare(b.id))

fs.writeFileSync(jsonMinPath, JSON.stringify(json));
fs.writeFileSync(jsonPath, JSON.stringify(json, null, '\t'));
console.log('Done ✅');
