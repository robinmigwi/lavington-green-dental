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
          const authorPhoto = review.authorPhotoUri ? '<img class="review-author-avatar" src="'+escapeHtml(review.authorPhotoUri)+'" alt="" loading="lazy">' : '';
          const sourceLink = review.googleMapsUri ? '<a href="'+escapeHtml(review.googleMapsUri)+'" target="_blank" rel="noopener">View this review on Google Maps ↗</a>' : '';
          const reportLink = review.flagContentUri ? '<a href="'+escapeHtml(review.flagContentUri)+'" target="_blank" rel="noopener">Report</a>' : '';
          card.innerHTML = '<div class="review-stars">'+starsText+'</div><blockquote>“'+escapeHtml(review.text)+'”</blockquote><div class="review-author">'+authorPhoto+'<span class="review-author-name">'+authorLink+'</span><span class="dot"></span><span>'+escapeHtml(review.relativePublishTimeDescription || 'Google review')+'</span></div><div class="review-source">'+sourceLink+(reportLink ? '<span>·</span>'+reportLink : '')+'</div>';
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

/* Conversational appointment request */
const booking = document.querySelector('[data-booking-chat]');
if (booking) {
  const form = document.getElementById('booking-chat-form');
  const steps = [...booking.querySelectorAll('[data-booking-step]')];
  const count = booking.querySelector('[data-booking-count]');
  const nameInput = document.getElementById('booking-name');
  const phoneInput = document.getElementById('booking-phone');
  const emailInput = document.getElementById('booking-email');
  const dateInput = document.getElementById('booking-date');
  const timeInput = document.getElementById('booking-time');
  const noteInput = document.getElementById('booking-note');
  const serviceInput = booking.querySelector('[data-booking-service]');
  const feelingInput = booking.querySelector('[data-booking-feeling]');
  const serviceChoices = [...booking.querySelectorAll('[data-service-choices] .booking-choice')];
  const feelingChoices = [...booking.querySelectorAll('[data-feeling-choices] .booking-choice')];
  const summary = booking.querySelector('[data-booking-summary]');
  const success = booking.querySelector('[data-booking-success]');
  const whatsappFallback = booking.querySelector('[data-booking-whatsapp]');
  const whatsappStatus = booking.querySelector('[data-booking-whatsapp-status]');
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];

  if (dateInput) dateInput.min = localToday;

  const showStep = number => {
    steps.forEach(step => step.classList.toggle('active', Number(step.dataset.bookingStep) === number));
    if (count) count.textContent = number + ' of ' + steps.length;
    booking.scrollIntoView({behavior:'smooth', block:'nearest'});
  };

  const bookingEscapeHtml = value => {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };

  const selectedValue = selector => {
    const selected = selector.find(button => button.classList.contains('selected'));
    return selected ? selected.dataset.value : '';
  };

  serviceChoices.forEach(button => button.addEventListener('click', () => {
    serviceChoices.forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    if (serviceInput) serviceInput.value = button.dataset.value || '';
  }));

  feelingChoices.forEach(button => button.addEventListener('click', () => {
    feelingChoices.forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    if (feelingInput) feelingInput.value = button.dataset.value || '';
  }));

  const validateStep = number => {
    if (number === 1 && !nameInput.value.trim()) {
      nameInput.focus();
      return false;
    }
    if (number === 2 && !phoneInput.value.trim()) {
      phoneInput.focus();
      return false;
    }
    if (number === 3 && !selectedValue(serviceChoices)) return false;
    if (number === 4 && (!dateInput.value || !timeInput.value)) {
      (!dateInput.value ? dateInput : timeInput).focus();
      return false;
    }
    if (number === 5 && !selectedValue(feelingChoices)) return false;
    return true;
  };

  booking.querySelectorAll('.booking-next').forEach(button => button.addEventListener('click', () => {
    const current = Number(button.closest('[data-booking-step]').dataset.bookingStep);
    if (!validateStep(current)) {
      const bubble = button.closest('[data-booking-step]').querySelector('.booking-validation');
      if (!bubble) {
        const message = document.createElement('div');
        message.className = 'booking-error booking-validation';
        message.textContent = current === 3 ? 'Please choose an option so we can guide your request.' : current === 5 ? 'Tell us how you are feeling about the visit.' : 'Please complete this step before continuing.';
        button.closest('[data-booking-step]').appendChild(message);
      }
      return;
    }
    const existing = button.closest('[data-booking-step]').querySelector('.booking-validation');
    if (existing) existing.remove();
    if (current === 1) {
      const preview = booking.querySelector('[data-name-preview]');
      if (preview) preview.textContent = nameInput.value.trim();
    }
    if (current === 5 && summary) {
      summary.innerHTML = '<strong>Your request</strong><br>Service: ' + bookingEscapeHtml(serviceInput.value) +
        '<br>Date: ' + bookingEscapeHtml(dateInput.value) +
        '<br>Preferred time: ' + bookingEscapeHtml(timeInput.value) +
        '<br>How you are feeling: ' + bookingEscapeHtml(feelingInput.value);
      const message = encodeURIComponent(
        'Hi Lavington Green Dental Suite, I would like to request an appointment.\n\n' +
        'Name: ' + nameInput.value.trim() + '\n' +
        'Phone: ' + phoneInput.value.trim() + '\n' +
        'Email: ' + (emailInput.value.trim() || 'Not provided') + '\n' +
        'Service: ' + serviceInput.value + '\n' +
        'Preferred date: ' + dateInput.value + '\n' +
        'Preferred time: ' + timeInput.value + '\n' +
        'How I am feeling: ' + feelingInput.value + '\n' +
        'More context: ' + (noteInput.value.trim() || 'Not provided')
      );
      if (whatsappFallback) {
        whatsappFallback.href = 'https://wa.me/254706820099?text=' + message;
        whatsappFallback.hidden = false;
      }
    }
    showStep(current + 1);
  }));

  booking.querySelectorAll('.booking-back').forEach(button => button.addEventListener('click', () => {
    const current = Number(button.closest('[data-booking-step]').dataset.bookingStep);
    showStep(Math.max(1, current - 1));
  }));

  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateStep(6)) return;
    const submit = form.querySelector('[data-booking-submit]');
    const oldText = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    try {
      const saveResponse = await fetch('/.netlify/functions/save-booking', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          booking_bot: form.booking_bot ? form.booking_bot.value : '',
          name:nameInput.value.trim(),
          phone:phoneInput.value.trim(),
          email:emailInput.value.trim(),
          service:serviceInput.value,
          preferred_date:dateInput.value,
          preferred_time:timeInput.value,
          feeling:feelingInput.value,
          message:noteInput.value.trim()
        })
      });
      const savedData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || !savedData.ok || !savedData.saved) {
        throw new Error(savedData.error || 'The appointment request could not be saved.');
      }

      const bookingIdStatus = booking.querySelector('[data-booking-id-status]');
      if (bookingIdStatus && savedData.bookingId) {
        bookingIdStatus.textContent = 'Request reference: ' + savedData.bookingId;
      }

      let whatsappSent = false;
      try {
        const whatsappResponse = await fetch('/.netlify/functions/send-booking-whatsapp', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            name:nameInput.value.trim(),
            phone:phoneInput.value.trim(),
            service:serviceInput.value,
            preferred_date:dateInput.value,
            preferred_time:timeInput.value,
            feeling:feelingInput.value
          })
        });
        const whatsappData = await whatsappResponse.json().catch(() => ({}));
        whatsappSent = whatsappResponse.ok && whatsappData.sent === true;
        if (whatsappStatus) {
          whatsappStatus.textContent = whatsappSent
            ? 'A WhatsApp message confirming your appointment request has been sent to the number you provided.'
            : 'Your request has been recorded. WhatsApp messaging will be enabled once the practice connection is added.';
        }
        const successStatus = booking.querySelector('[data-booking-whatsapp-success-status]');
        if (successStatus) {
          successStatus.textContent = whatsappSent
            ? 'WhatsApp message sent to your number.'
            : 'WhatsApp confirmation is not connected yet, but your appointment request has been recorded.';
        }
      } catch (whatsappError) {
        if (whatsappStatus) whatsappStatus.textContent = 'Your request has been recorded. We could not send the WhatsApp confirmation right now.';
      }

      steps.forEach(step => step.hidden = true);
      if (success) success.hidden = false;
      if (count) count.textContent = 'Done';
    } catch (error) {
      submit.disabled = false;
      submit.textContent = oldText;
      const step = form.querySelector('[data-booking-step="6"]');
      let errorBox = step.querySelector('.booking-submit-error');
      if (!errorBox) {
        errorBox = document.createElement('div');
        errorBox.className = 'booking-error booking-submit-error';
        step.appendChild(errorBox);
      }
      errorBox.textContent = error && error.message ? error.message : 'We could not save the request just now. Please use WhatsApp below and the same details will be sent to the practice.';
      if (whatsappFallback) whatsappFallback.hidden = false;
    }
  });
}
