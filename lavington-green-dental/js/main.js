document.addEventListener('DOMContentLoaded', () => {
  // Mobile navigation
  const burger=document.querySelector('.hamburger');
  const navlinks=document.querySelector('.navlinks');
  if(burger&&navlinks){
    burger.addEventListener('click',()=>{
      const open=navlinks.classList.toggle('open');
      burger.classList.toggle('active',open);
      burger.setAttribute('aria-expanded',String(open));
    });
    navlinks.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
      navlinks.classList.remove('open'); burger.classList.remove('active'); burger.setAttribute('aria-expanded','false');
    }));
  }

  // Active nav
  const here=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.navlinks a').forEach(a=>{
    if(a.getAttribute('href')===here) a.classList.add('active');
  });

  // Scroll reveal
  const revealEls=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window&&revealEls.length){
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:.12});
    revealEls.forEach(el=>io.observe(el));
  }else revealEls.forEach(el=>el.classList.add('in'));

  // Why panel
  const whyPanel=document.querySelector('[data-why-panel]');
  const whyItems=document.querySelectorAll('[data-why]');
  const whyCopy=[
    ['01 · Experience','People you can trust with your care.','Our principal dentists bring long careers in dental healthcare and lead a wider team of qualified clinicians and administrative staff.'],
    ['02 · Comprehensive care','A wider range of care under one roof.','From prevention and general treatment to cosmetic, paediatric, orthodontic and prosthetic care, the practice supports different stages of a patient journey.'],
    ['03 · Modern diagnostics','Clearer decisions start with good information.','The practice has invested in equipment including intraoral digital X ray and regularly upgrades its facility in line with new technology.'],
    ['04 · Insurance','Less friction before treatment begins.','The practice works with a broad range of insurance providers and corporate organisations, helping patients understand the practical side of care.'],
    ['05 · Patient focused','Care that gives you time and clarity.','The experience is designed around explanation, questions and a calmer path from consultation through follow up.']
  ];
  if(whyPanel&&whyItems.length){
    whyItems.forEach(item=>item.addEventListener('click',()=>{
      const i=Number(item.dataset.why)||0;
      whyItems.forEach(x=>x.classList.toggle('active',x===item));
      const [k,t,p]=whyCopy[i];
      whyPanel.innerHTML='<div class="why-panel-media"><img src="assets/clinic/Team in clinic.jpeg" alt="Lavington Green Dental Suite clinical team"></div>'+
        '<div class="why-panel-content why-fade"><div class="why-panel-kicker">'+k+'</div><h3 class="why-panel-title">'+t+'</h3><p class="why-panel-copy">'+p+'</p></div>';
    }));
  }

  // Patient journey: update active step as it enters view
  const journey=document.querySelector('[data-journey]');
  if(journey&&'IntersectionObserver' in window){
    const steps=[...journey.querySelectorAll('.j-step')];
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){steps.forEach(s=>s.classList.toggle('active',s===e.target));}});
    },{rootMargin:'-35% 0px -45% 0px',threshold:0});
    steps.forEach(s=>io.observe(s));
  }

  // Booking chat
  const chat=document.querySelector('[data-booking-chat]');
  if(chat){
    const steps=[...chat.querySelectorAll('.booking-step')];
    let current=0;
    const count=chat.querySelector('[data-booking-count]');
    const name=chat.querySelector('#booking-name');
    const phone=chat.querySelector('#booking-phone');
    const email=chat.querySelector('#booking-email');
    const date=chat.querySelector('#booking-date');
    const time=chat.querySelector('#booking-time');
    const service=chat.querySelector('[data-booking-service]');
    const feeling=chat.querySelector('[data-booking-feeling]');
    const summary=chat.querySelector('[data-booking-summary]');
    const fallback=chat.querySelector('[data-booking-whatsapp]');
    const setStep=n=>{
      current=Math.max(0,Math.min(steps.length-1,n));
      steps.forEach((s,i)=>s.classList.toggle('active',i===current));
      if(count) count.textContent=(current+1)+' of '+steps.length;
    };
    chat.querySelectorAll('.booking-next').forEach(b=>b.addEventListener('click',()=>{
      if(current===0 && (!name||!name.value.trim())){name?.focus();return;}
      if(current===1 && (!phone||!phone.value.trim())){phone?.focus();return;}
      if(current===2 && !service?.value){return;}
      if(current===3 && (!date?.value||!time?.value)){date?.focus();return;}
      if(current===4 && !feeling?.value){return;}
      setStep(current+1);
      if(current===4 && summary){
        summary.innerHTML='<strong>Appointment request</strong><br>Name: '+escapeHtml(name.value.trim())+'<br>Phone: '+escapeHtml(phone.value.trim())+
          (email?.value.trim()?'<br>Email: '+escapeHtml(email.value.trim()):'')+
          '<br>Service: '+escapeHtml(service.value)+'<br>Preferred: '+escapeHtml(date.value)+' · '+escapeHtml(time.value)+
          '<br>Feeling: '+escapeHtml(feeling.value);
        const message='Hi Lavington Green Dental Suite, my name is '+name.value.trim()+'. I would like to request an appointment for '+service.value+' on '+date.value+' at '+time.value+'. I feel '+feeling.value.toLowerCase()+'.';
        if(fallback) fallback.href='https://wa.me/254706820099?text='+encodeURIComponent(message);
      }
    }));
    chat.querySelectorAll('.booking-back').forEach(b=>b.addEventListener('click',()=>setStep(current-1)));
    chat.querySelectorAll('[data-service-choices] .booking-choice').forEach(b=>b.addEventListener('click',()=>{
      chat.querySelectorAll('[data-service-choices] .booking-choice').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected'); if(service) service.value=b.dataset.value;
    }));
    chat.querySelectorAll('[data-feeling-choices] .booking-choice').forEach(b=>b.addEventListener('click',()=>{
      chat.querySelectorAll('[data-feeling-choices] .booking-choice').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected'); if(feeling) feeling.value=b.dataset.value;
    }));
    name?.addEventListener('input',()=>{const preview=chat.querySelector('[data-name-preview]'); if(preview) preview.textContent=name.value.trim()||'there';});
    chat.querySelector('form')?.addEventListener('submit',e=>{
      e.preventDefault();
      const message='Hi Lavington Green Dental Suite, my name is '+(name?.value||'')+'. I would like to request an appointment for '+(service?.value||'a dental visit')+
        ' on '+(date?.value||'')+' at '+(time?.value||'')+'. '+(feeling?.value||'')+'. '+(chat.querySelector('[name="message"]')?.value||'');
      window.open('https://wa.me/254706820099?text='+encodeURIComponent(message),'_blank');
    });
  }

  // Four-case clinical results viewer: one large case at a time.
  const viewer=document.querySelector('[data-case-viewer]');
  const cases=[
    {title:'Tartar removal',before:'assets/before-after/tartat removal before.png',after:'assets/before-after/tartat removal after.png'},
    {title:'Crowns',before:'assets/before-after/Crowns before.png',after:'assets/before-after/Crowns after.png'},
    {title:'Whitening',before:'assets/before-after/Whitening before.png',after:'assets/before-after/Whitening after.png'},
    {title:'Orthodontics',before:'assets/before-after/Ortho before.png',after:'assets/before-after/Ortho after.png'}
  ];
  if(viewer){
    let index=0;
    const beforeWrap=viewer.querySelector('.compare-before');
    const handle=viewer.querySelector('.compare-handle');
    const beforeImg=viewer.querySelector('[data-case-before]');
    const afterImg=viewer.querySelector('[data-case-after]');
    const title=document.querySelector('[data-case-title]');
    const count=document.querySelector('[data-case-count]');
    const setPos=x=>{
      const r=viewer.getBoundingClientRect(); let pct=((x-r.left)/r.width)*100; pct=Math.max(0,Math.min(100,pct));
      beforeWrap.style.clipPath='inset(0 '+(100-pct)+'% 0 0)';
      handle.style.left=pct+'%';
    };
    let dragging=false;
    viewer.addEventListener('pointerdown',e=>{dragging=true;setPos(e.clientX);viewer.setPointerCapture?.(e.pointerId);});
    viewer.addEventListener('pointermove',e=>{if(dragging)setPos(e.clientX);});
    viewer.addEventListener('pointerup',()=>{dragging=false;});
    const render=()=>{
      const c=cases[index]; beforeImg.src=c.before;afterImg.src=c.after;
      beforeImg.alt='Before '+c.title.toLowerCase();afterImg.alt='After '+c.title.toLowerCase();
      if(title) title.textContent=c.title;if(count) count.textContent=String(index+1).padStart(2,'0')+' / 04';
      setPos(viewer.getBoundingClientRect().left+viewer.getBoundingClientRect().width/2);
      document.querySelectorAll('[data-case-dot]').forEach((d,i)=>d.classList.toggle('active',i===index));
    };
    document.querySelector('[data-case-next]')?.addEventListener('click',()=>{index=(index+1)%cases.length;render();});
    document.querySelector('[data-case-prev]')?.addEventListener('click',()=>{index=(index-1+cases.length)%cases.length;render();});
    document.querySelectorAll('[data-case-dot]').forEach((d,i)=>d.addEventListener('click',()=>{index=i;render();}));
    render();
  }

  // Keep the comparison layer draggable if another compare-slider remains on an inner page.
  document.querySelectorAll('[data-compare]').forEach(el=>{
    const before=el.querySelector('.cs-before'), handle=el.querySelector('.cs-handle'); if(!before||!handle)return;
    let active=false;
    const setPos=x=>{const r=el.getBoundingClientRect();let pct=((x-r.left)/r.width)*100;pct=Math.max(0,Math.min(100,pct));before.style.clipPath=`inset(0 ${100-pct}% 0 0)`;handle.style.left=pct+'%';};
    el.addEventListener('pointerdown',e=>{active=true;setPos(e.clientX);});
    window.addEventListener('pointermove',e=>{if(active)setPos(e.clientX);});
    window.addEventListener('pointerup',()=>active=false);
  });

  function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
});