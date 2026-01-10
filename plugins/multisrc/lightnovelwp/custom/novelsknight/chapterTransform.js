$('.announ').remove();
return (
  $('.epcontent')
    .eq(-1)
    .find('p')
    .map(function (i, el) {
      return '<p>' + $(this).text() + '</p>';
    })
    .toArray()
    .join('\n') || ''
);
