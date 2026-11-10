/* EDIT ME: These are demonstration prices, NOT a live sales catalogue.
   To take payments: confirm prices, create matching Stripe Prices, set
   live: true, and set SHOP_ENABLED=true server-side. */
window.CD_STORE = Object.freeze({
  live: false,
  currency: 'AUD',
  contactEnabled: false,
  turnstileSiteKey: '',
  products: {
    'wildborn-paperback': {title:'Wildborn',format:'Paperback',price:2500,image:'/assets/img/wildborn-3d.webp',maxQuantity:5},
    'wildborn-ebook': {title:'Wildborn',format:'Ebook',price:899,image:'/assets/img/wildborn-3d.webp',maxQuantity:1}
  }
});
