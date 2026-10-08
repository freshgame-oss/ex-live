import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = dirname(dirname(fileURLToPath(import.meta.url)));
const sandbox = mkdtempSync(join(tmpdir(), 'ex-live-cli-'));
const installed = join(sandbox, 'isolated skills', 'ex-live');
cpSync(skill, installed, {
  recursive: true,
  filter: path => !relative(skill, path).split(/[\\/]/).some(part =>
    ['node_modules', '.git', '__pycache__', '.DS_Store'].includes(part) || part.endsWith('.tgz')),
});
const renderer = join(installed, 'scripts', 'ex-live.mjs');
after(() => rmSync(sandbox, { recursive: true, force: true }));

function workspace(t) {
  const dir = mkdtempSync(join(sandbox, 'case with spaces '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cli(dir, args, input, extra = {}) {
  const result = spawnSync(process.execPath, [...(extra.nodeArgs ?? []), renderer, ...args], {
    cwd: dir,
    input,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '', EX_LIVE_HOME: join(dir, 'local home'),
      EX_LIVE_NO_OPEN: '1', CI: '1', ...extra.env },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `CLI terminated: ${result.signal}\n${result.stderr}`);
  return result;
}

function success(dir, args, input, extra) {
  const result = cli(dir, args, input, extra);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function rejected(dir, args, input, diagnostic, extra) {
  const result = cli(dir, args, input, extra);
  assert.notEqual(result.status, 0, 'CLI unexpectedly accepted invalid input');
  assert.match(result.stderr, diagnostic);
  return result;
}

const config = () => ({
  meta: { title: 'Simulated queue' },
  canvas: { width: 600, height: 400 },
  machines: { requests: { type: 'counter', start: 1, rate: 2 } },
  elements: [{ type: 'box', x: 40, y: 80, w: 260, h: 100,
    lines: ['Simulated requests: {requests}'] }],
});
const fence = value => `\`\`\`live-panel\n${typeof value === 'string' ? value : JSON.stringify(value)}\n\`\`\``;
const draft = value => `# Queue report\n\n## A Summary\nOriginal prose.\n\n## B Simulation\n${fence(value)}\n`;
const paths = dir => ({
  html: join(dir, 'queue report.html'),
  source: join(dir, 'queue report.md'),
  live: join(dir, 'queue report-live.html'),
  config: join(dir, 'queue report-live.json'),
  mp4: join(dir, 'queue report-live.mp4'),
});
const renderArgs = output => ['render', '-', '--template', 'doc', '--style', 'off', '--no-open', '-o', output];
const patchArgs = (output, panel) => ['patch', output, '--panel', panel, '-', '--style', 'off', '--no-open'];

function render(dir, source = draft(config())) {
  const files = paths(dir);
  success(dir, renderArgs(files.html), source);
  return files;
}

// Decode one HTML embedding layer, including ampersands last rather than recursively.
function decode(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[1].toLowerCase() === 'x'
      ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  });
}

function embeddedSource(html) {
  const match = html.match(/<textarea\b[^>]*\bid="am-source"[^>]*>([\s\S]*?)<\/textarea>/);
  assert(match, 'main page must retain its editable Markdown source');
  return decode(match[1]);
}

function assertBundle(files, source) {
  const html = readFileSync(files.html, 'utf8');
  const standalone = readFileSync(files.live, 'utf8');
  const normalized = JSON.parse(readFileSync(files.config, 'utf8'));
  const frames = [...html.matchAll(/<iframe\b[^>]*>/g)];
  assert.equal(frames.length, 1, 'one live fence must produce one iframe');
  const frame = frames[0][0];
  assert.equal(frame.match(/\bsandbox="([^"]*)"/)?.[1], 'allow-scripts');
  assert(!frame.includes('allow-same-origin'));
  assert.equal(frame.match(/\breferrerpolicy="([^"]*)"/)?.[1], 'no-referrer');
  const srcdoc = frame.match(/\bsrcdoc="([^"]*)"/);
  assert(srcdoc, 'main HTML must work without fetching the standalone page');
  assert.equal(decode(srcdoc[1]), standalone);
  const json = standalone.match(/<script\b[^>]*\bid="live-config"[^>]*>([\s\S]*?)<\/script>/);
  assert(json, 'standalone page must carry its own configuration');
  assert.deepEqual(JSON.parse(json[1]), normalized);
  assert.equal(readFileSync(files.source, 'utf8'), source);
  assert.equal(embeddedSource(html), source);
  return { html, standalone, normalized, json: json[1] };
}

function snapshot(files) {
  return new Map(Object.values(files).filter(existsSync).map(path => [path, readFileSync(path)]));
}
function unchanged(before) {
  for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes, `${path} changed`);
}
function noTemps(dir) {
  assert(!readdirSync(dir).some(name => name.endsWith('.tmp')), 'failed bundle left staging files');
}

