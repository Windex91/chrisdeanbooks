"""Render site in isolated browser memory. Useful if localhost browsing is blocked."""
import asyncio, base64, re
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[1]/'public'

def embed(rel):
    html=(root/rel).read_text()
    html=re.sub(r'<link[^>]+fonts\.googleapis[^>]+>', '', html)
    html=re.sub(r'<link[^>]+fonts\.gstatic[^>]+>', '', html)
    html=html.replace('<link rel="stylesheet" href="/assets/style.css">','<style>'+(root/'assets/style.css').read_text()+'</style>')
    for f in (root/'assets/img').glob('*.webp'):
        data='data:image/webp;base64,'+base64.b64encode(f.read_bytes()).decode()
        html=html.replace('/assets/img/'+f.name,data)
    for script in ['catalog.js','app.js']:
        html=html.replace(f'<script src="/assets/{script}" defer></script>', '<script>'+(root/'assets'/script).read_text()+'</script>')
        html=html.replace(f'<script src="/assets/{script}"></script>', '<script>'+(root/'assets'/script).read_text()+'</script>')
    return html

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'])
        out=root.parent.parent
        for width,height,name in [(1440,900,'desktop'),(390,844,'mobile')]:
            page=await browser.new_page(viewport={'width':width,'height':height})
            await page.set_content(embed('index.html'),wait_until='domcontentloaded')
            assert await page.locator('h1').first.is_visible()
            assert await page.evaluate('document.documentElement.scrollWidth')<=width
            if name=='mobile':
                await page.locator('.mobile-toggle').click()
                assert await page.locator('.main-nav').is_visible()
                await page.locator('.mobile-toggle').click()
            await page.screenshot(path=str(out/f'chris-dean-books-{name}.png'),full_page=True)
            await page.close()
        page=await browser.new_page(viewport={'width':1200,'height':900})
        await page.set_content(embed('shop/index.html'),wait_until='domcontentloaded')
        await page.locator('[data-add="wildborn-paperback"]').click()
        assert await page.locator('.cart-count').inner_text()=='1'
        assert await page.locator('.cart-drawer').get_attribute('aria-hidden')=='false'
        assert await page.locator('#cart-subtotal').inner_text()=='A$25.00'
        assert await page.locator('#checkout-button').is_disabled()
        await page.screenshot(path=str(out/'chris-dean-books-shop.png'))
        await page.close()
        await browser.close()
    print('PASS: responsive layout, mobile nav, cart, format pricing, checkout lock')

if __name__=='__main__': asyncio.run(main())
