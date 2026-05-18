    const ghostScript = loadedCheerio('script[id*=ghost]');
    const contentHost = loadedCheerio('#cherry-content-host');

    if (ghostScript.length && contentHost.length) {
      const poly = ghostScript.attr('data-poly');
      // data-poly attr provide id
      // encoded text is stored in attr data-{id}-{number}
      // create full string of all the data-poly-nums
      const encoded = Array.from(
        { length: +ghostScript.attr('data-total') || 0 },
        (_, i) => ghostScript.attr(`data-${poly}-${i}`) || '',
      ).join('');

      // technically copypasta from source
      // var c = s.charCodeAt(i);
      // if(c>=65 && c<=90)
      //    o+=String.fromCharCode((c-65+13)%26+65);
      // else if(c>=97&&c<=122)
      //    o+=String.fromCharCode((c-97+13)%26+97);
      // else
      //    o+=s.charAt(i);
      if (encoded) {
        const rot13 = (str) => {
          return str.replace(/[a-zA-Z]/g, (char) => {
            const base = char <= 'Z' ? 65 : 97;
            const shift = ((char.charCodeAt(0) - base + 13) % 26) + base;
            return String.fromCharCode(shift);
          });
        };
        contentHost.replaceWith(decodeURIComponent(atob(rot13(encoded))));
      }
    }

    loadedCheerio('script, ruby').remove();

    loadedCheerio('section#chapter-content p [data-fcnc-rev="1"]').each((_, el) => {
      const text = loadedCheerio(el).text().trim();
      if (text) loadedCheerio(el).replaceWith([...text].reverse().join(''));
    });

    return (
      loadedCheerio('section#chapter-content > div')
        .html()
        ?.replace(/\u00A0/g, ' ')
        ?.replace(/[\u2060\u00AD\u202F\u2007\u200B]/g, '') || ''
    );
