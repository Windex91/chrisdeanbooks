(()=>{
  'use strict';
  const STORE=window.CD_STORE;
  const $=(sel,root=document)=>root.querySelector(sel);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const money=(cents)=>'A$'+new Intl.NumberFormat('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
  const key='chris-dean-book-bag-v1';
  let pricesReady=false;
  let checkoutReady=false;
  let quoteReady=false, quoteSequence=0;
  let cart={};
  try { const parsed=JSON.parse(localStorage.getItem(key)||'{}'); if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cart=parsed; }catch{}
  const available=(sku)=>Boolean(STORE.products[sku])&&!STORE.products[sku].saleDisabled;
  function sanitize(){cart=Object.fromEntries(Object.entries(cart).filter(([k,v])=>available(k)&&Number.isInteger(v)&&v>0).map(([k,v])=>[k,Math.min(v,STORE.products[k].maxQuantity)]).filter(([,v])=>v>0));}
  function save(){sanitize();try{localStorage.setItem(key,JSON.stringify(cart))}catch{}renderCart();}
  function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>el.classList.remove('show'),3000);}
  function openCart(){document.body.classList.add('cart-open');$('.cart-drawer')?.setAttribute('aria-hidden','false');$('.cart-drawer .icon-button')?.focus();}
  function closeCart(){document.body.classList.remove('cart-open');$('.cart-drawer')?.setAttribute('aria-hidden','true');$('.cart-toggle')?.focus();}
  function add(sku){if(!available(sku)||STORE.products[sku].maxQuantity<1)return;cart[sku]=Math.min((cart[sku]||0)+1,STORE.products[sku].maxQuantity);save();openCart();toast('Added to your book bag');}
  function renderCart(){sanitize();const count=Object.values(cart).reduce((a,b)=>a+b,0);$$('.cart-count').forEach(el=>el.textContent=String(count));const items=$('#cart-items');if(!items)return;
    if(!count){items.innerHTML='<div class="empty-cart">Your book bag is empty.<br>There are worlds waiting to be discovered.</div>';}
    else items.innerHTML=Object.entries(cart).map(([sku,q])=>{const p=STORE.products[sku];return `<div class="cart-item"><img src="${p.image}" alt="${p.title} cover"><div><h3>${p.title}</h3><span class="kind">${p.format}</span><div class="qty-row"><button data-qty="${sku}" data-delta="-1" aria-label="Remove one ${p.format}">−</button><span>${q}</span><button data-qty="${sku}" data-delta="1" aria-label="Add one ${p.format}" ${q>=p.maxQuantity?'disabled':''}>+</button><button class="remove-item" data-remove="${sku}">Remove</button></div></div><strong class="price">${money(p.price*q)}</strong></div>`;}).join('');
    $('#cart-subtotal').textContent=money(Object.entries(cart).reduce((sum,[sku,q])=>sum+STORE.products[sku].price*q,0));
    const checkout=$('#checkout-button');checkout.disabled=!count||!checkoutReady||!pricesReady;checkout.style.opacity=(!count||!checkoutReady||!pricesReady)?'.52':'1';checkout.style.cursor=(!count||!checkoutReady||!pricesReady)?'not-allowed':'pointer';$('#checkout-note').textContent=!checkoutReady?'Checkout will open after payment and delivery testing is complete.':!pricesReady?'Loading verified prices from our payment provider…':!count?'Add a book to continue.':'';
    updateShipping();
  }
  document.addEventListener('click',e=>{
    const addButton=e.target.closest('[data-add]');if(addButton){add(addButton.dataset.add);return;}
    const selected=e.target.closest('[data-add-selected]');if(selected){const active=$('.edition.selected');if(active)add(active.dataset.edition);return;}
    const edition=e.target.closest('[data-edition]');if(edition){$$('.edition').forEach(el=>el.classList.toggle('selected',el===edition));return;}
    const qty=e.target.closest('[data-qty]');if(qty){const sku=qty.dataset.qty;cart[sku]=Math.min(STORE.products[sku].maxQuantity,(cart[sku]||0)+Number(qty.dataset.delta));if(cart[sku]<=0)delete cart[sku];save();return;}
    const remove=e.target.closest('[data-remove]');if(remove){delete cart[remove.dataset.remove];save();return;}
    if(e.target.closest('[data-open-cart],.cart-toggle')){openCart();return;}
    if(e.target.closest('[data-close-cart]')){closeCart();return;}
    if(e.target.closest('.mobile-toggle')){const on=document.body.classList.toggle('nav-open');$('.mobile-toggle').setAttribute('aria-expanded',String(on));return;}
    if(e.target.closest('.main-nav a')){document.body.classList.remove('nav-open');$('.mobile-toggle')?.setAttribute('aria-expanded','false');}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('cart-open'))closeCart();});
  $$('.shelf-tab').forEach(button=>button.addEventListener('click',()=>{$$('.shelf-tab').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});const kind=button.dataset.filter;$$('[data-status]').forEach(tile=>{tile.hidden=kind!=='all'&&tile.dataset.status!==kind;});}));
  async function updateShipping(){
    const sequence=++quoteSequence, button=$('#checkout-button');quoteReady=false;
    if(!button)return;button.disabled=true;
    const physical=Object.keys(cart).some(sku=>!sku.endsWith('-ebook'));
    if($('#delivery-country-wrap'))$('#delivery-country-wrap').hidden=!physical;
    if($('#shipping-enquiry'))$('#shipping-enquiry').hidden=true;
    if($('#shipping-message'))$('#shipping-message').textContent='';
    if($('#cart-shipping'))$('#cart-shipping').textContent='—';
    if($('#cart-total'))$('#cart-total').textContent='—';
    if(!pricesReady||!checkoutReady||!Object.keys(cart).length)return;
    const country=$('#delivery-country')?.value||'AU';
    try{
      const res=await fetch('/api/shipping-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country,items:Object.entries(cart).map(([sku,quantity])=>({sku,quantity}))})});
      const data=await res.json();if(sequence!==quoteSequence)return;
      if(!res.ok||!Number.isSafeInteger(data.subtotal))throw Error(data.error||'Unable to calculate shipping. Please try again.');
      $('#cart-subtotal').textContent=money(data.subtotal);
      const blocked=data.shipping&&!data.shipping.allowed;
      if($('#cart-shipping'))$('#cart-shipping').textContent=blocked?'Quote required':money(data.shipping?.cents||0);
      if($('#cart-total'))$('#cart-total').textContent=blocked?'Quote required':money(data.total);
      if($('#shipping-message'))$('#shipping-message').textContent=blocked?data.shipping.message:physical?'Tracked shipping, charged once per order. Promo codes can be entered at Stripe Checkout.':'Digital delivery — no shipping address or postage required.';
      if(blocked&&$('#shipping-enquiry')){
        const link=$('#shipping-enquiry');link.hidden=false;
        link.href='mailto:chris@chrisdeanbooks.com?subject='+encodeURIComponent('International shipping quote — '+Object.keys(cart).map(sku=>STORE.products[sku].title+' '+STORE.products[sku].format).join(', '))+'&body='+encodeURIComponent('Delivery country: '+country+'\n\n'+Object.entries(cart).map(([sku,q])=>STORE.products[sku].title+' — '+STORE.products[sku].format+' × '+q).join('\n'));
      }
      quoteReady=!blocked;button.disabled=!!blocked;button.style.opacity=blocked?'.52':'1';button.style.cursor=blocked?'not-allowed':'pointer';
      $('#checkout-note').textContent=blocked?'Your bag is saved. Requesting a quote does not place an order or take payment.':'';
    }catch(err){if(sequence===quoteSequence)$('#checkout-note').textContent=err.message;}
  }
  $('#delivery-country')?.addEventListener('change',updateShipping);
  async function loadCountries(){
    const select=$('#delivery-country');if(!select)return;
    try{const res=await fetch('/api/shipping-quote',{cache:'no-store'});if(!res.ok)return;const data=await res.json();
      if(Array.isArray(data.countries))select.innerHTML=data.countries.map(c=>'<option value="'+escapeHtml(c.code)+'">'+escapeHtml(c.name)+'</option>').join('')+'<option value="OTHER">Other destination — request a quote</option>';
    }catch{}
  }
  async function checkout(){const button=$('#checkout-button');const note=$('#checkout-note');if(!checkoutReady||!quoteReady)return;button.disabled=true;button.textContent='Opening secure checkout…';note.textContent='';try{
    const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country:$('#delivery-country')?.value||'AU',items:Object.entries(cart).map(([sku,quantity])=>({sku,quantity}))})});
    const data=await res.json();if(!res.ok||!data.url)throw new Error(data.error||'Checkout is temporarily unavailable.');
    location.assign(data.url);
  }catch(err){note.textContent=err.message||'Checkout could not be opened.';button.disabled=false;button.textContent='Continue to secure checkout ↗';}}
  $('#checkout-button')?.addEventListener('click',checkout);
  async function orderStatus(){
    const box=$('#order-status');if(!box)return;
    const params=new URLSearchParams(location.search);
    const access=params.get('access'),session=params.get('session_id');
    if(!access&&!session){box.innerHTML='<h2>No order reference found</h2><p>Please follow the link in your order confirmation email, or contact the author for help.</p>';return;}
    try{
      const query=access?'access='+encodeURIComponent(access):'session_id='+encodeURIComponent(session);
      const res=await fetch('/api/order?'+query,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok)throw Error(data.error||'Unable to check your order.');
      if(!data.paid){box.innerHTML='<h2>Payment not yet confirmed</h2><p>If you have just paid, please check your email. The confirmation link will arrive after payment is verified.</p>';return;}
      if(data.requiresEmailLink){
        box.innerHTML='<p class="eyebrow">PAYMENT CONFIRMED</p><h2>Thank you for your order.</h2><p>Your receipt and, where applicable, a private ebook download link will be emailed to the address provided at checkout. If it does not arrive, please check your spam folder or email chris@chrisdeanbooks.com.</p>';
        cart={};save();return;
      }
      const files=(data.downloads||[]).map(item=>`<a class="download-link" rel="noreferrer" href="/api/download?access=${encodeURIComponent(access)}&sku=${encodeURIComponent(item.sku)}">Download ${escapeHtml(item.title)} (${escapeHtml(item.format)}) ↓</a>`).join('');
      box.innerHTML=`<p class="eyebrow">PAYMENT CONFIRMED</p><h2>Your order is on its way.</h2><p>Thank you for supporting independent storytelling. ${data.hasPhysical?'Your paperback order will be packed and posted by the author.':''}</p>${files||'<p>No digital files are included in this order.</p>'}<p>Private ebook links expire seven days after checkout was started. Contact chris@chrisdeanbooks.com for download assistance.</p>`;
      cart={};save();
    }catch(err){box.innerHTML='<h2>Order lookup unavailable</h2><p>'+escapeHtml(err.message||'Please contact chris@chrisdeanbooks.com')+'</p>';}
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
  function syncStockButtons(){
    $('[data-add]').forEach(button=>{
      const product=STORE.products[button.dataset.add];
      const soldOut=product?.maxQuantity===0&&!product.saleDisabled;
      const unavailable=product?.saleDisabled===true;
      button.disabled=soldOut||unavailable;
      let status=button.querySelector('[data-stock-status]');
      if(soldOut||unavailable){
        if(!status){status=document.createElement('span');status.dataset.stockStatus='';button.appendChild(status);}
        status.textContent=soldOut?' · Sold out':' · Unavailable';
      }else status?.remove();
    });
  }
  async function syncLivePrices(){try{
    const res=await fetch('/api/catalog',{cache:'no-store'});const data=await res.json();if(!res.ok||!data.products)throw Error(data.error||'Cannot verify prices');
    for(const [sku,p] of Object.entries(STORE.products)){const received=data.products[sku]?.price;if(!Number.isInteger(received)||received<1)throw Error('Missing price: '+sku);p.price=received;p.saleDisabled=data.products[sku].saleDisabled===true;const stock=data.products[sku].available;if(Number.isInteger(stock)&&stock>=0)p.maxQuantity=stock;}
    $$('[data-edition]').forEach(el=>{const sku=el.dataset.edition;const price=STORE.products[sku];if(price)el.querySelector('strong').textContent=money(price.price);});
    $$('[data-price-sku]').forEach(el=>{const price=STORE.products[el.dataset.priceSku];if(price)el.textContent=money(price.price);});
    syncStockButtons();
    $$('.preview-only').forEach(el=>el.hidden=true);
    pricesReady=true;checkoutReady=true;document.body.classList.add('commerce-ready');renderCart();
    if(location.hash==='#purchase')requestAnimationFrame(()=>document.getElementById('purchase')?.scrollIntoView({block:'start'}));
  }catch(err){pricesReady=false;checkoutReady=false;document.body.classList.remove('commerce-ready');renderCart();$('#checkout-note').textContent='Price verification failed. Checkout is unavailable.';console.error('Price loading:',err.message);}}
  $$('.year').forEach(el=>el.textContent=String(new Date().getFullYear()));
  const nav=document.body.dataset.current;if(nav)$$('.main-nav a').forEach(a=>a.classList.toggle('is-current',a.dataset.nav===nav));
  renderCart();loadCountries();syncLivePrices();orderStatus();setupContact();
})();
