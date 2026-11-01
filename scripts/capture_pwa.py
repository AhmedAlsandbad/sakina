from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:8000/#radio'

with sync_playwright() as p:
    browser = p.chromium.launch()

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    mobile.goto(URL, wait_until='domcontentloaded')
    mobile.wait_for_timeout(3200)
    mobile.screenshot(path=str(ROOT / 'pwa-screenshot-mobile.png'), full_page=False)
    mobile.close()

    wide = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
    wide.goto(URL, wait_until='domcontentloaded')
    wide.wait_for_timeout(3200)
    wide.screenshot(path=str(ROOT / 'pwa-screenshot-wide.png'), full_page=False)
    wide.close()

    browser.close()

print('PWA screenshots captured.')
