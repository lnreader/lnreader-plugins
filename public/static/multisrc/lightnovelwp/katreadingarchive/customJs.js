document.querySelectorAll('sup[data-mfn]').forEach(el => {
  const targetEl = `mfn-content-${el.getAttribute('data-mfn-post-scope')}-${el.getAttribute('data-mfn')}`;
  el.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();

    document.querySelector(`#${targetEl}`).classList.toggle('active');
  });
});