test('isolated installation renders a complete offline bundle from a file with spaces', t => {
  const dir = workspace(t);
  const source = draft(config());
  const input = join(dir, 'input document.md');
  const files = paths(dir);
  writeFileSync(input, source);
  assert.deepEqual(readdirSync(dirname(installed)), ['ex-live']);
  success(dir, ['render', input, '--template', 'doc', '--style', 'off', '--no-open', '-o', files.html]);
  const bundle = assertBundle(files, source);
  assert.equal(bundle.normalized.theme.preset, 'warm');
  assert.deepEqual(bundle.normalized.canvas, { width: 600, height: 400, duration: 30, fps: 30 });
  assert.deepEqual(bundle.normalized.machines, config().machines);
  assert(bundle.html.includes('Original prose.'));
  assert(!existsSync(files.mp4));
  assert.equal(readFileSync(input, 'utf8'), source);
});

test('stdin preserves source, script-closing text and replacement-string traps exactly', t => {
  const dir = workspace(t);
  const dangerous = '</script><script id="injected">globalThis.injected=1</script>' +
    '</textarea><img src=x onerror="alert(1)"> &lt; $& $$ $` $\' " &';
  const value = config();
  value.meta.title = dangerous;
  value.elements[0].lines = [dangerous];
  const source = draft(value);
  const files = render(dir, source);
  const bundle = assertBundle(files, source);
  assert.equal(bundle.normalized.meta.title, dangerous);
  assert.equal(bundle.normalized.elements[0].lines[0], dangerous);
  assert(!bundle.json.includes('<'), 'embedded JSON must not terminate its script element');
  assert(!bundle.standalone.includes('<script id="injected">'));
  assert(!bundle.html.includes('<script id="injected">'));
  assert(!bundle.html.includes('<img src=x onerror="alert(1)">'));
  success(dir, patchArgs(files.html, 'A'), '## A Summary\nUpdated prose.\n');
  const updated = embeddedSource(readFileSync(files.html, 'utf8'));
  assert(updated.includes(JSON.stringify(value)));
  assertBundle(files, updated);
});

test('prose patch updates source but preserves standalone and config bytes; live patch updates every representation', t => {
  const dir = workspace(t);
  const files = render(dir);
  const before = snapshot(files);
  const replacement = join(dir, 'replacement prose.md');
  writeFileSync(replacement, '## A Summary\nRevised prose.\n');
  success(dir, ['patch', files.html, '--panel', 'A', '--from', replacement, '--no-open']);
  assert.deepEqual(readFileSync(files.live), before.get(files.live));
  assert.deepEqual(readFileSync(files.config), before.get(files.config));
  assert.notDeepEqual(readFileSync(files.html), before.get(files.html));
  assert.notDeepEqual(readFileSync(files.source), before.get(files.source));
  const proseSource = readFileSync(files.source, 'utf8');
  assert(proseSource.includes('Revised prose.'));
  assert(!proseSource.includes('Original prose.'));
  assertBundle(files, proseSource);

  const changed = config();
  changed.canvas.width = 720;
  changed.theme = { preset: 'light' };
  changed.elements[0].lines = ['New simulated request count: {requests}'];
  success(dir, patchArgs(files.html, 'B'), `## B Simulation\n${fence(changed)}\n`);
  for (const path of [files.html, files.source, files.live, files.config]) {
    assert.notDeepEqual(readFileSync(path), before.get(path), `${path} was not updated`);
  }
  const bundle = assertBundle(files, readFileSync(files.source, 'utf8'));
  assert.equal(bundle.normalized.canvas.width, 720);
  assert.equal(bundle.normalized.theme.preset, 'light');
  assert.deepEqual(bundle.normalized.elements, changed.elements);
  assert(bundle.html.includes('Revised prose.'));
});

