# Website palette history

Original theme preserved before the palette change on 10 November 2026.
Source commit: d593c5d6f69741aacd133a51627505ef41d8e749.

Original: charcoal background #090b0e; panels #101317 / #161a1e; ivory #f4f0e9; muted text #aaa9a8; gold #d5b37a / #f0d4a1.
The complete original stylesheet is `original-charcoal-gold.css`, including gradients and page-specific colours.

New requested palette: #101923 background, #1E2B36 panels, #F5F0E6 text, #C59B60 accents, #768C9C borders and decoration. Secondary text uses a lighter ivory/slate tint #A9B6BD for readability.

## Restore the original colours
Copy `docs/theme-backups/original-charcoal-gold.css` to `public/assets/style.css`, change the stylesheet version query on every public HTML page to a new unique value, and restore HTML theme-color to #0a0c0d. Test and deploy normally. Do not reset the repository to the old commit, since that could remove later shop or content changes.
