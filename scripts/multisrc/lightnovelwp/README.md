# Compatiblity
### This generator is for most sites that uses the LightNovel WordPress Theme: https://themesia.com/lightnovel-wordpress-theme/

it should work for all sites that uses this theme (highest version tested: 1.1.5)

to know the name and version of the theme you can enter the url in : [WP Theme Detector](https://www.wpthemedetector.com)
(it sometimes hallucinates for version 1.0.X as 1.0) \
or you can check the version by adding "/wp-content/themes/lightnovel/style.css"
to the site url and check the version in the file



## ADD A NEW SOURCE
To add a new source you need to add it to sources.json:
- id: the id of the source (something unique)
- sourceName: the name of the source (the name that will be displayed in the app)
- sourceSite: the site url
- options: the options of the source
  - lang: the language of the source (default: "English") (check that the language
   exists in the languages (check folder names in "plugins/"))
  - reverseChapter: if the chapters are in reverse order
   (if the first chapter of the list is 1 set it to false)

To add an icon to the source you need to find the icon of the site \
(try the favicon of the site (https://site.com/favicon.ico) most of the times it redirects you to an image named something like "cropped-site-32x32.png" try to access "cropped-site.png" or "site.png" if that did not work you can try to access "https://site.com/wp-json/" at the end of this very long file there should be a "site_icon_url" value
) (don't forget to convert it to png)
and add it to the folder "icons/multisrc/lightnovelwp" named as the id of the source

To add filters to a source you need to run the script "get_filters.ts" \
(./node_modules/.bin/ts-node scripts/multisrc/lightnovelwp/get_filters.ts
(if you are at the root of the project) (and you have ran "npm install" before))
and follow the instructions (url is easier and faster but sometimes it doesn't work)
