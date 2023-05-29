var all_plugins = undefined;
var plugin_arr = [];
var current_array = [];
var current_plugin_requirePath = undefined;

const language_selection = $('#language');
const plugin_search = $('#plugin');
const search_results = $('#search-results');

fetch('/all_plugins').then(res => res.json()).then(all => {
    all_plugins = all;
    for(let lang in all){
        language_selection.append(`<option>${lang}</option>`);
        plugin_arr = plugin_arr.concat(all[lang]);
    }
});

const display_search = (arr) => {
    search_results.hide();
    search_results.html('');
    arr.slice(0, 15).forEach(plugin => {
        search_results.append(`
            <div>
                <button data-require="${plugin.requirePath}" onclick="test_plugin(this)" type="button" class="search-item btn btn-light btn-outline-primary btn-md btn-block">${plugin.lang}/${plugin.name}</button>
            </div>
        `)
    });
    search_results.show();
}

plugin_search.focus(e => {
    if(!all_plugins) return;
    if(language_selection.val()){
        current_array = all_plugins[language_selection.val()];
    }else{
        current_array = plugin_arr;
    }
    display_search(current_array);
});

plugin_search.keyup(e => {
    display_search(current_array.filter(plg => plg.name.toLowerCase().includes(plugin_search.val())));
});

$('#clear-search').click(e => {
    search_results.hide();
    plugin_search.val('');
    plugin_search.attr('data-require', '');
})

const test_plugin = (btn) => {
    const ele = $(btn);
    current_plugin_requirePath = ele.attr('data-require');
    plugin_search.attr('data-require', current_plugin_requirePath);
    plugin_search.val(ele.text().split('/')[1]);
    search_results.hide();
}

const popularNovels = () => {
    if(!current_plugin_requirePath) return;
    $('#popularNovels .spinner-border').show();
    fetch(`/popularNovels/`,{
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"pluginRequirePath": current_plugin_requirePath}),
    })
    .then(res => res.json())
    .then(novels => {
        const novel_list = $('#popularNovels .novel-list');
        novel_list.html('');
        if(novels.error){
            novel_list.html(novels.error);
        }else{
            novels.forEach(novel => {
                novel_list.append(`
                <div class="novel-item">
                    <img src="${novel.cover}" alt="No cover found">
                    <div class="novel-info">
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">name</div>
                            <samp class="info-value btn-light">${novel.name?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.name}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">url</div>
                            <samp class="info-value btn-light">${novel.url?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.url}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">cover</div>
                            <samp class="info-value btn-light">${novel.cover?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.cover}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                    </div>
                </div>
                `);
            })
        }
        $('#popularNovels .spinner-border').hide();
    });
}

const searchNovels = () => {
    const searchTerm = $('#searchNovels input').val();
    if(!current_plugin_requirePath || !searchTerm) return;
    $('#searchNovels .spinner-border').show();  
    fetch(`/searchNovels/`,{
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"pluginRequirePath": current_plugin_requirePath, "searchTerm": searchTerm}),
    })
    .then(res => res.json())
    .then(novels => {
        const novel_list = $('#searchNovels .novel-list');
        novel_list.html('');
        if(novels.error){
            novel_list.html(novels.error);
        }else{
            novels.forEach(novel => {
                novel_list.append(`
                <div class="novel-item">
                    <img src="${novel.cover}" alt="No cover found">
                    <div class="novel-info">
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">name</div>
                            <samp class="info-value btn-light">${novel.name?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.name}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">url</div>
                            <samp class="info-value btn-light">${novel.url?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.url}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                        <div class="info-item">
                            <div class="info-name btn btn-info disabled">cover</div>
                            <samp class="info-value btn-light">${novel.cover?.slice(0, 50)}</samp>
                            <div class="info-copy btn btn-primary" data="${novel.cover}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                        </div>
                    </div>
                </div>
                `);
            })
        }
        $('#searchNovels .spinner-border').hide();
    });
}

const parseNovelAndChapters = () => {
    const novelUrl = $('#parseNovelAndChapters input').val();
    if(!current_plugin_requirePath || !novelUrl) return;
    $('#parseNovelAndChapters .spinner-border').show();  
    fetch(`/parseNovelAndChapters/`,{
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"pluginRequirePath": current_plugin_requirePath, "novelUrl": novelUrl}),
    })
    .then(res => res.json())
    .then(sourceNovel => {
        const novel_item = $('#parseNovelAndChapters .novel-list .novel-item');
        novel_item.html(`
            <img src="${sourceNovel.cover}" alt="No cover found">
            <div class="novel-info">
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">name</div>
                    <samp class="info-value btn-light">${sourceNovel.name?.slice(0, 50)}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.name}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">url</div>
                    <samp class="info-value btn-light">${sourceNovel.url?.slice(0, 50)}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.url}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">cover</div>
                    <samp class="info-value btn-light">${sourceNovel.cover?.slice(0, 50)}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.cover}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">summary</div>
                    <samp class="info-value btn-light">${sourceNovel.summary?.slice(0, 50)}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.summary}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">author</div>
                    <samp class="info-value btn-light">${sourceNovel.author}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.author}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">artist</div>
                    <samp class="info-value btn-light">${sourceNovel.artist}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.artist}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">status</div>
                    <samp class="info-value btn-light">${sourceNovel.status}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.status}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
                <div class="info-item">
                    <div class="info-name btn btn-info disabled">genres</div>
                    <samp class="info-value btn-light">${sourceNovel.genres?.slice(0, 50)}</samp>
                    <div class="info-copy btn btn-primary" data="${sourceNovel.genres}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy</div>
                </div>
            </div>
        `);
        if(sourceNovel.error){
            novel_item.html(sourceNovel.error);
        }else{
            const chapter_list = $('#parseNovelAndChapters .chapter-list');
            chapter_list.html('');
            sourceNovel.chapters.forEach(chapter => {
                chapter_list.append(`
                <div class="chapter-item">
                    <samp class="info-value btn-light">${chapter.name?.slice(0, 26)}</samp><br>
                    <samp class="info-value btn-light">${chapter.releaseTime}</samp>
                    <div class="info-copy btn btn-primary" data="${chapter.url}" onclick="navigator.clipboard.writeText(this.getAttribute('data'))">Copy url</div>
                </div>
                `);
            })
        }
        $('#parseNovelAndChapters .spinner-border').hide();
    });
}

const parseChapter = () => {
    const chapterUrl = $('#parseChapter input').val();
    if(!current_plugin_requirePath || !chapterUrl) return;
    $('#parseChapter .spinner-border').show();  
    fetch(`/parseChapter/`,{
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"pluginRequirePath": current_plugin_requirePath, "chapterUrl": chapterUrl}),
    })
    .then(res => res.json())
    .then(chapterText => {
        $('#parseChapter textarea').text(chapterText);
        $('#parseChapter .spinner-border').hide();  
    })
}

const fetchImage = () => {
    const url = $('#fetchImage input').val();
    if(!current_plugin_requirePath || !url) return;
    $('#fetchImage .spinner-border').show();  
    fetch(`/fetchImage/`,{
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"pluginRequirePath": current_plugin_requirePath, "url": url}),
    })
    .then(res => res.json())
    .then(base64 => {
        $('#fetchImage img').attr("src", `data:image/jpg;base64,${base64}`);
        $('#fetchImage .spinner-border').hide();  
    })  
} 