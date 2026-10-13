document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-doctor-deck]').forEach(deck => {
    const photos = [...deck.querySelectorAll('[data-deck-photo]')];
    const status = deck.querySelector('[data-deck-status]');
    const prev = deck.querySelector('[data-deck-prev]');
    const next = deck.querySelector('[data-deck-next]');
    const stage = deck.querySelector('.doctor-deck-stage');
    if (photos.length !== 3 || !status || !prev || !next || !stage) return;

    // order[0] identifies the foreground photo; later items fan out behind it.
    let order = photos.map((_, index) => index);
    let announced = 0;
    const paint = (announce = false) => {
      photos.forEach((photo, index) => {
        const position = order.indexOf(index);
        photo.dataset.position = String(position);
        photo.setAttribute('aria-hidden', position === 0 ? 'false' : 'true');
        photo.tabIndex = position === 0 ? 0 : -1;
      });
      const frontIndex = order[0];
      const photoNumber = frontIndex + 1;
      status.textContent = 'Portrait ' + photoNumber + ' of ' + photos.length;
      if (announce) {
        announced += 1;
        deck.classList.remove('is-shuffling');
        void deck.offsetWidth;
        deck.classList.add('is-shuffling');
        window.setTimeout(() => deck.classList.remove('is-shuffling'), 560);
      }
    };
    const shuffle = direction => {
      if (direction > 0) order.unshift(order.pop());
      else order.push(order.shift());
      paint(true);
    };

    prev.addEventListener('click', () => shuffle(-1));
    next.addEventListener('click', () => shuffle(1));
    stage.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      shuffle(1);
    });
    stage.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); shuffle(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); shuffle(-1); }
    });
    paint();
  });
});