const invalidCases = [
  ...['terminal-dark', 'light-pastel', 'warm-paper'].map(preset => [
    `retired theme ${preset}`,
    () => ({ ...config(), theme: { preset } }),
    /theme\.preset/,
  ]),
  ['malformed JSON', '{"elements":', /live-panel/],
  ['unknown machine', () => ({ ...config(), machines: { q: { type: 'unknown' } } }), /machines\.q/],
  ['empty cycle values', () => ({ ...config(), machines: { q: { type: 'cycle', period: 1, values: [] } } }), /values/],
  ['missing gauge reference', () => ({ ...config(), machines: { q: { type: 'any_low', of: ['missing'] } } }), /machines\.q/],
  ['invalid nested lines', () => { const v = config(); v.elements[0].lines = [null]; return v; }, /elements\[0\].*lines/],
  ['invalid nested runs', () => { const v = config(); v.elements[0].lines = [{ runs: 'not an array' }]; return v; }, /runs/],
  ['invalid nested items', () => { const v = config(); v.elements[0].lines = [{ items: {} }]; return v; }, /items/],
  ['invalid condition', () => { const v = config(); v.elements[0].when = { var: 'requests', in: 'not an array' }; return v; }, /when/],
  ['invalid theme font size', () => ({ ...config(), theme: { fontSize: 'huge' } }), /theme\.fontSize/],
  ['invalid clock', () => ({ ...config(), clock: { start: 'not a clock', rate: 1 } }), /clock\.start/],
  ['invalid nested flow color', () => { const v = config(); v.elements.push({ type: 'path', points: [[0, 0], [20, 20]], flow: {period: 1, color: 7} }); return v; }, /flow.color/],
  ['invalid nested flow condition', () => { const v = config(); v.elements.push({ type: 'path', points: [[0, 0], [20, 20]], flow: {period: 1, when: { var: 'q', in: 'bad' }} }); return v; }, /flow.when/],
  ['invalid trigger reference', () => { const v = config(); v.elements[0].lines = [{ t: 'x', trigger: ['missing', 0] }]; return v; }, /trigger/],
];
for (const [name, makeValue, diagnostic] of invalidCases) {
  test(`invalid ${name} rejects render and patch without modifying the existing bundle`, t => {
    const dir = workspace(t);
    const files = render(dir);
    writeFileSync(files.mp4, 'previous video bytes');
    const before = snapshot(files);
    const value = typeof makeValue === 'function' ? makeValue() : makeValue;
    rejected(dir, renderArgs(files.html), draft(value), diagnostic);
    unchanged(before);
    rejected(dir, patchArgs(files.html, 'B'), `## B Simulation\n${fence(value)}\n`, diagnostic);
    unchanged(before);
    noTemps(dir);
  });
}

test('multiple live fences reject both an initial render and a patch adding a second block', t => {
  const dir = workspace(t);
  const files = paths(dir);
  const multiple = `${draft(config())}\n## C Another simulation\n${fence(config())}\n`;
  rejected(dir, renderArgs(files.html), multiple, /live-panel/);
  for (const path of Object.values(files)) assert(!existsSync(path), `${path} unexpectedly created`);
  render(dir);
  const before = snapshot(files);
  rejected(dir, patchArgs(files.html, 'A'), `## A Summary\n${fence(config())}\n`, /live-panel/);
  unchanged(before);
});

test('removing the fence rejects an externally edited source and preserves every file', t => {
  const dir = workspace(t);
  const files = render(dir);
  writeFileSync(files.source, 'user work outside main page');
  const before = snapshot(files);
  rejected(dir, patchArgs(files.html, 'B'), '## B Simulation\nSimulation removed.\n', /被修改/);
  unchanged(before);
  noTemps(dir);
});

for (const modified of [null, 'live', 'config']) {
  test(`removing the fence cleans owned sidecars and preserves ${modified ?? 'unrelated files'}`, t => {
    const dir = workspace(t);
    const files = render(dir);
    const unrelated = join(dir, 'queue report-notes.txt');
    writeFileSync(unrelated, 'user notes');
    writeFileSync(files.mp4, 'previous video bytes');
    if (modified) writeFileSync(files[modified], 'user-edited sidecar bytes');
    success(dir, patchArgs(files.html, 'B'), '## B Simulation\nSimulation removed.\n');
    const html = readFileSync(files.html, 'utf8');
    assert(!html.includes('<iframe'));
    assert(!embeddedSource(html).includes('```live-panel'));
    assert.equal(readFileSync(files.source, 'utf8'), embeddedSource(html));
    assert(html.includes('Simulation removed.'));
    for (const key of ['live', 'config']) {
      if (key === modified) assert.equal(readFileSync(files[key], 'utf8'), 'user-edited sidecar bytes');
      else assert(!existsSync(files[key]), `owned ${key} sidecar was not removed`);
    }
    assert.equal(readFileSync(unrelated, 'utf8'), 'user notes');
    assert.equal(readFileSync(files.mp4, 'utf8'), 'previous video bytes');
    noTemps(dir);
  });
}

