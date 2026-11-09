import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as config} from '../functions/api/contact-config.js';
import {onRequestPost as contact} from '../functions/api/contact.js';

const site='https://site-redesign-preview-2026-1.chrisdeanbooks.pages.dev';
const env={
  RESEND_API_KEY:'re_test_dummy',
  RESEND_FROM_ADDRESS:'Christopher Dean Books <website@mail.chrisdeanbooks.com>',
  TURNSTILE_SITE_KEY:'test_site_key',
  TURNSTILE_SECRET_KEY:'test_secret_key'
};
const payload={
  name:'Reader Example',
  email:'reader@example.com',
  message:'Hello Christopher, I enjoyed the book!',
  website:'',
  turnstileToken:'valid-fake-token'
};
function request(body=payload,origin=site){
  return new Request(site+'/api/contact',{
    method:'POST',
    headers:{origin,'content-type':'application/json'},
    body:JSON.stringify(body)
  });
}

test('contact config keeps form disabled until mail and anti-spam secrets exist',async()=>{
  const off=await config({env:{}});
  assert.deepEqual(await off.json(),{enabled:false,siteKey:null});
  const on=await config({env});
  assert.deepEqual(await on.json(),{enabled:true,siteKey:'test_site_key'});
});

test('contact form does not accept messages before secure setup',async()=>{
  const response=await contact({request:request(),env:{}});
  assert.equal(response.status,503);
});

test('contact form delivers to author mailbox with reply-to set to visitor',async()=>{
  const original=globalThis.fetch;
  let actualPayload;
  globalThis.fetch=async(url,options)=>{
    if(url.includes('turnstile/v0/siteverify')){
      assert.equal(options.headers['Content-Type'],'application/json');
      assert.equal(JSON.parse(options.body).response,payload.turnstileToken);
      return new Response(JSON.stringify({success:true,hostname:new URL(site).hostname}),{status:200});
    }
    assert.equal(url,'https://api.resend.com/emails');
    actualPayload=JSON.parse(options.body);
    return new Response(JSON.stringify({id:'test_email_id'}),{status:200});
  };
  try{
    const response=await contact({request:request(),env});
    assert.equal(response.status,200);
    assert.equal((await response.json()).sent,true);
    assert.deepEqual(actualPayload.to,['chris@chrisdeanbooks.com']);
    assert.equal(actualPayload.reply_to,'reader@example.com');
    assert.match(actualPayload.html,/Hello Christopher/);
  }finally{globalThis.fetch=original;}
});

test('contact form blocks other origins',async()=>{
  const response=await contact({request:request(payload,'https://untrusted.example'),env});
  assert.equal(response.status,403);
});

test('contact form rejects Turnstile tokens verified for another hostname',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'untrusted.example'}),{status:200});
  try{
    const response=await contact({request:request(),env});
    assert.equal(response.status,400);
  }finally{globalThis.fetch=original;}
});

test('contact form distinguishes a Siteverify HTTP rejection from email delivery',async()=>{
  const original=globalThis.fetch;
  let emailRequests=0;
  globalThis.fetch=async(url,options)=>{
    if(url.includes('turnstile/v0/siteverify')){
      assert.equal(options.headers['Content-Type'],'application/json');
      return new Response(JSON.stringify({success:false,'error-codes':['invalid-input-secret']}),{status:400});
    }
    emailRequests++;
    return new Response('{}',{status:200});
  };
  try{
    const res=await contact({request:request(),env});
    const body=await res.json();
    assert.equal(res.status,502);
    assert.equal(body.diagnostic,'turnstile-http-400-invalid-input-secret');
    assert.equal(emailRequests,0);
  }finally{globalThis.fetch=original;}
});

test('contact form rejects an expired Turnstile token without sending email',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({success:false,'error-codes':['timeout-or-duplicate']}),{status:200});
  try{
    const res=await contact({request:request(),env});
    const body=await res.json();
    assert.equal(res.status,400);
    assert.equal(body.diagnostic,'turnstile-timeout-or-duplicate');
  }finally{globalThis.fetch=original;}
});

test('contact form handles non-JSON Siteverify errors without exposing credentials',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('Service error',{status:503});
  try{
    const res=await contact({request:request(),env});
    const body=await res.json();
    assert.equal(res.status,502);
    assert.equal(body.diagnostic,'turnstile-connection');
    assert.ok(!JSON.stringify(body).includes(env.TURNSTILE_SECRET_KEY));
  }finally{globalThis.fetch=original;}
});
