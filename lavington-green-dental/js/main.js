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

/* Conversational appointment concierge */
const booking = document.querySelector('[data-booking-chat]');
if (booking) {
  const form = document.getElementById('booking-chat-form');
  const thread = booking.querySelector('[data-chat-thread]');
  const composer = booking.querySelector('[data-chat-composer]');
  const serviceInput = form.querySelector('[data-booking-service]');
  const suggestedInput = form.querySelector('[data-booking-suggested-visit]');
  const feelingInput = form.querySelector('[data-booking-feeling]');
  const concernInput = form.querySelector('[data-booking-concern]');
  const namePreview = () => state.name || 'there';

  const state = {
    stage: 'concern',
    concern: '',
    service: '',
    suggestedVisit: '',
    feeling: '',
    name: '',
    phone: '',
    email: '',
    date: '',
    time: '',
    message: '',
    savedId: ''
  };

  const serviceOptions = [
    { label:'General dental care', value:'General Dental Treatment' },
    { label:'Preventive dental care', value:'Dental Health Preventive and Promotive Services' },
    { label:'Cosmetic smile care', value:'Cosmetic Dentistry' },
    { label:'Care for a child', value:'Paediatric Dentistry' },
    { label:'Braces and teeth alignment', value:'Orthodontic Treatment' },
    { label:'Replacing missing teeth', value:'Prosthetic Dentistry' },
    { label:'Oral surgery', value:'Minor Oral Surgery' }
  ];

  const escape = value => {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };

  const addMessage = (role, text) => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-message ' + role;
    bubble.innerHTML = '<div class="chat-bubble-text">' + escape(text) + '</div>';
    thread.appendChild(bubble);
    requestAnimationFrame(() => bubble.classList.add('show'));
    thread.scrollTo({ top:thread.scrollHeight, behavior:'smooth' });
    return bubble;
  };

  const addTyping = () => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-message assistant chat-typing';
    bubble.innerHTML = '<div class="chat-bubble-text"><span></span><span></span><span></span></div>';
    thread.appendChild(bubble);
    requestAnimationFrame(() => bubble.classList.add('show'));
    thread.scrollTo({ top:thread.scrollHeight, behavior:'smooth' });
    return bubble;
  };

  const addRecommendation = () => {
    const card = document.createElement('div');
    card.className = 'chat-recommendation';
    card.innerHTML =
      '<span class="chat-recommendation-label">A good place to start</span>' +
      '<strong>' + escape(state.suggestedVisit) + '</strong>' +
      '<p>You do not need to know the final treatment. The dentist will assess what is happening and guide you from there.</p>';
    thread.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));
    thread.scrollTo({ top:thread.scrollHeight, behavior:'smooth' });
  };

  const deriveVisit = text => {
    const value = text.toLowerCase();

    if (/(wisdom|impacted|disimpaction)/.test(value)) {
      return {
        service:'Minor Oral Surgery',
        suggestedVisit:'Minor oral surgery assessment',
        reply:'That sounds like something the team should look at carefully. For wisdom tooth or other impacted tooth concerns, a minor oral surgery assessment is a sensible place to start.'
      };
    }

    if (/(missing tooth|missing teeth|denture|dentures|implant|lost tooth)/.test(value)) {
      return {
        service:'Prosthetic Dentistry',
        suggestedVisit:'Missing tooth and replacement consultation',
        reply:'I understand. When a tooth is missing, there are different ways the team may approach replacement. We can start with a consultation to look at the area and discuss the options that may suit you.'
      };
    }

    if (/(braces|crooked|straighten|alignment|align|spacing|gaps between|overbite|underbite)/.test(value)) {
      return {
        service:'Orthodontic Treatment',
        suggestedVisit:'Orthodontic consultation',
        reply:'Got it. It sounds like you are looking at the position or alignment of your teeth. An orthodontic consultation is a good starting point so the team can assess your teeth and explain the available approach.'
      };
    }

    if (/(child|kid|son|daughter|young|baby|my little)/.test(value)) {
      return {
        service:'Paediatric Dentistry',
        suggestedVisit:'Paediatric dental visit',
        reply:'Absolutely. We can make the visit comfortable and age appropriate for a younger patient. A paediatric dental visit is the right place to start.'
      };
    }

    if (/(white|whiter|whitening|smile|appearance|stain|discolou|discolor)/.test(value)) {
      return {
        service:'Cosmetic Dentistry',
        suggestedVisit:'Cosmetic smile consultation',
        reply:'That makes sense. For concerns about the appearance of your smile, we can start with a cosmetic smile consultation so the team can understand what you would like to change and explain the suitable options.'
      };
    }

    if (/(clean|cleaning|check up|check-up|checkup|routine|prevent|fluoride|sealant)/.test(value)) {
      return {
        service:'Dental Health Preventive and Promotive Services',
        suggestedVisit:'Preventive dental visit',
        reply:'That is a great reason to come in. A preventive dental visit gives the team a chance to check your oral health and discuss ways to keep your teeth and gums healthy.'
      };
    }

    if (/(pain|ache|aching|hurt|hurting|throb|sore|sensitivity|sensitive|loose|wobbly|broken|cracked|chip|chipped|filling|cavity|decay|swelling|swollen|bleeding|gum)/.test(value)) {
      return {
        service:'General Dental Treatment',
        suggestedVisit:'General dental assessment',
        reply:'I am sorry you are dealing with that. A tooth or gum problem can have different causes, so we will not try to diagnose it from a message. A general dental assessment is the right starting point so the dentist can examine what is happening and guide you on the next step.'
      };
    }

    return {
      service:'General Dental Treatment',
      suggestedVisit:'Dental consultation',
      reply:'Thank you for explaining that. You do not need to know the dental term or treatment name. We can start with a dental consultation, where the team can understand what is happening and guide you to the appropriate care.'
    };
  };

  const setComposer = html => {
    composer.innerHTML = html;
    thread.scrollTo({ top:thread.scrollHeight, behavior:'smooth' });
  };

  const button = (label, className, attributes) =>
    '<button type="button" class="' + className + '"' + (attributes || '') + '>' + escape(label) + '</button>';

  const renderConcern = () => {
    state.stage = 'concern';
    setComposer(
      '<div class="chat-question"><label for="booking-concern-text">Tell me what is going on</label>' +
      '<textarea class="booking-input chat-input" id="booking-concern-text" rows="3" maxlength="1000" placeholder="For example: I have a toothache, one of my teeth feels loose, or I want to improve my smile."></textarea>' +
      '<div class="chat-hints"><span>Not sure what it is called? That is okay.</span></div>' +
      '<div class="chat-quick">' +
      button('Something is hurting','chat-quick-button',' data-concern="Something is hurting"') +
      button('A tooth feels loose','chat-quick-button',' data-concern="A tooth feels loose"') +
      button('I want a check up','chat-quick-button',' data-concern="I want a check up"') +
      button('I want to improve my smile','chat-quick-button',' data-concern="I want to improve my smile"') +
      '</div>' +
      '<div class="chat-send-row"><button class="btn btn-primary" type="button" data-chat-send>Send</button></div></div>'
    );
    const input = composer.querySelector('#booking-concern-text');
    input.focus();
    composer.querySelectorAll('[data-concern]').forEach(choice => choice.addEventListener('click', () => {
      input.value = choice.dataset.concern;
      handleConcern(choice.dataset.concern);
    }));
    composer.querySelector('[data-chat-send]').addEventListener('click', () => handleConcern(input.value.trim()));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleConcern(input.value.trim());
      }
    });
  };

  const handleConcern = concern => {
    if (!concern) {
      inputError('Tell us a little about what is bringing you in.');
      return;
    }

    state.concern = concern;
    concernInput.value = concern;
    addMessage('patient', concern);
    composer.innerHTML = '';
    const typing = addTyping();
    window.setTimeout(() => {
      typing.remove();
      const visit = deriveVisit(concern);
      state.service = visit.service;
      state.suggestedVisit = visit.suggestedVisit;
      serviceInput.value = state.service;
      suggestedInput.value = state.suggestedVisit;
      addMessage('assistant', visit.reply);
      addRecommendation();
      setComposer(
        '<div class="chat-option-row">' +
        button('That sounds right, let us continue','btn btn-primary',' data-action="accept-recommendation"') +
        button('I want to choose another area','chat-secondary-button',' data-action="choose-service"') +
        '</div>'
      );
      composer.querySelector('[data-action="accept-recommendation"]').addEventListener('click', () => {
        addMessage('patient', 'That sounds right');
        askName();
      });
      composer.querySelector('[data-action="choose-service"]').addEventListener('click', () => {
        addMessage('patient', 'I would like to choose the type of visit');
        askServiceChoice();
      });
    }, 520);
  };

  const askServiceChoice = () => {
    state.stage = 'service';
    setComposer(
      '<div class="chat-question"><label>Which area is closest to what you need?</label>' +
      '<div class="chat-service-list">' +
      serviceOptions.map(item => button(item.label,'chat-service-button',' data-service-value="' + escape(item.value) + '" data-service-label="' + escape(item.label) + '"')).join('') +
      '</div></div>'
    );
    composer.querySelectorAll('[data-service-value]').forEach(choice => choice.addEventListener('click', () => {
      state.service = choice.dataset.serviceValue;
      state.suggestedVisit = choice.dataset.serviceLabel;
      serviceInput.value = state.service;
      suggestedInput.value = state.suggestedVisit;
      addMessage('patient', choice.dataset.serviceLabel);
      addMessage('assistant', 'Perfect. We will use that as the starting point for your appointment request.');
      askName();
    }));
  };

  const askName = () => {
    state.stage = 'name';
    setComposer(
      '<div class="chat-question"><div class="chat-mini-prompt">Before we choose a time, what should we call you?</div>' +
      '<input class="booking-input chat-input" id="booking-name-text" type="text" autocomplete="name" placeholder="Your name">' +
      '<div class="chat-send-row"><button class="btn btn-primary" type="button" data-chat-next>Continue</button></div></div>'
    );
    const input = composer.querySelector('#booking-name-text');
    input.focus();
    composer.querySelector('[data-chat-next]').addEventListener('click', () => {
      const value = input.value.trim();
      if (!value) { inputError('Please tell us your name.'); return; }
      state.name = value;
      addMessage('patient', value);
      addMessage('assistant', 'Lovely to meet you, ' + value.split(/\s+/)[0] + '. What is the best number for the practice to reach you on?');
      askContact();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        composer.querySelector('[data-chat-next]').click();
      }
    });
  };

  const askContact = () => {
    state.stage = 'contact';
    setComposer(
      '<div class="chat-question"><label for="booking-phone-text">Phone number</label>' +
      '<input class="booking-input chat-input" id="booking-phone-text" type="tel" autocomplete="tel" inputmode="tel" placeholder="0700 000 000">' +
      '<label for="booking-email-text">Email <span>optional</span></label>' +
      '<input class="booking-input chat-input" id="booking-email-text" type="email" autocomplete="email" placeholder="you@example.com">' +
      '<div class="chat-send-row"><button class="btn btn-primary" type="button" data-chat-next>Continue</button></div></div>'
    );
    const phone = composer.querySelector('#booking-phone-text');
    const email = composer.querySelector('#booking-email-text');
    phone.focus();
    composer.querySelector('[data-chat-next]').addEventListener('click', () => {
      if (!phone.value.trim()) { inputError('Please add a phone number so the practice can reach you.'); return; }
      if (email.value.trim() && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.value.trim())) {
        inputError('That email address does not look quite right.'); return;
      }
      state.phone = phone.value.trim();
      state.email = email.value.trim();
      addMessage('patient', 'Phone: ' + state.phone + (state.email ? ' · Email: ' + state.email : ''));
      askFeeling();
    });
  };

  const askFeeling = () => {
    state.stage = 'feeling';
    addMessage('assistant', 'One more thing that helps the team prepare: how are you feeling about the visit?');
    setComposer(
      '<div class="chat-quick">' +
      button('I feel relaxed','chat-choice-button',' data-feeling="I feel relaxed"') +
      button('I am a little nervous','chat-choice-button',' data-feeling="I am a little nervous"') +
      button('I am very nervous','chat-choice-button',' data-feeling="I am very nervous"') +
      button('I am not sure what to expect','chat-choice-button',' data-feeling="I am not sure what to expect"') +
      '</div>'
    );
    composer.querySelectorAll('[data-feeling]').forEach(choice => choice.addEventListener('click', () => {
      state.feeling = choice.dataset.feeling;
      feelingInput.value = state.feeling;
      addMessage('patient', state.feeling);
      addMessage('assistant', state.feeling === 'I am very nervous' || state.feeling === 'I am a little nervous'
        ? 'Thank you for telling us. We will make sure the team knows you would appreciate a calmer, more reassuring visit.'
        : 'Thank you. We have that noted for the team.');
      askDateTime();
    }));
  };

  const askDateTime = () => {
    state.stage = 'date';
    setComposer(
      '<div class="chat-question"><div class="chat-mini-prompt">When would you like to come in?</div>' +
      '<div class="booking-date-grid">' +
      '<div><label for="booking-date-text">Preferred date</label><input class="booking-input chat-input" id="booking-date-text" type="date"></div>' +
      '<div><label for="booking-time-text">Preferred time</label><select class="booking-input chat-input" id="booking-time-text"><option value="">Choose a time</option>' +
      ['9:00 am','9:30 am','10:00 am','10:30 am','11:00 am','11:30 am','12:00 pm','12:30 pm','1:00 pm','1:30 pm','2:00 pm','2:30 pm','3:00 pm','3:30 pm','4:00 pm','4:30 pm'].map(t => '<option>' + t + '</option>').join('') +
      '</select></div></div>' +
      '<p class="booking-note">Your preferred time is a request. The practice will confirm the available appointment time.</p>' +
      '<div class="chat-send-row"><button class="btn btn-primary" type="button" data-chat-next>Continue</button></div></div>'
    );
    const date = composer.querySelector('#booking-date-text');
    const time = composer.querySelector('#booking-time-text');
    const now = new Date();
    date.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    date.focus();
    composer.querySelector('[data-chat-next]').addEventListener('click', () => {
      if (!date.value || !time.value) { inputError('Choose a preferred date and time so we know when you would like to visit.'); return; }
      state.date = date.value;
      state.time = time.value;
      addMessage('patient', formatDate(date.value) + ' at ' + time.value);
      askNotes();
    });
  };

  const askNotes = () => {
    state.stage = 'notes';
    addMessage('assistant', 'Anything else you would like the team to know before your visit?');
    setComposer(
      '<div class="chat-question"><label for="booking-note-text">A little more context <span>optional</span></label>' +
      '<textarea class="booking-input chat-input" id="booking-note-text" rows="3" maxlength="1200" placeholder="Anything that may help the team prepare for you."></textarea>' +
      '<div class="chat-send-row">' +
      button('Skip','chat-secondary-button',' data-action="skip-notes"') +
      '<button class="btn btn-primary" type="button" data-chat-next>Continue</button></div></div>'
    );
    const note = composer.querySelector('#booking-note-text');
    note.focus();
    const finish = () => {
      state.message = note.value.trim();
      if (state.message) addMessage('patient', state.message);
      else addMessage('patient', 'Nothing else for now');
      showSummary();
    };
    composer.querySelector('[data-chat-next]').addEventListener('click', finish);
    composer.querySelector('[data-action="skip-notes"]').addEventListener('click', finish);
  };

  const showSummary = () => {
    state.stage = 'summary';
    addMessage('assistant', 'Perfect. Here is what I have. Please check the details before sending your appointment request.');
    const summaryCard = document.createElement('div');
    summaryCard.className = 'chat-summary';
    summaryCard.innerHTML =
      '<div><span>Starting point</span><strong>' + escape(state.suggestedVisit) + '</strong></div>' +
      '<div><span>Preferred date</span><strong>' + escape(formatDate(state.date)) + '</strong></div>' +
      '<div><span>Preferred time</span><strong>' + escape(state.time) + '</strong></div>' +
      '<div><span>How you are feeling</span><strong>' + escape(state.feeling) + '</strong></div>';
    thread.appendChild(summaryCard);
    const summaryName = document.createElement('div');
    summaryName.className = 'chat-message patient show';
    summaryName.innerHTML = '<div class="chat-bubble-text">' + escape(state.name) + '<br>' + escape(state.phone) + (state.email ? '<br>' + escape(state.email) : '') + '</div>';
    thread.appendChild(summaryName);
    thread.scrollTo({ top:thread.scrollHeight, behavior:'smooth'});

    setComposer(
      '<div class="chat-option-row">' +
      '<button class="btn btn-primary" type="submit" data-booking-submit>Request my appointment</button>' +
      '<button class="chat-secondary-button" type="button" data-action="edit-booking">I want to change something</button>' +
      '</div>' +
      '<p class="booking-disclaimer">This is an appointment request, not a confirmed slot. The practice will review your preferred time and respond.</p>'
    );
    composer.querySelector('[data-action="edit-booking"]').addEventListener('click', () => {
      addMessage('patient', 'I want to change something');
      askDateTime();
    });
  };

  const inputError = message => {
    const existing = composer.querySelector('.chat-error');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'chat-error';
    el.textContent = message;
    composer.appendChild(el);
  };

  const formatDate = value => {
    if (!value) return '';
    const [year,month,day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-KE',{day:'numeric',month:'long',year:'numeric'}).format(new Date(year,month-1,day));
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (state.stage !== 'summary') return;

    const submit = composer.querySelector('[data-booking-submit]');
    if (!submit) return;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    try {
      const saveResponse = await fetch('/.netlify/functions/save-booking', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          booking_bot: form.booking_bot ? form.booking_bot.value : '',
          name:state.name,
          phone:state.phone,
          email:state.email,
          service:state.service,
          suggested_visit:state.suggestedVisit,
          concern:state.concern,
          preferred_date:state.date,
          preferred_time:state.time,
          feeling:state.feeling,
          message:state.message
        })
      });
      const savedData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || !savedData.ok || !savedData.saved) {
        throw new Error(savedData.error || 'The appointment request could not be saved.');
      }

      state.savedId = savedData.bookingId || '';
      let whatsappSent = false;

      try {
        const whatsappResponse = await fetch('/.netlify/functions/send-booking-whatsapp', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            name:state.name,
            phone:state.phone,
            service:state.suggestedVisit || state.service,
            preferred_date:state.date,
            preferred_time:state.time,
            feeling:state.feeling
          })
        });
        const whatsappData = await whatsappResponse.json().catch(() => ({}));
        whatsappSent = whatsappResponse.ok && whatsappData.sent === true;
      } catch (error) {
        whatsappSent = false;
      }

      thread.innerHTML = '';
      const success = document.createElement('div');
      success.className = 'booking-success show';
      success.innerHTML =
        '<div class="booking-success-icon">✓</div>' +
        '<span class="eyebrow">Request received</span>' +
        '<h3>You are on the list.</h3>' +
        '<p>Your appointment request has been saved. The practice can now review what you need, your preferred time and how you are feeling before confirming the appointment.</p>' +
        (state.savedId ? '<p class="booking-id-status">Request reference: ' + escape(state.savedId) + '</p>' : '') +
        '<p class="booking-success-status">' +
          (whatsappSent ? 'A WhatsApp message confirming your request has been sent to your number.' : 'WhatsApp confirmation is not connected yet. Your appointment request has still been saved.') +
        '</p>';
      thread.appendChild(success);
      composer.innerHTML = '';
    } catch (error) {
      submit.disabled = false;
      submit.textContent = 'Request my appointment';
      inputError(error && error.message ? error.message : 'We could not save the request just now. Please try again.');
    }
  });

  renderConcern();
}
