import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const renderer = fileURLToPath(new URL('../scripts/ex-live.mjs', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'ex-live-home-'));
const oldHome = join(directory, 'legacy');
const newHome = join(directory, 'new data');
mkdirSync(join(oldHome, 'pages'), { recursive: true });
const oldConfig = JSON.stringify({ theme: 'blueprint', mode: 'dark' });
writeFileSync(join(oldHome, 'config.json'), oldConfig);
writeFileSync(join(oldHome, 'pages', 'untouched.html'), 'legacy page');
const run = (args, input, home = newHome) => {
  const result = spawnSync(process.execPath, [renderer, ...args], {
    input, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, EX_LIVE_HOME: home, EX_LIVE_NO_OPEN: '1', CI: '1',
      AS_HTML_HOME: oldHome, AM_HOME: oldHome },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
};
after(() => rmSync(directory, { recursive: true, force: true }));

test('default config resolves only to ~/.ex-live even when legacy variables are set', () => {
  const output = run(['config'], undefined, '');
  assert(output.includes(join(homedir(), '.ex-live', 'config.json')));
  assert(!output.includes(oldHome));
});

test('custom data root owns configuration, pages and videos without inheriting old settings', () => {
  assert.equal(run(['config', 'get', 'theme']).trim(), 'ex-live');
  assert.equal(run(['config', 'get', 'mode']).trim(), 'light');
  run(['config', 'set', 'style', 'strict']);
  assert.deepEqual(JSON.parse(readFileSync(join(newHome, 'config.json'), 'utf8')), {
    style: 'strict',
  });
  run(['render', '-', '--no-open'], '# 本地页面\n\n## 说明\n内容完整。\n');
  const pageName = readdirSync(join(newHome, 'pages')).find(name => name.endsWith('.html'));
  const page = readFileSync(join(newHome, 'pages', pageName), 'utf8');
  assert(page.includes('data-theme="ex-live"'));
  assert(page.includes('data-mode="light"'));
  assert(page.includes('<main class="am-doc">'));
  assert(page.includes('content="ex-live 0.2.0"'));
  run(['video', '-', '--voice', 'off', '--no-open'],
    '# 视频\n\n## 内容\n说明完整。\n\n> 阅读说明。\n');
  assert(readdirSync(join(newHome, 'videos')).some(name => name.endsWith('.html')));
  assert.equal(readFileSync(join(oldHome, 'config.json'), 'utf8'), oldConfig);
});

test('clean only visits the new data root', () => {
  run(['clean', '--all']);
  assert.equal(readdirSync(join(newHome, 'pages')).length, 0);
  assert.equal(readdirSync(join(newHome, 'videos')).length, 0);
  assert.equal(readFileSync(join(oldHome, 'pages', 'untouched.html'), 'utf8'), 'legacy page');
});
