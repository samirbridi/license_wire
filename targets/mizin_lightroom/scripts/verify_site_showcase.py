"""Browser QA for the public site. Gallery fixtures are synthetic and never published."""
import argparse
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


R2_PUBLIC = 'https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev'


def current_release():
    """Latest local delivery as the public manifest will serve it (downloadUrl added on publish)."""
    release = json.loads((ROOT/'private/deliveries/latest.json').read_text(encoding='utf-8-sig'))
    release.setdefault('downloadUrl', f"{R2_PUBLIC}/{release['archiveName']}")
    return release


def verify(url, output):
    output.mkdir(parents=True, exist_ok=True)
    release = current_release()
    manifest = json.dumps(release)
    errors, checks = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/latest.json',lambda route:route.fulfill(content_type='application/json',body=manifest))
        page.goto(url, wait_until='networkidle')
        assert page.title().startswith('CRISPIX')
        assert page.locator('h1').count()==1
        assert page.locator('#verAtual').inner_text()==release['version']
        assert page.locator('#comparativo').is_hidden()
        assert page.locator('[data-comparison-link]').is_hidden()
        for screen in ('result','update','edit'):
            page.locator(f'#tab-{screen}').click()
            assert page.locator(f'#screen-{screen}').is_visible()
            assert page.locator('[role="tabpanel"]:visible').count()==1
        page.locator('#tab-edit').focus();page.keyboard.press('ArrowDown')
        assert page.locator('#tab-result').get_attribute('aria-selected')=='true'
        page.keyboard.press('End')
        assert page.locator('#tab-update').get_attribute('aria-selected')=='true'
        page.locator('#tab-edit').click()
        for link in page.locator('a[href^="#"]').all():
            target=link.get_attribute('href')[1:]
            assert page.locator(f'[id="{target}"]').count()==1, target
        checks += ['page semantics and section links','three screen tabs and keyboard navigation','empty gallery hidden','official release link']
        # Download password: the form appears, a wrong password is refused, the right one starts the download.
        def access(route):
            if route.request.method=='GET':
                return route.fulfill(content_type='application/json',body='{"authorized":false}')
            if json.loads(route.request.post_data or '{}').get('password')=='certa':
                return route.fulfill(content_type='application/json',body='{"ok":true}')
            return route.fulfill(status=401,content_type='application/json',body='{"ok":false}')
        page.route('**/api/download-access',access)
        page.route('**/downloads/**',lambda route:route.fulfill(content_type='text/plain',body='pacote de teste'))
        href=page.locator('#download-link').get_attribute('href')
        assert href==f"/downloads/{release['archiveName']}",href
        # The password field is visible from the start and the button never downloads without it.
        assert page.locator('#download-password').is_visible()
        assert page.locator('#download-access button').is_visible()
        page.locator('#download-access button').click()
        page.wait_for_function("document.getElementById('download-access-status').textContent.includes('Digite a senha')")
        assert not page.url.endswith(href)
        page.locator('#download-password').fill('errada');page.locator('#download-access button').click()
        page.wait_for_function("document.getElementById('download-access-status').textContent.includes('incorreta')")
        page.locator('#download-password').fill('certa')
        with page.expect_navigation():page.locator('#download-access button').click()
        assert page.url.endswith(href),page.url
        page.goto(url, wait_until='networkidle')
        checks.append('download password: wrong password refused, right one opens the published package')
        for width,scheme in ((1440,'light'),(390,'light'),(390,'dark')):
            page.set_viewport_size({'width':width,'height':1000})
            page.emulate_media(color_scheme=scheme)
            page.evaluate('document.fonts.ready')
            page.evaluate("document.activeElement.blur(); window.scrollTo({top:0,behavior:'instant'})")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),(width,scheme)
            page.screenshot(path=str(output/f'site-{width}-{scheme}.png'),full_page=True)
        checks.append('desktop/mobile light/dark without horizontal overflow')
        page.route('**/latest.json',lambda route:route.fulfill(status=503,body='Unavailable'))
        page.reload(wait_until='networkidle')
        assert 'indisponível' in page.locator('#release-status').inner_text()
        assert f"build{release['build']}" in page.locator('#download-link').get_attribute('href')
        checks.append('manifest failure preserves known download')
        # A tiny test pixel exercises slider loading without presenting invented photo results.
        pixel=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=')
        pair={'title':'Fixture de teste','caption':'Imagem sintética de QA, não publicar.','before':'assets/fixture-before.png','after':'assets/fixture-after.png'}
        page.route('**/comparisons.json',lambda route:route.fulfill(content_type='application/json',body=json.dumps([pair])))
        page.route('**/assets/fixture-*.png',lambda route:route.fulfill(content_type='image/png',body=pixel))
        page.reload(wait_until='networkidle')
        page.locator('#comparativo').wait_for(state='visible')
        slider=page.locator('#comparison-position')
        slider.focus();page.keyboard.press('Home')
        assert slider.input_value()=='0'
        assert '0%' in slider.get_attribute('aria-valuetext')
        page.keyboard.press('End')
        assert slider.input_value()=='100'
        assert page.locator('#photo-compare').evaluate("el=>el.style.getPropertyValue('--position')")=='100%'
        assert page.locator('#photo-choices button').get_attribute('aria-pressed')=='true'
        picture=page.locator('#photo-compare');picture.scroll_into_view_if_needed()
        bounds=picture.bounding_box()
        page.mouse.move(bounds['x']+bounds['width']*.2,bounds['y']+bounds['height']*.5)
        page.mouse.down();page.mouse.move(bounds['x']+bounds['width']*.8,bounds['y']+bounds['height']*.5);page.mouse.up()
        assert 79<=int(slider.input_value())<=81
        checks.append('before/after image loading, selection and keyboard slider endpoints')
        checks.append('direct dragging over the photo')
        page.route('**/assets/fixture-*.png',lambda route:route.fulfill(status=404,body='Missing'))
        page.reload(wait_until='networkidle')
        assert page.locator('#comparativo').is_hidden()
        checks.append('missing photo does not display a broken comparison')
        browser.close()
    assert not errors,errors
    receipt={'url':url,'checks':checks,'javascriptErrors':errors,'screenshotsContainRealUserPhotos':False,
             'galleryTestedWithPrivateSyntheticFixtures':True,'realPublishedPhotoPairs':0}
    (output/'qa.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8764/')
    parser.add_argument('--output',type=Path,default=ROOT/'evidence/site-identidade-cx')
    args=parser.parse_args();verify(args.url,args.output)
