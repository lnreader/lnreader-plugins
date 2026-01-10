document.querySelectorAll('.author-feedback').forEach(
  el =>
    (el.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add('active');
    }),
);

document.addEventListener('click', e => {
  const els = document.querySelectorAll('.author-feedback.active');
  let anyClosed = false;
  for (const el of els) {
    if (!el.contains(e.target)) {
      el.classList.remove('active');
      anyClosed = true;
    }
  }
  if (anyClosed) {
    e.preventDefault();
    e.stopPropagation();
  }
});

document.querySelectorAll('a[href^="#"]').forEach(el => {
  el.addEventListener('click', e => {
    // e.preventDefault();
    e.stopPropagation();
    // const target = document.getElementById(el.getAttribute('href').slice(1));
    // if (target) {
    //   target.scrollIntoView({ behavior: 'smooth' });
    // }
  });
});