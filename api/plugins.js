const fs = require('fs');
const languages = require('@libs/languages');
const path = require('path')
const root = path.dirname(require.main.filename);

const all_plugins = () => {
    const res = {}
    for (let language in languages) {     //language with English name
        const langPath = path.join(root, 'plugins', language.toLowerCase());
        if (!fs.existsSync(langPath)) continue;
        const plugins = fs.readdirSync(langPath);
        res[languages[language]] = [];
        plugins.forEach(plugin => {
            if(plugin.startsWith('.')) return;
            const requirePath = `@plugins/${language.toLowerCase()}/${plugin.split('.')[0]}`
            const instance = require(requirePath);
            const { id, name, lang, version, description } = instance;
            const info = { id, name, lang, version, description } // lang: language with native name
            info.requirePath = requirePath;
            res[lang].push(info);
        });
    }
    return res;
}

const popularNovels = async (pluginRequirePath, {showLatestNovels, filters}) => {
    return await require(pluginRequirePath).popularNovels(1, {showLatestNovels, filters});
}

const searchNovels = async (pluginRequirePath, searchTerm) => {
    return await require(pluginRequirePath).searchNovels(searchTerm);
}

const parseNovelAndChapters = async(pluginRequirePath, novelUrl) => {
    return await require(pluginRequirePath).parseNovelAndChapters(novelUrl);
}

const parseChapter = async (pluginRequirePath, chapterUrl) => {
    return await require(pluginRequirePath).parseChapter(chapterUrl);
}

const fetchImage = async (pluginRequirePath, url) => {
    return await require(pluginRequirePath).fetchImage(url);
}

module.exports = {
    all_plugins,
    popularNovels,
    searchNovels,
    parseNovelAndChapters,
    parseChapter,
    fetchImage
}