test('video clearly rejects live fences; render and patch --mp4 reject documents without live config', t => {
  const dir = workspace(t);
  const files = render(dir);
  const before = snapshot(files);
  rejected(dir, ['video', '-', '--voice', 'off', '--no-open', '-o', files.html], draft(config()), /live-panel/);
  unchanged(before);
  rejected(dir, [...renderArgs(files.html), '--mp4'], '# Plain report\n\n## A Summary\nPlain prose.\n', /live-panel/);
  unchanged(before);
  rejected(dir, [...patchArgs(files.html, 'B'), '--mp4'], '## B Simulation\nNo simulation.\n', /live-panel/);
  unchanged(before);
  assert(!existsSync(files.mp4));
});

for (const key of ['live', 'config', 'source']) {
  test(`patch detects externally edited ${key} and preserves the entire bundle`, t => {
    const dir = workspace(t);
    const files = render(dir);
    writeFileSync(files[key], 'user work outside main page');
    const before = snapshot(files);
    rejected(dir, patchArgs(files.html, 'A'), '## A Summary\nUpdated prose.\n', /被修改/);
    unchanged(before);
    noTemps(dir);
  });
}

test('HTML generation requires neither Python nor a browser; unavailable export preserves HTML and old video', t => {
  const dir = workspace(t);
  const files = paths(dir);
  const noTools = join(dir, 'empty path');
  mkdirSync(noTools);
  success(dir, renderArgs(files.html), draft(config()), { env: { PATH: noTools } });
  assertBundle(files, draft(config()));
  writeFileSync(files.mp4, 'previous video');
  rejected(dir, [...renderArgs(files.html), '--mp4'], draft(config()), /Python|python3|ENOENT/,
    { env: { PATH: noTools } });
  assertBundle(files, draft(config()));
  assert.equal(readFileSync(files.mp4, 'utf8'), 'previous video');
});

test('an export that fails after writing frames does not overwrite the previous video', t => {
  const dir = workspace(t);
  const files = render(dir);
  writeFileSync(files.mp4, 'previous video');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'python3'), '#!/bin/sh\nprintf partial > "$5"\nexit 1\n', { mode: 0o755 });
  rejected(dir, [...renderArgs(files.html), '--mp4'], draft(config()), /导出失败/,
    { env: { PATH: bin } });
  assertBundle(files, draft(config()));
  assert.equal(readFileSync(files.mp4, 'utf8'), 'previous video');
  assert(!readdirSync(dir).some(name => name.startsWith('.') && name.endsWith('.mp4')));
});

for (const blocker of ['directory', 'symlink']) {
  test(`blocked ${blocker} output preserves existing bytes and cleans staging files`, t => {
    const dir = workspace(t);
    const files = paths(dir);
    writeFileSync(files.html, 'existing main page');
    writeFileSync(files.source, 'existing source');
    writeFileSync(files.live, 'existing standalone');
    const target = join(dir, 'protected target');
    writeFileSync(target, 'protected target bytes');
    if (blocker === 'directory') mkdirSync(files.config);
    else symlinkSync(target, files.config);
    const before = snapshot({ html: files.html, source: files.source, live: files.live, target });
    rejected(dir, renderArgs(files.html), draft(config()), /queue report-live\.json/);
    unchanged(before);
    assert.equal(lstatSync(files.config).isSymbolicLink(), blocker === 'symlink');
    assert.equal(lstatSync(files.config).isDirectory(), blocker === 'directory');
    noTemps(dir);
  });
}

test('rename failure after staging restores an already-replaced main page', t => {
  const dir = workspace(t);
  const files = paths(dir);
  writeFileSync(files.html, 'existing main page bytes');
  // Introduce a directory immediately before the source rename, after the main-page rename.
  // This avoids timing races and works even when permission tests run as root.
  const preload = join(dir, 'block rename.cjs');
  writeFileSync(preload, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const rename = fs.renameSync;
fs.renameSync = function (from, to) {
  if (to === process.env.TEST_BLOCK_RENAME) fs.mkdirSync(to);
  return rename(from, to);
};
syncBuiltinESMExports();
`);
  rejected(dir, renderArgs(files.html), draft(config()), /EISDIR|ENOTDIR|EPERM|EEXIST/, {
    nodeArgs: ['--require', preload], env: { TEST_BLOCK_RENAME: files.source },
  });
  assert.equal(readFileSync(files.html, 'utf8'), 'existing main page bytes');
  assert(lstatSync(files.source).isDirectory());
  assert(!existsSync(files.live));
  assert(!existsSync(files.config));
  noTemps(dir);
});
