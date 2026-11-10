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
  const index = ((week % novels.length) + novels.length) % novels.length;
  if (index === 0) return; // The HTML already contains the Wildborn feature.

  const [slug, title, tagline, genre, description] = novels[index];
  const cover = '/assets/img/' + slug + '-3d.webp';
  const url = '/books/' + slug + '/';
  const find = selector => document.querySelector(selector);
  const number = String(index + 1).padStart(2, '0');
  for (const image of document.querySelectorAll('.hero-art img, .feature-image img')) {
    image.src = cover;
    image.alt = title + ' book cover artwork';
  }
  find('.feature-image').style.setProperty('--featured-cover', 'url("' + cover + '")');
  const button = find('.hero-buttons .btn-gold');
  button.href = url;
  button.firstChild.nodeValue = 'Explore ' + title + ' ';
  find('.hero-above').textContent = tagline;
  find('.art-vertical').textContent = tagline;
  find('.hero-stats b').textContent = number;
  find('.hero-caption span').textContent = number + ' / FEATURED NOVEL';
  find('.hero-caption strong').textContent = title.toUpperCase();
  find('.feature-copy h2').textContent = title;
  find('.feature-copy h2 + p').textContent = description;
  find('.feature-details span').textContent = genre;
  find('.feature-copy .text-link').href = url;
})();
