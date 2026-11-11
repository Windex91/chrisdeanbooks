import {COUNTRIES} from './shipping-countries.js';
// Rates in AUD cents; immutable version stored on each Checkout session.
export const RATE_VERSION='20261111';
export const REGIONS={1:{name:'New Zealand',rates:[2500,3400,4100],postage:[2160,2900,3640]},2:{name:'Asia Pacific',rates:[3000,4400,5700],postage:[2685,3940,5195]},3:{name:'USA & Canada',rates:[3400,4900,6300],postage:[2995,4360,5740]},4:{name:'UK & Europe / Australia Post Zone 4',rates:[4000,5500,7000],postage:[3555,4990,6420]},5:{name:'Rest of World',rates:[4900,6800,8700],postage:[4380,6250,8115]}};
export const BOOK_WEIGHTS={'beneath-falling-leaves-paperback':500,'wildborn-paperback':240,'the-glass-tapestry-paperback':330};
// Fail closed until actual packing trials, costs and destination requirements
// are documented. Do not populate these from the visitor's request.
export const SHIPPING_APPROVALS={reviewedUntil:'',countries:[],profiles:[]};
export const BLOCKED={US:'US shipping requires verified customs and prepaid-duty arrangements before checkout can be enabled.',UM:'US territories require additional customs arrangements.',PR:'US territories require additional customs arrangements.',VI:'US territories require additional customs arrangements.',GU:'US territories require additional customs arrangements.',AS:'US territories require additional customs arrangements.',MP:'US territories require additional customs arrangements.',RU:'Australia Post services are suspended.',SD:'Australia Post services are suspended.',IR:'Australia Post services are suspended.',IQ:'Australia Post services are suspended.',XK:'Australia Post services are suspended.',CU:'Australia Post services are suspended.',AR:'Australia Post service resumption must be confirmed.',IT:'Incoming parcels are subject to a customs hold; manual review is required.'};
export function parcelForCart(cart){
 let quantity=0,grams=0,packs=0;const lines=[];
 for(const {sku,quantity:q,item} of cart){
  if(!item.physical)continue;
  const weight=BOOK_WEIGHTS[item.stockSku||sku];if(!weight)throw Error('Physical product weight is not configured');
  const pack=item.format==='Special Pack';quantity+=q;packs+=pack?q:0;grams+=(weight+(pack?100:0))*q;lines.push(sku+':'+q);
 }
 if(!Number.isSafeInteger(grams)||!Number.isSafeInteger(quantity))throw Error('Invalid cart weight');
 return {quantity,packs,grams:quantity?grams+100:0,signature:lines.sort().join('|')};
}
export function shippingForCart(cart,country='AU',approvals=SHIPPING_APPROVALS){
 const parcel=parcelForCart(cart);if(!parcel.quantity)return null;
 if(typeof country!=='string'||!/^[A-Z]{2}$/.test(country))return {...parcel,allowed:false,code:'country',message:'Please select a delivery country.'};
 if(country==='AU')return {...parcel,country,allowed:true,cents:1295,version:RATE_VERSION,displayName:'Australia Post tracked delivery — flat rate'};
 const destination=COUNTRIES[country],base={...parcel,country,allowed:false,code:'quote',message:'Please contact us for an international shipping quote. Packaging and destination arrangements need to be confirmed.'};
 if(!destination)return {...base,code:'unsupported',message:'Automatic shipping is not available for this destination. Please contact us.'};
 if(BLOCKED[country])return {...base,code:'destination_review',message:BLOCKED[country]};
 if(parcel.grams>1500)return {...base,code:'overweight',message:'This international order exceeds 1.5kg. Please contact us for a shipping quote.'};
 const bracket=parcel.grams<=500?0:parcel.grams<=1000?1:2,region=REGIONS[destination.zone];
 base.region=region.name;base.zone=destination.zone;
 // Exact tested combinations prevent weight alone from implying mailer fit.
 const profile=approvals.profiles.find(p=>p.signature===parcel.signature&&p.fitVerified===true&&p.dimensionsMm?.length===3&&p.dimensionsMm.every(n=>Number.isFinite(n)&&n>0)&&Number.isInteger(p.packagingCents)&&p.packagingCents>=0);
 if(!profile)return {...base,code:'packaging',message:'We need to confirm protective packaging for this combination. Please request an international shipping quote.'};
 const today=new Date().toISOString().slice(0,10);
 if(!approvals.reviewedUntil||approvals.reviewedUntil<today||!approvals.countries.includes(country))return base;
 // Approval also records the maximum payment processing allowance and any
 // sender-paid destination charges. Unknown costs cannot activate checkout.
 const cost=profile.costs?.[country];
 if(!cost||!Number.isInteger(cost.feeBps)||cost.feeBps<350||!Number.isInteger(cost.fixedCents)||cost.fixedCents<30||!Number.isInteger(cost.customsCents)||cost.customsCents<0)return base;
 const cents=region.rates[bracket],subtotal=cart.reduce((n,e)=>n+e.item.expectedCents*e.quantity,0);
 if(cents<region.postage[bracket]+profile.packagingCents+Math.ceil((subtotal+cents)*cost.feeBps/10000)+cost.fixedCents+cost.customsCents)return {...base,code:'cost_review',message:'This order needs an individual postage quote to cover packaging and delivery safely.'};
 return {...parcel,country,allowed:true,cents,version:RATE_VERSION,zone:destination.zone,region:region.name,displayName:'Australia Post International Standard tracked — '+region.name};
}
export function verifyShippingSession(session,items){
 const physical=items.some(x=>x.physical),address=session.collected_information?.shipping_details||session.shipping_details;
 if(!physical){if((session.total_details?.amount_shipping||0)!==0)throw Error('Unexpected digital postage');return;}
 const meta=session.metadata||{};
 // Honour pre-migration sessions at the previously approved Australian rate.
 if(!meta.shipping_version){if(address?.address?.country!=='AU')throw Error('Missing Australian shipping address');return;}
 if(meta.shipping_version!==RATE_VERSION||address?.address?.country!==meta.shipping_country)throw Error('Shipping destination mismatch');
 const cart=items.map(x=>({...x,item:{physical:x.physical,stockSku:x.sku.endsWith('-special-pack')?x.sku.replace('-special-pack','-paperback'):x.sku,format:x.format}}));
 const parcel=parcelForCart(cart);if(String(parcel.grams)!==meta.shipping_grams)throw Error('Shipping weight mismatch');
 let cents=1295;
 if(meta.shipping_country!=='AU'){
  const zone=COUNTRIES[meta.shipping_country]?.zone;if(!zone||parcel.grams>1500)throw Error('Invalid international shipping');
  cents=REGIONS[zone].rates[parcel.grams<=500?0:parcel.grams<=1000?1:2];
 }
 if(String(cents)!==meta.shipping_cents||(session.total_details?.amount_shipping||0)!==cents)throw Error('Shipping amount mismatch');
}
