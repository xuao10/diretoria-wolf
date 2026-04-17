import asyncio, json
try:
    from playwright.async_api import async_playwright
except ImportError:
    pass

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        errors = []
        page.on('console', lambda msg: errors.append(msg.text) if msg.type in ['error', 'warning'] else None)
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        await page.goto('http://localhost:6061/')
        await page.wait_for_timeout(3000)
        await page.evaluate("switchView('view-producao')")
        await page.wait_for_timeout(1000)
        print(json.dumps(errors))
        await browser.close()

asyncio.run(run())
