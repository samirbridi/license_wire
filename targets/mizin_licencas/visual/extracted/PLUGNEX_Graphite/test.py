from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content((root/'plugnex.html').read_text());page.wait_for_timeout(250)
    assert page.locator('tbody tr').count()==6
    page.screenshot(path=str(root/'reference/catalog.png'))
    page.locator('[data-view="Updates"]').click(); assert page.locator('tbody tr').count()==2
    page.screenshot(path=str(root/'reference/updates.png'))
    page.locator('[data-view="Licenses"]').click();page.screenshot(path=str(root/'reference/licenses.png'))
    page.locator('[data-view="Settings"]').click();page.screenshot(path=str(root/'reference/settings.png'))
    page.locator('[data-view="Discover"]').click();page.locator('#search').fill('WebSlide');assert page.locator('tbody tr').count()==1
    page.locator('[data-action="WebSlide"]').click();assert 'Installed' in page.locator('tbody').inner_text()
    page.locator('[data-view="Updates"]').click();page.locator('[data-action="Web Arena"]').click();assert page.locator('tbody tr').count()==1
    page.locator('[data-view="Licenses"]').click();page.locator('[data-action="WebSlide"]').click();assert 'Activated' in page.locator('#detail').inner_text()
    assert not errors,errors
    print('PASS: catalog, search, tab navigation, simulated installation, update, activation, no page errors. Captures 1440x900.')
    browser.close()
