    const scriptContent = loadedCheerio('script')
      .toArray()
      .map(script => loadedCheerio(script).html())
      .find(content => content && content.includes('var gib ='));

    if (scriptContent) {
      const gibMatch = scriptContent.match(/var gib = (\[.*?\])/);
      if (gibMatch) {
        const gibArray = eval(gibMatch[1]) as string[];
        gibArray.forEach(cssClass => {
          loadedCheerio(`.${cssClass}`).remove();
        });
      }
    }

    loadedCheerio('ruby').remove();

    loadedCheerio('section#chapter-content p *').each((_, el) => {
      if (loadedCheerio(el).attr('data-fcnc-rev') !== '1') return;
      const textContent = loadedCheerio(el).text().trim();
      if (textContent) {
        loadedCheerio(el).replaceWith(
          Array.from(textContent).reverse().join(''),
        );
      }
    });

    return (
      loadedCheerio('section#chapter-content > div')
        .html()
        ?.normalize()
        .replace(/\u00A0/g, ' ')
        .replace(/\u2060/g, '')
        .replace(/­/g, '') // &shy;
        .replace(/[\u202F\u2007\u200B]/g, '') || ''
    );