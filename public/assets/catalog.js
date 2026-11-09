/* Approved display prices in Australian cents. Sandbox Stripe Price IDs remain
   on the server; never put Stripe secret keys in public browser files.
   This experimental development branch uses Stripe SANDBOX ONLY. Do not merge live=true into Production. */
window.CD_STORE = Object.freeze({
  live: true,
  currency: 'AUD',
  products: {
    'beneath-falling-leaves-paperback': {title:'Beneath Falling Leaves',format:'Paperback',price:2499,image:'/assets/img/beneath-falling-leaves-2026.webp',maxQuantity:5},
    'beneath-falling-leaves-ebook': {title:'Beneath Falling Leaves',format:'Ebook (EPUB)',price:299,image:'/assets/img/beneath-falling-leaves-2026.webp',maxQuantity:1},
    'wildborn-paperback': {title:'Wildborn',format:'Paperback',price:1599,image:'/assets/img/wildborn-2026.webp',maxQuantity:5},
    'wildborn-ebook': {title:'Wildborn',format:'Ebook (EPUB)',price:299,image:'/assets/img/wildborn-2026.webp',maxQuantity:1},
    'the-glass-tapestry-paperback': {title:'The Glass Tapestry',format:'Paperback',price:1599,image:'/assets/img/the-glass-tapestry.jpg',maxQuantity:1},
    'the-glass-tapestry-ebook': {title:'The Glass Tapestry',format:'Ebook (EPUB)',price:299,image:'/assets/img/the-glass-tapestry.jpg',maxQuantity:1}
  }
});
