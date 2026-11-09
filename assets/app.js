(()=>{
  'use strict';
  const STORE=window.CD_STORE;
  const $=(sel,root=document)=>root.querySelector(sel);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const money=(cents)=>'A$'+new Intl.NumberFormat('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
  const key='chris-dean-book-bag-v1';
  let pricesReady=!STORE.live;
  let cart={};
  try { const parsed=JSON.parse(localStorage.getItem(key)||'{}'); if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cart=parsed; }catch{}
  const available=(sku)=>Boolean(STORE.products[sku]);
  function sanitize(){cart=Object.fromEntries(Object.entries(cart).filter(([k,v])=>available(k)&&Number.isInteger(v)&&v>0).map(([k,v])=>[k,Math.min(v,STORE.products[k].maxQuantity)]));}
  function save(){sanitize();try{localStorage.setItem(key,JSON.stringify(cart))}catch{}renderCart();}
  function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>el.classList.remove('show'),3000);}
  function openCart(){document.body.classList.add('cart-open');$('.cart-drawer')?.setAttribute('aria-hidden','false');$('.cart-drawer .icon-button')?.focus();}
  function closeCart(){document.body.classList.remove('cart-open');$('.cart-drawer')?.setAttribute('aria-hidden','true');$('.cart-toggle')?.focus();}
  const physicalCount=()=>Object.entries(cart).reduce((n,[sku,q])=>n+(sku.endsWith('-paperback')?q:0),0);
  function add(sku){
    if(!available(sku))return;
    if(sku.endsWith('-paperback')&&physicalCount()>=5){toast('Limit: five paperbacks per order');return;}
    cart[sku]=Math.min((cart[sku]||0)+1,STORE.products[sku].maxQuantity);
    save();openCart();toast('Added to your book bag');
  }
  function renderCart(){sanitize();const count=Object.values(cart).reduce((a,b)=>a+b,0);$$('.cart-count').forEach(el=>el.textContent=String(count));const items=$('#cart-items');if(!items)return;
    if(!count){items.innerHTML='<div class="empty-cart">Your book bag is empty.<br>There are worlds waiting to be discovered.</div>';}
    else items.innerHTML=Object.entries(cart).map(([sku,q])=>{const p=STORE.products[sku];return `<div class="cart-item"><img src="${p.image}" alt="${p.title} cover"><div><h3>${p.title}</h3><span class="kind">${p.format}</span><div class="qty-row"><button data-qty="${sku}" data-delta="-1" aria-label="Remove one ${p.format}">−</button><span>${q}</span><button data-qty="${sku}" data-delta="1" aria-label="Add one ${p.format}" ${q>=p.maxQuantity?'disabled':''}>+</button><button class="remove-item" data-remove="${sku}">Remove</button></div></div><strong class="price">${money(p.price*q)}</strong></div>`;}).join('');
    $('#cart-subtotal').textContent=money(Object.entries(cart).reduce((sum,[sku,q])=>sum+STORE.products[sku].price*q,0));
    const checkout=$('#checkout-button');checkout.disabled=!count||!STORE.live||!pricesReady;checkout.style.opacity=(!count||!STORE.live||!pricesReady)?'.52':'1';checkout.style.cursor=(!count||!STORE.live||!pricesReady)?'not-allowed':'pointer';$('#checkout-note').textContent=(!STORE.live?'Secure checkout is being tested. No online orders are accepted yet.':!pricesReady?'Loading verified prices from our payment provider…':!count?'Add a book to continue.':'')+
      (count?(physicalCount()?' Estimated Australia-wide standard postage: '+money(physicalCount()===1?1295:physicalCount()<=3?1695:2195)+'.':' Ebooks: no postage charge.'):'');
  }
  document.addEventListener('click',e=>{
    const addButton=e.target.closest('[data-add]');if(addButton){add(addButton.dataset.add);return;}
    const selected=e.target.closest('[data-add-selected]');if(selected){const active=$('.edition.selected');if(active)add(active.dataset.edition);return;}
    const edition=e.target.closest('[data-edition]');if(edition){$('.edition').forEach(el=>{el.classList.toggle('selected',el===edition);el.setAttribute('aria-pressed',String(el===edition));});return;}
    const qty=e.target.closest('[data-qty]');if(qty){
      const sku=qty.dataset.qty,delta=Number(qty.dataset.delta);
      if(delta>0&&sku.endsWith('-paperback')&&physicalCount()>=5){toast('Limit: five paperbacks per order');return;}
      cart[sku]=Math.min(STORE.products[sku].maxQuantity,(cart[sku]||0)+delta);
      if(cart[sku]<=0)delete cart[sku];save();return;
    }
    const remove=e.target.closest('[data-remove]');if(remove){delete cart[remove.dataset.remove];save();return;}
    if(e.target.closest('[data-open-cart],.cart-toggle')){openCart();return;}
    if(e.target.closest('[data-close-cart]')){closeCart();return;}
    if(e.target.closest('.mobile-toggle')){const on=document.body.classList.toggle('nav-open');$('.mobile-toggle').setAttribute('aria-expanded',String(on));return;}
    if(e.target.closest('.main-nav a')){document.body.classList.remove('nav-open');$('.mobile-toggle')?.setAttribute('aria-expanded','false');}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('cart-open'))closeCart();});
  $$('.shelf-tab').forEach(button=>button.addEventListener('click',()=>{$$('.shelf-tab').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});const kind=button.dataset.filter;$$('[data-status]').forEach(tile=>{tile.hidden=kind!=='all'&&tile.dataset.status!==kind;});}));
  async function checkout(){const button=$('#checkout-button');const note=$('#checkout-note');if(!STORE.live)return;button.disabled=true;button.textContent='Opening secure checkout…';note.textContent='';try{
    const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:Object.entries(cart).map(([sku,quantity])=>({sku,quantity}))})});
    const data=await res.json();if(!res.ok||!data.url)throw new Error(data.error||'Checkout is temporarily unavailable.');
    location.assign(data.url);
  }catch(err){note.textContent=err.message||'Checkout could not be opened.';button.disabled=false;button.textContent='Continue to secure checkout ↗';}}
  $('#checkout-button')?.addEventListener('click',checkout);
  async function orderStatus(){const box=$('#order-status');if(!box)return;const session=new URLSearchParams(location.search).get('session_id');if(!session){box.innerHTML='<h2>No order found</h2><p>We did not receive an order reference. Please use the confirmation link provided after checkout.</p>';return;}
    try{const res=await fetch('/api/order?session_id='+encodeURIComponent(session),{cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to check your order.');if(!data.paid){box.innerHTML='<h2>Payment not yet confirmed</h2><p>If you have just paid, please check back shortly. Downloads are only made available after payment is verified.</p>';return;}
      const files=(data.downloads||[]).map(item=>`<a class="download-link" rel="noreferrer" href="/api/download?session_id=${encodeURIComponent(session)}&sku=${encodeURIComponent(item.sku)}">Download ${item.title} (${item.format}) ↓</a>`).join('');
      box.innerHTML=`<p class="eyebrow">PAYMENT CONFIRMED</p><h2>Your order is on its way.</h2><p>Thank you for supporting independent storytelling. ${data.hasPhysical?'Your paperback order will be packed and posted by the author.':''}</p>${files||'<p>No digital files are included in this order.</p>'}`;
      cart={};save();
    }catch(err){box.innerHTML='<h2>Order lookup unavailable</h2><p>'+escapeHtml(err.message||'Please try the original order link again.')+'</p>';}
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function setupContact(){
    const form=$('#contact-form');if(!form)return;
    const status=$('.form-status',form),button=$('button[type=submit]',form);
    const fallback='The on-page form is not yet available. Please use the direct email link instead.';
    button.disabled=true;
    let config;
    try{
      const res=await fetch('/api/contact-config',{cache:'no-store'});
      if(!res.ok)throw Error('Contact service unavailable');
      config=await res.json();
      if(config.enabled!==true||typeof config.siteKey!=='string'||!config.siteKey)throw Error('Contact service not configured');
    }catch{status.textContent=fallback;return;}
    $('#turnstile-wrap').innerHTML=`<div class="cf-turnstile" data-sitekey="${escapeHtml(config.siteKey)}"></div>`;
    const scr=document.createElement('script');
    scr.src='https://challenges.cloudflare.com/turnstile/v0/api.js';scr.async=true;scr.defer=true;
    scr.onload=()=>{button.disabled=false;status.textContent='Messages will be delivered to chris@chrisdeanbooks.com.';};
    scr.onerror=()=>{button.disabled=true;status.textContent=fallback;};
    document.body.appendChild(scr);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const body=Object.fromEntries(new FormData(form).entries());
      const token=body['cf-turnstile-response'];
      if(!token){status.textContent='Please complete the anti-spam check before sending.';return;}
      button.disabled=true;status.textContent='Sending your message…';
      try{
        const res=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,turnstileToken:token})});
        const data=await res.json();
        if(!res.ok||data.sent!==true)throw Error((data.error||'Your message could not be sent.')+(data.diagnostic?' [Diagnostic: '+data.diagnostic+']':''));
        form.reset();status.textContent='Message sent to chris@chrisdeanbooks.com. Thank you!';
      }catch(err){status.textContent=err.message||'Message delivery failed. Please use the direct email link.';}
      finally{button.disabled=false;if(window.turnstile)window.turnstile.reset();}
    });
  }
  async function syncLivePrices(){if(!STORE.live)return;try{
    const res=await fetch('/api/catalog',{cache:'no-store'});const data=await res.json();if(!res.ok||!data.products)throw Error(data.error||'Cannot verify prices');
    for(const [sku,p] of Object.entries(STORE.products)){const received=data.products[sku]?.price;if(!Number.isInteger(received)||received<1)throw Error('Missing price: '+sku);p.price=received;}
    $$('[data-edition]').forEach(el=>{const sku=el.dataset.edition;const price=STORE.products[sku];if(price)el.querySelector('strong').textContent=money(price.price);});
    $$('[data-price-sku]').forEach(el=>{const price=STORE.products[el.dataset.priceSku];if(price)el.textContent=money(price.price);});
    $$('.preview-only').forEach(el=>el.hidden=true);
    pricesReady=true;renderCart();
  }catch(err){pricesReady=false;renderCart();$('#checkout-note').textContent='Price verification failed. Checkout is unavailable.';console.error('Price loading:',err.message);}}
  $$('.year').forEach(el=>el.textContent=String(new Date().getFullYear()));
  const nav=document.body.dataset.current;if(nav)$$('.main-nav a').forEach(a=>a.classList.toggle('is-current',a.dataset.nav===nav));
  renderCart();syncLivePrices();orderStatus();setupContact();
})();
