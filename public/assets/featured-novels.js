(() => {
  const novels = [
    ['wildborn', 'Wildborn', 'THE WILDERNESS IS CALLING', 'FANTASY / ADVENTURE', 'A young hunter is drawn into a kingdom of betrayal and danger.'],
    ['beneath-falling-leaves', 'Beneath Falling Leaves', 'A SAGA OF GODS AND KINGS', 'EPIC FANTASY', 'Ancient hatreds stir and a lost heir rises in the opening novel of A Saga of Gods and Kings.'],
    ['the-glass-tapestry', 'The Glass Tapestry', 'INFINITE REALITIES', 'SPECULATIVE FICTION', 'A magician who can steal from other realities faces the consequences of crossing into one.'],
  ];

  // Use the Sydney calendar date so the change happens on Monday locally, even during daylight saving.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(date.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const week = Math.floor((day - Date.UTC(2026, 10, 9)) / (7 * 86400000));
  let index = ((week % novels.length) + novels.length) % novels.length;

  const find = selector => document.querySelector(selector);
  const hero = find('.hero-art');
  const pause = find('.feature-pause');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  let timer;
  let hovering = false;
  let focused = false;

  // Keep the lower editorial feature weekly; only the top cover rotates.
  const [weeklySlug, weeklyTitle, , genre, description] = novels[index];
  if (index !== 0) {
    find('.feature-image img').src = '/assets/img/' + weeklySlug + '-3d.webp';
    find('.feature-image img').alt = weeklyTitle + ' book cover artwork';
    find('.feature-image').style.setProperty('--featured-cover', 'url("/assets/img/' + weeklySlug + '-3d.webp")');
    find('.feature-copy h2').textContent = weeklyTitle;
    find('.feature-copy h2 + p').textContent = description;
    find('.feature-details span').textContent = genre;
    find('.feature-copy .text-link').href = '/books/' + weeklySlug + '/';
  }
  for (const [slug] of novels) {
    const image = new Image();
    image.src = '/assets/img/' + slug + '-3d.webp';
  }
  function render() {
    const [slug, title, tagline] = novels[index];
    const url = '/books/' + slug + '/#purchase';
    const number = String(index + 1).padStart(2, '0');
    hero.href = url;
    hero.setAttribute('aria-label', 'Choose an edition of ' + title);
    find('.hero-art img').src = '/assets/img/' + slug + '-3d.webp';
    find('.hero-art img').alt = title + ' book cover artwork';
    const button = find('.hero-buttons .btn-gold');
    button.href = url;
    button.firstChild.nodeValue = 'Explore ' + title + ' ';
    find('.hero-above').textContent = tagline;
    find('.art-vertical').textContent = tagline;
    find('.hero-stats b').textContent = number;
    find('.hero-caption span').textContent = number + ' / FEATURED NOVEL';
    find('.hero-caption strong').textContent = title.toUpperCase();
  }
  function schedule() {
    clearInterval(timer);
    if (!paused && !hovering && !focused && !document.hidden) {
      timer = setInterval(() => { index = (index + 1) % novels.length; render(); }, 3000);
    }
    pause.textContent = paused ? 'Resume rotation' : 'Pause rotation';
    pause.setAttribute('aria-pressed', String(paused));
  }
  pause.addEventListener('click', () => { paused = !paused; schedule(); });
  // Freeze the destination while someone is choosing or activating a link.
  const heroInner = find('.hero-inner');
  heroInner.addEventListener('mouseenter', () => { hovering = true; schedule(); });
  heroInner.addEventListener('mouseleave', () => { hovering = false; schedule(); });
  heroInner.addEventListener('focusin', () => { focused = true; schedule(); });
  heroInner.addEventListener('focusout', event => {
    focused = heroInner.contains(event.relatedTarget); schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', event => { paused = event.matches; schedule(); });
  render();
  schedule();
})();
