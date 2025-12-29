(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const btn = document.querySelector('.menu');
  const mobile = document.querySelector('.nav--mobile');
  if (btn && mobile) {
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      mobile.hidden = !open;
    };
    set(false);
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      set(open);
    });
  }
})();
