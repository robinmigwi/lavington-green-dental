// Lavington Green Dental Suite — site behavior
// Pure vanilla JS, zero external libraries, so the whole site runs locally with no internet needed.

document.addEventListener('DOMContentLoaded', () => {

  // Compare slider: drag/tap to reveal the "before" image
  document.querySelectorAll('[data-compare]').forEach((el) => {
    const before = el.querySelector('.cs-before');
    const handle = el.querySelector('.cs-handle');
    let active = false;
    const setPos = (clientX) => {
      const r = el.getBoundingClientRect();
      let pct = ((clientX - r.left) / r.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = pct + '%';
    };
    el.addEventListener('pointerdown', (e) => { active = true; setPos(e.clientX); });
    window.addEventListener('pointermove', (e) => { if (active) setPos(e.clientX); });
    window.addEventListener('pointerup', () => { active = false; });
    el.addEventListener('touchstart', (e) => setPos(e.touches[0].clientX), { passive: true });
    el.addEventListener('touchmove', (e) => setPos(e.touches[0].clientX), { passive: true });
  });

  // Mobile nav toggle
  const burger = document.querySelector('.hamburger');
  const navlinks = document.querySelector('.navlinks');
  if (burger && navlinks) {
    burger.addEventListener('click', () => {
      navlinks.classList.toggle('open');
      burger.classList.toggle('active');
    });
    navlinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => navlinks.classList.remove('open'))
    );
  }

  // Mark active nav link
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  // Restrained scroll reveal — used sparingly (facility band + one intro block per page), not on every card
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.18 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // Subtle parallax on the facility photo band (the one deliberate motion moment beyond the hero)
  const parallaxImgs = document.querySelectorAll('.photo-duo.parallax img');
  if (parallaxImgs.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const update = () => {
      parallaxImgs.forEach(img => {
        const rect = img.parentElement.getBoundingClientRect();
        const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        const shift = Math.max(-1, Math.min(1, progress - 0.5)) * 40;
        img.style.transform = `translateY(${shift}px)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    });
    update();
  }

  // Services accordion — close siblings within the same category list for a tidier open state
  document.querySelectorAll('.svc-list').forEach(list => {
    list.querySelectorAll('details').forEach(d => {
      d.addEventListener('toggle', () => {
        if (d.open) {
          list.querySelectorAll('details').forEach(o => { if (o !== d) o.open = false; });
        }
      });
    });
  });

  // Contact form: no backend yet, hand the message to WhatsApp instead
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      const msg = form.message.value.trim();
      const phone = form.phone.value.trim();
      const text = encodeURIComponent(
        `Hi Lavington Green Dental Suite, my name is ${name}.\nPhone: ${phone}\n\n${msg}`
      );
      window.open(`https://wa.me/254706820099?text=${text}`, '_blank');
    });
  }

  // Treatment case switcher — preserves one full-size comparison instead of thumbnail grids
  const treatmentTabs = document.querySelectorAll('[data-treatment]');
  const treatmentCompare = document.querySelector('[data-treatment-compare]');
  if (treatmentTabs.length && treatmentCompare) {
    const beforeImg = treatmentCompare.querySelector('.cs-before img');
    const afterImg = treatmentCompare.querySelector('.cs-after img');
    const cases = {
      tartar: {
        before: 'assets/before-after/tartat removal before.png',
        after: 'assets/before-after/tartat removal after.png',
        label: 'Tartar removal'
      },
      crowns: {
        before: 'assets/before-after/Crowns before.png',
        after: 'assets/before-after/Crowns after.png',
        label: 'Crowns'
      },
      whitening: {
        before: 'assets/before-after/Whitening before.png',
        after: 'assets/before-after/Whitening after.png',
        label: 'Whitening'
      },
      ortho: {
        before: 'assets/before-after/Ortho before.png',
        after: 'assets/before-after/Ortho after.png',
        label: 'Orthodontics'
      }
    };

    treatmentTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const item = cases[tab.dataset.treatment];
        if (!item) return;
        beforeImg.src = item.before;
        beforeImg.alt = 'Before ' + item.label.toLowerCase();
        afterImg.src = item.after;
        afterImg.alt = 'After ' + item.label.toLowerCase();
        treatmentTabs.forEach(t => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const r = treatmentCompare.getBoundingClientRect();
        const pct = 50;
        const before = treatmentCompare.querySelector('.cs-before');
        const handle = treatmentCompare.querySelector('.cs-handle');
        before.style.clipPath = `inset(0 50% 0 0)`;
        handle.style.left = pct + '%';
      });
    });
  }

  // Header state: keep the original overlay look at the hero, then give the sticky nav a solid background.
  const header = document.querySelector('header');
  const headerHero = document.querySelector('.hero, .page-hero');
  if (header && headerHero) {
    const syncHeader = () => {
      const threshold = headerHero.getBoundingClientRect().bottom <= 84;
      header.classList.toggle('scrolled', threshold);
    };
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();
  }

});
