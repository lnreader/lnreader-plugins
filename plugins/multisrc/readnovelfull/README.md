# Readnovelfull multisrc generator

## Compatiblity

### This generator is brought over from the madara generator one folder away

it should(!) work for all sites that uses this theme. If not, edit.

## Add a new source

### sources.json

To add a new source you need to add it to sources.json:

- id: the id of the source (something unique)
- sourceName: the name of the source (you can use the value of "name" in "https://site.com/wp-json/" if it exists)
- sourceSite: the site url
- options: the options of the source

  - lang?: the language of the source (default: "English") (check that the language
    exists in the languages (check folder names in "plugins/"))
  - versionIncrements?: needs to be updated everytime the site url is updated
  - latestPage: the href value using this CSS selector `a[title="Latest Release"]`
  - searchPage: path for search
  - chapterListing?: if chapters are obtained from an ajax endpoint different from what is default.
  - chapterParam?: same with chapterListing, but its the key for the form body. default: novelId
  - pageParam?: if a site uses something other than "page" for accessing pages

  // All the following is for when if a page uses a main path for querying novels and just adds params to it to get different outputs (see urls in lightnovelplus)

  - novelListing?: Main path for browsing novels
  - typeParam?: Field for entering the type of novelListing (eg: latest, hot, completed, etc), default: type
  - genreParam?: Field for entering type of novelListing dedicated for genres (since param websites dont use the path change), default: category_novel
  - genreKey?: Field for entering key representing the genre within the genreParam, default: id (eg: ?type=category_novel&id={value})
  - langParam?: Field for entering the key representing language(?), do not understand reason for this param honestly, but recreate normal website behaviour as much as possible, default: none.
  - urlLangCode?: the value for langParam, default: none. eg: 'en'

### filters

To add filters to a source you need to run the script "get_filters.js" \
(`npx node plugins/multisrc/readnovelfull/get_filters.js`
(if you are at the root of the project) (and you have ran "npm install" before))
and follow the instructions (url is easier and faster but sometimes it doesn't work)
