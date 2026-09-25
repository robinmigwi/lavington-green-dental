document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  const burger = document.querySelector('.hamburger');
  const navlinks = document.querySelector('.navlinks');

  const syncHeader = () => { if (header) header.classList.toggle('scrolled', window.scrollY > 24); };
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive:true });

  if (burger && navlinks) {
    burger.addEventListener('click', () => {
      const open = navlinks.classList.toggle('open');
      burger.classList.toggle('active', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', open);
    });
    navlinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navlinks.classList.remove('open');
      burger.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
    }));
  }

  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    }), { threshold:.14 });
    revealEls.forEach(el => io.observe(el));
  } else revealEls.forEach(el => el.classList.add('in'));

  const whyItems = [...document.querySelectorAll('[data-why]')];
  const whyPanel = document.querySelector('[data-why-panel]');
  const whyContent = [
    ['01 · Experience','People you can trust with your care.','Our principal dentists bring long careers in dental healthcare and lead a wider team of qualified clinicians and administrative staff.'],
    ['02 · Comprehensive care','More of your care, under one roof.','From preventive and general dentistry to cosmetic, paediatric, orthodontic, prosthetic and minor oral surgery services.'],
    ['03 · Modern diagnostics','Clearer decisions start with good information.','The practice uses digital X-ray and modern dental equipment to support assessment and treatment planning where appropriate.'],
    ['04 · Insurance support','Less friction around your cover.','The practice accepts 20+ insurance providers and works with corporate accounts. You can ask the team about your specific cover before visiting.'],
    ['05 · Patient-focused','You should understand the plan.','The team takes time to explain what is happening, answer questions and give patients a clear route forward.']
  ];
  whyItems.forEach(item => item.addEventListener('click', () => {
    whyItems.forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    const data = whyContent[Number(item.dataset.why)];
    if (!whyPanel || !data) return;
    whyPanel.innerHTML = '<div class="why-panel-media"><img src="assets/team.jpg" alt="Lavington Green Dental Suite clinical team"></div><div class="why-panel-content why-fade"><div class="why-panel-kicker">'+data[0]+'</div><h3 class="why-panel-title">'+data[1]+'</h3><p class="why-panel-copy">'+data[2]+'</p></div>';
  }));

  document.querySelectorAll('[data-compare]').forEach(slider => {
    const before = slider.querySelector('.compare-before');
    const handle = slider.querySelector('.compare-handle');
    if (!before || !handle) return;
    let active = false;
    const setPos = clientX => {
      const rect = slider.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      before.style.clipPath = 'inset(0 '+(100-pct)+'% 0 0)';
      handle.style.left = pct + '%';
      slider.setAttribute('aria-valuenow', Math.round(pct));
    };
    slider.addEventListener('pointerdown', e => { active = true; slider.setPointerCapture?.(e.pointerId); setPos(e.clientX); });
    slider.addEventListener('pointermove', e => { if (active) setPos(e.clientX); });
    slider.addEventListener('pointerup', () => { active = false; });
    slider.addEventListener('pointercancel', () => { active = false; });
    slider.addEventListener('keydown', e => {
      const current = parseFloat(handle.style.left || '50');
      const rect = slider.getBoundingClientRect();
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(rect.left + rect.width * ((current-5)/100)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPos(rect.left + rect.width * ((current+5)/100)); }
    });
    slider.setAttribute('tabindex','0');
    slider.setAttribute('role','slider');
    slider.setAttribute('aria-valuemin','0');
    slider.setAttribute('aria-valuemax','100');
    slider.setAttribute('aria-valuenow','50');
  });

  const journey = document.querySelector('[data-journey]');
  if (journey) {
    const steps = [...journey.querySelectorAll('.j-step')];
    const progress = journey.querySelector('.journey-progress');
    const updateJourney = () => {
      const rect = journey.getBoundingClientRect();
      const viewportPoint = window.innerHeight * .55;
      let activeIndex = 0;
      steps.forEach((step,index) => { if (step.getBoundingClientRect().top < viewportPoint) activeIndex = index; });
      steps.forEach((step,index) => step.classList.toggle('active', index === activeIndex));
      if (progress) {
        const total = Math.max(1, rect.height - 10);
        const travelled = Math.max(0, Math.min(total, viewportPoint - rect.top));
        progress.style.setProperty('--journey-progress', (travelled/total*100)+'%');
      }
    };
    updateJourney();
    window.addEventListener('scroll', updateJourney, {passive:true});
  }

  document.querySelectorAll('.svc-list').forEach(list => list.querySelectorAll('details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) list.querySelectorAll('details').forEach(other => { if (other !== detail) other.open = false; });
    });
  }));

  const reviewsRoot = document.querySelector('[data-review-carousel]');
  if (reviewsRoot) {
    const state = reviewsRoot.querySelector('[data-review-state]');
    const rating = document.querySelector('[data-google-rating]');
    const count = document.querySelector('[data-google-count]');
    const googleLink = document.querySelector('[data-google-link]');

    fetch('/.netlify/functions/google-reviews')
      .then(response => { if (!response.ok) throw new Error('Google reviews endpoint unavailable'); return response.json(); })
      .then(data => {
        if (!data || !data.configured) {
          if (state) state.textContent = 'Google reviews are ready to connect. Add the Google Places credentials in Netlify to display the practice reviews here.';
          if (count) count.textContent = 'Google review integration pending';
          return;
        }
        if (data.error) throw new Error(data.error);
        if (rating) rating.textContent = Number(data.rating || 0).toFixed(1);
        if (count) count.textContent = (data.userRatingCount || 0) + ' Google reviews';
        if (googleLink && data.googleMapsUri) { googleLink.href = data.googleMapsUri; googleLink.hidden = false; }

        const reviewList = Array.isArray(data.reviews) ? data.reviews.filter(r => r && r.text) : [];
        if (!reviewList.length) { if (state) state.textContent = 'The Google rating is connected, but no review text was returned by the Places service.'; return; }
        if (state) state.remove();

        reviewList.forEach((review,index) => {
          const card = document.createElement('article');
          card.className = 'review-card' + (index === 0 ? ' active' : '');
          const starsText = '★★★★★'.slice(0, Math.max(0, Math.min(5, Math.round(review.rating || 0))));
          const author = escapeHtml(review.authorName || 'Google reviewer');
          const authorLink = review.authorUri ? '<a href="'+escapeHtml(review.authorUri)+'" target="_blank" rel="noopener">'+author+'</a>' : '<span>'+author+'</span>';
          const sourceLink = review.googleMapsUri ? '<a href="'+escapeHtml(review.googleMapsUri)+'" target="_blank" rel="noopener">View this review on Google Maps ↗</a>' : '';
          const reportLink = review.flagContentUri ? '<a href="'+escapeHtml(review.flagContentUri)+'" target="_blank" rel="noopener">Report</a>' : '';
          card.innerHTML = '<div class="review-stars">'+starsText+'</div><blockquote>“'+escapeHtml(review.text)+'”</blockquote><div class="review-author">'+authorLink+'<span class="dot"></span><span>'+escapeHtml(review.relativePublishTimeDescription || 'Google review')+'</span></div><div class="review-source">'+sourceLink+(reportLink ? '<span>·</span>'+reportLink : '')+'</div>';
          reviewsRoot.appendChild(card);
        });

        const attribution = document.createElement('div');
        attribution.className = 'review-attribution';
        attribution.innerHTML = '<strong>Google Maps</strong> · Reviews are shown as returned by Google and are ordered by relevance.';
        reviewsRoot.appendChild(attribution);

        if (reviewList.length > 1) {
          let index = 0;
          const cards = [...reviewsRoot.querySelectorAll('.review-card')];
          const controls = document.createElement('div');
          controls.className = 'review-controls';
          controls.innerHTML = '<button class="review-control" type="button" aria-label="Previous review">←</button><button class="review-control" type="button" aria-label="Next review">→</button><span class="review-status">1 / '+cards.length+'</span>';
          reviewsRoot.appendChild(controls);
          const status = controls.querySelector('.review-status');
          const show = next => { index=(next+cards.length)%cards.length; cards.forEach((card,i)=>card.classList.toggle('active',i===index)); status.textContent=(index+1)+' / '+cards.length; };
          controls.children[0].addEventListener('click',()=>show(index-1));
          controls.children[1].addEventListener('click',()=>show(index+1));
          setInterval(()=>show(index+1),7000);
        }
      })
      .catch(() => {
        if (state) state.textContent = 'Google reviews could not be loaded right now. The direct Google link will appear once the connection is configured.';
        if (count) count.textContent = 'Google reviews';
      });
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.name.value.trim();
    const msg = form.message.value.trim();
    const phone = form.phone.value.trim();
    const text = encodeURIComponent('Hi Lavington Green Dental Suite, my name is '+name+'.\nPhone: '+phone+'\n\n'+msg);
    window.open('https://wa.me/254706820099?text='+text, '_blank', 'noopener');
  });
});