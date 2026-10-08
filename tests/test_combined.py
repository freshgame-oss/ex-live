"""Full-page browser checks. Run: python3 -m unittest discover -s tests -p 'test_*.py' -v."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engines/live-panel/scripts'))
import livepanel as lp


class CombinedPageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix='ex-live-browser-')
        cls.page = Path(cls.directory.name) / 'combined.html'
        subprocess.run([
            'node', str(ROOT / 'scripts/ex-live.mjs'), 'render', str(ROOT / 'examples/combined.md'),
            '--style', 'strict', '--no-open', '-o', str(cls.page),
        ], check=True, capture_output=True, timeout=15)
        cls.isolated = Path(cls.directory.name) / 'isolated'
        cls.isolated.mkdir()
        shutil.copy(cls.page, cls.isolated / 'page.html')
        cls.browser = lp.Chrome(lp.find_chrome(os.environ.get('CHROME')), 1440, 1100)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.directory.cleanup()

    def open_page(self, width, height):
        br = self.browser
        br.cmd('Emulation.setDeviceMetricsOverride', {
            'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False,
        })
        br.cmd('Network.enable')
        br.cmd('Network.emulateNetworkConditions', {
            'offline': True, 'latency': 0, 'downloadThroughput': 0, 'uploadThroughput': 0,
        })
        br.cmd('Page.navigate', {'url': (self.isolated / 'page.html').as_uri()})
        for _ in range(60):
            if br.eval('document.readyState === "complete" && !!document.querySelector(".am-live iframe")'):
                br.eval('document.fonts.ready')
                return
            time.sleep(0.05)
        self.fail('main page did not load')

    def frame_context(self):
        # Sandbox frames may be separate targets. Attach through CDP without weakening sandbox.
        br = self.browser
        for _ in range(40):
            targets = br.call('Target.getTargets')['targetInfos']
            target = next((t for t in targets if t['type'] == 'iframe'), None)
            if target:
                sid = br.call('Target.attachToTarget', {
                    'targetId': target['targetId'], 'flatten': True,
                })['sessionId']
                return sid, None
            tree = br.cmd('Page.getFrameTree')['frameTree']
            frames = tree.get('childFrames', [])
            if frames:
                context = br.cmd('Page.createIsolatedWorld', {
                    'frameId': frames[0]['frame']['id'], 'worldName': 'ex-live-check',
                })['executionContextId']
                return br.sid, context
            time.sleep(0.05)
        self.fail('embedded frame is missing')

    def frame_eval(self, sid, context, expression):
        params = {'expression': expression, 'returnByValue': True, 'awaitPromise': True}
        if context is not None:
            params['contextId'] = context
        result = self.browser.call('Runtime.evaluate', params, sid)
        if result.get('exceptionDetails'):
            self.fail(str(result['exceptionDetails']))
        return result['result'].get('value')

    def test_offline_isolated_page_and_mobile_layout(self):
        br = self.browser
        for width, height in [(1440, 1100), (390, 844), (320, 720)]:
            with self.subTest(viewport=(width, height)):
                self.open_page(width, height)
                outer = br.eval('''(()=>{const f=document.querySelector('.am-live iframe'),r=f.getBoundingClientRect();
                    return {width:innerWidth,scroll:document.documentElement.scrollWidth,
                      left:r.left,right:r.right,height:r.height,title:f.title,sandbox:f.getAttribute('sandbox')}})()''')
                self.assertLessEqual(outer['scroll'], width + 1)
                self.assertGreaterEqual(outer['left'], 0)
                self.assertLessEqual(outer['right'], width + 1)
                self.assertGreater(outer['height'], 180)
                self.assertEqual(outer['sandbox'], 'allow-scripts')
                sid, context = self.frame_context()
                result = self.frame_eval(sid, context, '''new Promise((resolve,reject)=>{let n=0;
                  const poll=()=>{const s=document.getElementById('stage'),b=document.getElementById('playback');
                    if(s?.children.length && !b.disabled){const r=s.getBoundingClientRect();
                      resolve({text:s.textContent,left:r.left,right:r.right,bottom:r.bottom,
                        width:innerWidth,controlTop:b.getBoundingClientRect().top,
                        visible:getComputedStyle(s).visibility});}
                    else if(++n>100)reject(new Error('no complete frame'));else setTimeout(poll,20)};poll()})''')
                self.assertIn('一份源稿', result['text'])
                self.assertEqual(result['visible'], 'visible')
                self.assertGreaterEqual(result['left'], -0.1)
                self.assertLessEqual(result['right'], result['width'] + 0.1)
                self.assertLessEqual(result['bottom'], result['controlTop'])
                isolated = self.frame_eval(sid, context, '(()=>{try{return !!parent.document.body}catch(e){return false}})()')
                self.assertFalse(isolated)
                # Exercise the production button through DOM even in an isolated execution world.
                self.frame_eval(sid, context, "document.getElementById('playback').click()")
                self.assertEqual(self.frame_eval(sid, context, "document.getElementById('playback').dataset.paused"), 'true')
                br.eval("document.querySelector('.am-live').scrollIntoView({block:'center'})")
                br.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                # Wait for the out-of-process iframe to repaint after scrolling into view.
                self.frame_eval(sid, context, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                image = None
                for _ in range(10):
                    image = br.shot()
                    dark = br.eval('''new Promise(resolve=>{const img=new Image();img.onload=()=>{
                      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
                      const g=c.getContext('2d');g.drawImage(img,0,0);
                      const r=document.querySelector('.am-live iframe').getBoundingClientRect();
                      const data=g.getImageData(Math.ceil(r.left+8),Math.ceil(r.top+12),
                        Math.floor(r.width-16),Math.floor(r.height-72)).data;
                      let count=0;for(let i=0;i<data.length;i+=4)if(data[i]<140&&data[i+1]<140&&data[i+2]<140)count++;
                      resolve(count)};img.src=%s})''' % json.dumps('data:image/png;base64,' + base64.b64encode(image).decode()))
                    if dark > 100:
                        break
                    time.sleep(0.05)
                self.assertGreater(dark, 100, 'iframe DOM exists but the screenshot has no visible diagram')
                screenshot = Path(os.environ.get('EX_LIVE_SCREENSHOTS', self.directory.name))
                screenshot.mkdir(parents=True, exist_ok=True)
                (screenshot / f'combined-{width}.png').write_bytes(image)
                if sid != br.sid:
                    br.call('Target.detachFromTarget', {'sessionId': sid})


if __name__ == '__main__':
    unittest.main()
