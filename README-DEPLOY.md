# Deploying chrisdeanbooks.com (Cloudflare Pages + GoDaddy)

This package is a simple static website. You can deploy it for free on Cloudflare Pages, then connect your GoDaddy domain.

## 1) Create the Pages site
Option A (easiest): upload via GitHub
1. Create a GitHub account (if you don't have one).
2. Create a new repository, e.g. `chrisdeanbooks`.
3. Upload all files from this folder to the repo root (keep the `/assets` folder).
4. In Cloudflare: Workers & Pages → Create application → Pages → Connect to Git.
5. Select the repo.
6. Framework preset: **None**
7. Build command: **(leave blank)**
8. Output directory: **/** (root)

Option B: direct upload
Cloudflare also supports direct uploads for static assets. If you use it, upload the contents of this folder.

## 2) Add your custom domain
Cloudflare: Workers & Pages → your project → Custom domains → Set up a domain
Add:
- `chrisdeanbooks.com`
- (optional) `www.chrisdeanbooks.com` and redirect www → apex in Cloudflare

## 3) Point GoDaddy DNS to Cloudflare
Two approaches:

A) Best: move DNS (nameservers) to Cloudflare
- In GoDaddy: DNS → Nameservers → Change → "Custom"
- Replace with the Cloudflare nameservers provided when you add the domain zone
This is simplest long-term.

B) Keep DNS at GoDaddy
- Add/modify the records Cloudflare requests during custom domain setup (often CNAMEs).
Follow Cloudflare's prompts exactly.

## 4) Update the site content
- Books: edit `books.html` retailer links and blurbs.
- Social: edit `contact.html`.
- Newsletter: paste the provider embed code into `newsletter.html`.

## 5) Basic checks
- Test on mobile.
- Confirm https works (Cloudflare will issue SSL).
- Validate links.

## Current Cloudflare Pages production configuration (November 2026)

The live custom domains `chrisdeanbooks.com` and `www.chrisdeanbooks.com` belong to the Cloudflare Pages project `christopherdeanbooks` (not the similarly named `chrisdeanbooks` preview project). Both projects use `Windex91/chrisdeanbooks`, branch `main` for production. For the live project, set **Build output directory** to `public`, **Root directory** to repository root, and leave **Build command** blank. The previous output directory `.` served the legacy root-level HTML instead of the new `public/` website. Do not move the custom domains or modify mail DNS records.

Production catalogue is intentionally non-transactional (`public/assets/catalog.js` has `live: false`). Do not enable customer checkout until Stripe, R2 ebook storage, D1 order database, paid-order emails, shipping and policies have been tested and approved. Keep the experimental sandbox checkout branch separate from `main`.
