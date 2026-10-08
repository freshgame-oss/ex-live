import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const sandbox = mkdtempSync(join(tmpdir(), 'ex-live-'));
const installed = join(sandbox, 'skills', 'ex-live');
const dataDir = join(sandbox, 'data');
cpSync(source, installed, {
  recursive: true,
  filter: path => !relative(source, path).split('/').some(part =>
    ['.git', 'node_modules', '.DS_Store'].includes(part) || part.endsWith('.tgz')),
});
const renderer = join(installed, 'scripts', 'ex-live.mjs');
const run = (args, input) => spawnSync(process.execPath, [renderer, ...args], {
  cwd: sandbox,
  input,
  encoding: 'utf8',
  env: { ...process.env, EX_LIVE_HOME: dataDir },
  timeout: 15000,
});
const success = (args, input) => {
  const result = run(args, input);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
};
const render = (name, input) => {
  const output = join(sandbox, `${name}.html`);
  success(['render', '-', '--style', 'strict', '--no-open', '-o', output], input);
  return output;
};
after(() => rmSync(sandbox, { recursive: true, force: true }));

test('standalone skill contains its runtime and matching version metadata', () => {
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  const skill = readFileSync(join(installed, 'SKILL.md'), 'utf8');
  assert.equal(manifest.name, 'ex-live');
  assert.equal(success(['--version']).trim(), manifest.version);
  assert(skill.includes(`version: "${manifest.version}"`));
  assert.deepEqual(manifest.pi.skills, ['./SKILL.md']);
  assert(existsSync(join(installed, 'scripts/ex-live.css')));
  assert(!existsSync(join(dirname(installed), 'as-html')));
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.md')) {
        for (const [, link] of readFileSync(file, 'utf8').matchAll(/\]\(([^\s)]+)\)/g)) {
          if (/^(https?:|#)/.test(link)) continue;
          const target = resolve(dirname(file), link.split('#')[0]);
          assert(!relative(installed, target).startsWith('..'), `${file}: ${link}`);
          assert(existsSync(target), `${file}: missing ${link}`);
        }
      }
    }
  };
  visit(installed);
});

for (const [language, unit, procedural, descriptive] of [
  ['Chinese', '字', 30, 40],
  ['English', 'word ', 20, 25],
]) {
  for (const [kind, prefix, limit] of [
    ['procedure', '1. ', procedural],
    ['description', '', descriptive],
  ]) {
    test(`${language} ${kind} accepts ${limit} and rejects ${limit + 1}`, () => {
      const draft = count => `# Limits\n\n${prefix}${unit.repeat(count)}。\n`;
      assert(success(['lint', '-', '--style', 'strict'], draft(limit)).includes('0 条警告'));
      const rejected = run(['lint', '-', '--style', 'strict'], draft(limit + 1));
      assert.equal(rejected.status, 1);
      assert(rejected.stdout.includes('[sentence-length]'));
    });
  }
}

test('installed renderer generates the bundled example without sibling skills', () => {
  const output = join(sandbox, 'example.html');
  success(['render', join(installed, 'examples/explanation.md'), '--style', 'strict',
    '--no-open', '-o', output]);
  const html = readFileSync(output, 'utf8');
  assert(html.includes('data-theme="ex-live"'));
  assert(html.includes('data-style="strict"'));
  assert(html.includes('lang="zh-CN"'));
  assert(html.includes('与 ASD-STE100 的关系'));
  assert(html.includes('id="am-source"'));
  assert(html.includes('<svg'));
  assert(html.includes('--accent: #D97757;'));
});

test('patch updates one panel while a rejected render or patch preserves the page', () => {
  const output = render('patch', '# 检查\n\n## A 结论\n原结论。\n\n## B 证据\n保留证据。\n');
  const replacement = join(sandbox, 'panel.md');
  writeFileSync(replacement, '## A 结论\n新结论。\n');
  success(['patch', output, '--panel', 'A', '--from', replacement, '--style', 'strict', '--no-open']);
  const original = readFileSync(output, 'utf8');
  assert(original.includes('新结论。'));
  assert(original.includes('保留证据。'));
  assert(!original.includes('原结论。'));
  const invalid = `## A 结论\n${'字'.repeat(41)}。\n`;
  writeFileSync(replacement, invalid);
  for (const args of [
    ['render', '-', '--style', 'strict', '--no-open', '-o', output],
    ['patch', output, '--panel', 'A', '--from', replacement, '--style', 'strict', '--no-open'],
    ['patch', output, '--panel', 'missing', '--from', replacement, '--style', 'strict', '--no-open'],
  ]) {
    assert.equal(run(args, invalid).status, 1);
    assert.equal(readFileSync(output, 'utf8'), original);
  }
});

test('script markup and executable link protocols stay inert', () => {
  const output = render('escaped', [
    '# 安全检查', '', '## 内容',
    '[危险链接](javascript:alert(1))',
    '![危险图片](javascript:alert(2))',
    '<script>alert("xss")</script>', '',
  ].join('\n'));
  const html = readFileSync(output, 'utf8');
  assert(!html.includes('href="javascript:'));
  assert(!html.includes('src="javascript:'));
  assert(!html.includes('<script>alert("xss")</script>'));
  assert(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
});

test('video renders a timeline and captions without a narration service', () => {
  const draft = [
    '---', 'title: 视频检查', 'lang: zh', 'style: strict', '---',
    '> 先给结论。', '', '## 核对来源',
    '```flow LR', '[内容稿] -> [来源]', '```',
    '> [内容稿] 必须有依据。', '> [来源] 支持结论。', '',
  ].join('\n');
  const output = join(sandbox, 'video.html');
  success(['video', '-', '--voice', 'off', '--style', 'strict', '--no-open', '-o', output], draft);
  const html = readFileSync(output, 'utf8');
  assert(html.includes('data-video'));
  assert(html.includes('id="amv-data"'));
  assert(!html.includes('id="amv-audio"'));
  assert(html.includes('支持结论'));
});

test('old upstream update settings do not advertise another project', () => {
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ update_check: true }));
  const config = success(['config']);
  assert(!config.includes('update_check'));
  assert(!config.includes('answer-me-with-html-always'));
  const output = success(['render', '-', '--style', 'strict', '--no-open', '-o',
    join(sandbox, 'offline.html')], '# 本地页面\n\n内容完整。\n');
  assert(!output.includes('npx skills update'));
  assert(!output.includes('更新提示'));
});

test('clean dry-run leaves generated pages intact', () => {
  const output = join(dataDir, 'pages', 'preserved.html');
  success(['render', '-', '--style', 'strict', '--no-open', '-o', output], '# 保留文件\n\n内容。\n');
  const before = readFileSync(output, 'utf8');
  assert(success(['clean', '--all', '--dry-run']).includes('去掉 --dry-run 执行'));
  assert.equal(readFileSync(output, 'utf8'), before);
});

test('help, component docs and invalid command exits remain available', () => {
  for (const topic of ['format', 'flow', 'patch', 'video']) {
    assert(success(['help', topic]).trim().length > 30);
  }
  assert(success(['list']).includes('ex-live'));
  assert.equal(run(['unknown-command']).status, 2);
  assert.equal(run(['render', '/missing-ex-live-input']).status, 2);
});
