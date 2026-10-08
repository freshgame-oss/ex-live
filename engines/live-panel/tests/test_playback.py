"""Browser regressions for the vendored page, using independent headless Chrome.

Run from the engine directory:
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' python3 -m unittest discover -s tests -v
"""
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import livepanel as lp
from check_frames import pixel_diff


class PlaybackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.browser = lp.Chrome(lp.find_chrome(os.environ.get('CHROME')), 400, 300)
        cls.directory = tempfile.TemporaryDirectory(prefix='livepanel-playback-test-')
        cls.page = Path(cls.directory.name) / 'page.html'
        cls.original = Path(cls.directory.name) / 'original.html'
        cls.config = {
            'canvas': {'width': 400, 'height': 300, 'duration': 4},
            'theme': {'preset': 'warm', 'font': 'Arial'},
            'titlebar': {'text': 'Warm paper'},
            'machines': {
                'seq': {'type': 'cycle', 'period': 1, 'values': ['idle', 'working']},
                'count': {'type': 'counter', 'start': 123, 'rate': 20},
            },
            'elements': [
                {'type': 'box', 'x': 20, 'y': 60, 'w': 240, 'h': 80,
                 'lines': [{'runs': [{'v': 'seq', 'c': 'gr', 'size': 18}]}],
                 'when': {'var': 'seq', 'eq': 'working'}, 'then': {'glow': 'gr'}},
                {'type': 'text', 'x': 20, 'y': 180, 'runs': [{'v': 'count'}]},
                {'type': 'flow', 'path': [[20, 220], [360, 220]],
                 'period': 2, 'color': 'gr'},
            ],
        }
        config_path = Path(cls.directory.name) / 'config.json'
        config_path.write_text(json.dumps(cls.config), encoding='utf-8')
        lp.build_page(config_path, cls.page)
        # Keep the upstream fixture unchanged: it uses the historical preset name.
        original_config = json.loads(json.dumps(cls.config))
        original_config['theme']['preset'] = 'warm-paper'
        original_config_path = Path(cls.directory.name) / 'original-config.json'
        original_config_path.write_text(json.dumps(original_config), encoding='utf-8')
        lp.build_page(original_config_path, cls.original,
                      Path(__file__).parent / 'fixtures' / 'original-template.html')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.directory.cleanup()

    def setUp(self):
        self.browser.cmd('Emulation.setDeviceMetricsOverride', {
            'width': 400, 'height': 300, 'deviceScaleFactor': 1, 'mobile': False,
        })
        self.browser.cmd('Emulation.setEmulatedMedia', {'features': [
            {'name': 'prefers-reduced-motion', 'value': 'no-preference'},
        ]})

    def test_controls_pause_and_resume_from_current_frame(self):
        self.browser.open(self.page.as_uri())
        self.assertFalse(self.browser.eval('window.__livePanel.paused'))
        self.browser.eval("document.getElementById('playback').click()")
        self.assertTrue(self.browser.eval('window.__livePanel.paused'))
        self.assertEqual(self.browser.eval("document.getElementById('playback').textContent"),
                         'Resume')
        self.browser.seek(1.25)
        frame = self.browser.shot()
        time.sleep(0.15)
        self.assertEqual(self.browser.eval('window.__t'), 1.25)
        self.assertEqual(pixel_diff(self.browser, frame, self.browser.shot())[0], 0)
        self.assertEqual(self.browser.eval("(()=>{window.__livePanel.resume();const t=window.__t;window.__livePanel.pause();return t})()"), 1.25)
        self.browser.eval("document.getElementById('playback').focus()")
        self.browser.cmd('Input.dispatchKeyEvent', {
            'type': 'keyDown', 'key': ' ', 'code': 'Space', 'windowsVirtualKeyCode': 32,
        })
        self.browser.cmd('Input.dispatchKeyEvent', {
            'type': 'keyUp', 'key': ' ', 'code': 'Space', 'windowsVirtualKeyCode': 32,
        })
        time.sleep(0.15)
        self.browser.eval('window.__livePanel.pause()')
        advanced = self.browser.eval('window.__t')
        self.assertNotEqual(advanced, 1.25)
        time.sleep(0.1)
        self.assertEqual(self.browser.eval('window.__t'), advanced)
        self.assertTrue(self.browser.eval("!document.getElementById('stage').contains(document.getElementById('playback'))"))
        self.assertEqual(self.browser.eval("document.getElementById('playback').getAttribute('aria-controls')"), 'stage')

    def test_reduced_motion_initially_has_complete_frozen_state(self):
        self.browser.cmd('Emulation.setEmulatedMedia', {'features': [
            {'name': 'prefers-reduced-motion', 'value': 'reduce'},
        ]})
        self.browser.open(self.page.as_uri())
        self.assertTrue(self.browser.eval('window.__livePanel.paused'))
        self.assertEqual(self.browser.eval('window.__t'), 0)
        self.assertIn('idle', self.browser.eval("document.getElementById('stage').textContent"))
        self.assertEqual(self.browser.eval("getComputedStyle(document.getElementById('stage')).visibility"), 'visible')
        time.sleep(0.15)
        self.assertEqual(self.browser.eval('window.__t'), 0)
        self.browser.eval('window.__livePanel.resume()')
        time.sleep(0.15)
        self.assertGreater(self.browser.eval('window.__t'), 0)

    def test_switching_to_reduced_motion_pauses_live_playback(self):
        self.browser.open(self.page.as_uri())
        self.assertFalse(self.browser.eval('window.__livePanel.paused'))
        self.browser.cmd('Emulation.setEmulatedMedia', {'features': [
            {'name': 'prefers-reduced-motion', 'value': 'reduce'},
        ]})
        time.sleep(0.1)
        self.assertTrue(self.browser.eval('window.__livePanel.paused'))
        frozen = self.browser.eval('window.__t')
        time.sleep(0.1)
        self.assertEqual(self.browser.eval('window.__t'), frozen)

    def test_stage_fits_without_crop_or_control_overlap(self):
        self.browser.open(self.page.as_uri())
        self.browser.eval('window.__livePanel.pause()')
        for width, height in [(320, 568), (568, 320), (1440, 900), (200, 160)]:
            with self.subTest(viewport=(width, height)):
                self.browser.cmd('Emulation.setDeviceMetricsOverride', {
                    'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False,
                })
                self.browser.eval("window.dispatchEvent(new Event('resize'))")
                rect = self.browser.eval("""(()=>{const s=document.getElementById('stage').getBoundingClientRect(),
                    b=document.getElementById('playback').getBoundingClientRect();
                    return {left:s.left,top:s.top,right:s.right,bottom:s.bottom,
                            width:s.width,height:s.height,controlTop:b.top}})()""")
                self.assertGreaterEqual(rect['left'], -0.01)
                self.assertGreaterEqual(rect['top'], -0.01)
                self.assertLessEqual(rect['right'], width + 0.01)
                self.assertLessEqual(rect['bottom'], rect['controlTop'])
                self.assertAlmostEqual(rect['width'] / rect['height'], 4 / 3, delta=1e-6)
                self.assertLessEqual(rect['width'], 400)
                self.assertEqual(self.browser.eval('window.__error || ""'), '')

    def test_manual_matches_original_warm_paper_pixels_exactly(self):
        for t in [0, 1.25, 0.25, 3.75]:
            with self.subTest(t=t):
                self.browser.open(self.original.as_uri() + '?manual')
                self.browser.seek(t)
                original = self.browser.shot()
                self.browser.open(self.page.as_uri() + '?manual')
                self.browser.seek(t)
                self.assertTrue(self.browser.eval("document.getElementById('playback').hidden"))
                self.browser.eval('window.__livePanel.resume()')
                time.sleep(0.05)
                self.assertTrue(self.browser.eval('window.__livePanel.paused'))
                self.assertEqual(self.browser.eval('window.__t'), t)
                self.assertEqual(pixel_diff(self.browser, original, self.browser.shot(), delta=0)[0], 0)

    def test_csp_blocks_network(self):
        self.browser.open(self.page.as_uri() + '?manual')
        result = self.browser.eval("""(async()=>{
            const violations=[];
            document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
            let blocked=false;
            try {await fetch('https://example.com/live-panel-test')} catch(e) {blocked=true}
            await new Promise(r=>setTimeout(r,50));
            return {blocked,violations};
        })()""")
        self.assertTrue(result['blocked'])
        self.assertIn('connect-src', result['violations'])

    def test_script_only_sandbox_has_ready_complete_stage(self):
        self.browser.cmd('Page.navigate', {'url': 'about:blank'})
        self.browser.eval('document.body.innerHTML=""')
        probe = """<script>(function poll(){if(!window.__ready){setTimeout(poll,10);return}
            window.__livePanel.pause();let isolated=false;
            try{parent.document.body}catch(e){isolated=true}
            parent.postMessage({ready:true,isolated,text:document.getElementById('stage').textContent,
                error:window.__error||''},'*');})();</script>"""
        html = self.page.read_text(encoding='utf-8') + probe
        result = self.browser.eval("""new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('sandbox not ready')),8000);
            window.addEventListener('message',function receive(e){
                if(e.source!==frame.contentWindow)return;
                clearTimeout(timer);window.removeEventListener('message',receive);resolve(e.data);
            });
            const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
            frame.srcdoc=%s;document.body.appendChild(frame);
        })""" % json.dumps(html))
        self.assertTrue(result['ready'])
        self.assertTrue(result['isolated'])
        self.assertIn('Warm paper', result['text'])
        self.assertEqual(result['error'], '')

    def test_embedded_text_cannot_escape_json_script(self):
        config = dict(self.config, titlebar={'text': '<!--<script></script><img src=x onerror=alert(1)>'})
        path = Path(self.directory.name) / 'injection.json'
        page = Path(self.directory.name) / 'injection.html'
        path.write_text(json.dumps(config), encoding='utf-8')
        lp.build_page(path, page)
        self.browser.open(page.as_uri() + '?manual')
        self.assertEqual(self.browser.eval("document.querySelector('.tb').textContent"), config['titlebar']['text'])
        self.assertEqual(self.browser.eval("document.querySelectorAll('img').length"), 0)

    def test_html_attribute_colour_and_size_injection_is_rejected(self):
        for run in [{'t': 'test', 'c': 'gr);\" onmouseover=\"alert(1)'},
                    {'t': 'test', 'size': '18;\" onmouseover=\"alert(1)'}]:
            with self.subTest(run=run):
                config = dict(self.config, elements=[{'type': 'text', 'x': 20, 'y': 80, 'runs': [run]}])
                path = Path(self.directory.name) / 'bad.json'
                page = Path(self.directory.name) / 'bad.html'
                path.write_text(json.dumps(config), encoding='utf-8')
                lp.build_page(path, page)
                with self.assertRaisesRegex(RuntimeError, 'page error'):
                    self.browser.open(page.as_uri() + '?manual')
                self.assertEqual(self.browser.eval("document.querySelectorAll('[onmouseover]').length"), 0)


if __name__ == '__main__':
    unittest.main()
