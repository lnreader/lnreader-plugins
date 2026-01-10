$('article > style')
  .text()
  .match(/\\.\\w+(?=\\s*[,{])/g)
  ?.forEach(tag => $(`p${tag}`).remove());
$('.epcontent .code-block').remove();
