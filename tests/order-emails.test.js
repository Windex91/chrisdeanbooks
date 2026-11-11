import test from 'node:test';
import assert from 'node:assert/strict';
import {customerOrderEmail,ownerOrderEmail} from '../lib/order-emails.js';
const session={id:'cs_test_email',livemode:false,amount_total:3799,total_details:{amount_shipping:1300},metadata:{gst_treatment:'not_registered'},customer_details:{name:'Reader <script>alert(1)</script>'}};
const pack={title:'Wildborn',format:'Special Pack',physical:true,quantity:1};
const ebook={title:'Wildborn',format:'Ebook',physical:false,quantity:1};
const url='https://chrisdeanbooks.com/success/?access=fixture';
test('physical confirmation has packing guidance without promising ebook access',()=>{
 const html=customerOrderEmail(session,[pack],url);
 assert.match(html,/personally pack/);assert.match(html,/VIEW YOUR ORDER/);assert.match(html,/hand-drawn character artwork/);
 assert.doesNotMatch(html,/DOWNLOAD EBOOKS|seven days/);
 assert.match(html,/Total paid: A\$37.99 AUD/);assert.match(html,/Shipping: A\$13.00/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('digital confirmation retains private access link and expiry with no shipping promise',()=>{
 const html=customerOrderEmail({...session,amount_total:299,total_details:{amount_shipping:0}},[ebook],url);
 assert.match(html,/VIEW ORDER & DOWNLOAD EBOOKS/);assert.match(html,/seven days after checkout was started/);
 assert.match(html,/href="https:\/\/chrisdeanbooks.com\/success\/\?access=fixture"/);
 assert.doesNotMatch(html,/personally pack|Australian delivery address/);
 assert.match(html,/SANDBOX TEST — NO REAL ORDER/);
});
test('live mixed confirmation has both fulfilment instructions and no sandbox label',()=>{
 const html=customerOrderEmail({...session,livemode:true},[pack,ebook],url);
 assert.match(html,/personally pack/);assert.match(html,/DOWNLOAD EBOOKS/);assert.doesNotMatch(html,/SANDBOX TEST/);
});
test('owner notification preserves address and explicit Special Pack materials, escaping external text',()=>{
 const html=ownerOrderEmail(session,[pack],'reader@example.com',{name:'<img src=x>',address:{line1:'Test address',country:'AU'}});
 assert.match(html,/Special Pack fulfilment/);assert.match(html,/handwritten message/);assert.match(html,/Test address/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
});
