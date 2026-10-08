import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, lstatSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const engineRoot = fileURLToPath(new URL('../engines/live-panel/', import.meta.url));
const presets = { '4:5': [1200, 1500], '3:4': [1080, 1440], '1:1': [1080, 1080] };
const themes = ['warm-paper', 'terminal-dark', 'light-pastel'];
const machineTypes = ['counter', 'cycle', 'gauge', 'any_low', 'lane', 'triggers'];
const elementTypes = ['text', 'box', 'path', 'line', 'glyph', 'rule', 'flow', 'tarrow', 'log'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (valid, path, expected) => {
  if (!valid) throw new Error(`${path}：${expected}`);
};
const number = (value, path, min = -Infinity, max = Infinity) =>
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    path, `需要 ${min} 到 ${max} 之间的有限数字`);
const list = (value, path, min = 1) =>
  requireValue(Array.isArray(value) && value.length >= min, path, `需要至少 ${min} 项的数组`);
const record = (value, path) => requireValue(object(value), path, '需要 JSON 对象');
const text = (value, path) => requireValue(typeof value === 'string', path, '需要文字');
const points = (value, path, min = 2) => {
  list(value, path, min);
  value.forEach((point, i) => {
    requireValue(Array.isArray(point) && point.length === 2, `${path}[${i}]`, '需要 [x, y]');
    point.forEach((v, j) => number(v, `${path}[${i}][${j}]`));
  });
};

// Validate the input boundary before any file is written. Layout remains the frame checker's job.
export function parseLivePanel(input) {
  const config = JSON.parse(input);
  record(config, 'config');
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      requireValue(!['__proto__', 'constructor', 'prototype'].includes(key), `${path}.${key}`, '保留字段名');
      if (typeof child === 'number') number(child, `${path}.${key}`);
      walk(child, `${path}.${key}`);
    }
  };
  walk(config, 'config');
  for (const key of ['meta', 'canvas', 'theme', 'clock', 'titlebar', 'credit', 'machines']) {
    if (config[key] !== undefined) record(config[key], key);
  }
  const cv = config.canvas ?? {};
  if (cv.preset !== undefined) requireValue(Object.hasOwn(presets, cv.preset), 'canvas.preset', '支持 4:5、3:4、1:1');
  const [width, height] = presets[cv.preset] ?? presets['4:5'];
  config.canvas = { width, height, duration: 30, fps: 30, ...cv };
  for (const key of ['width', 'height']) {
    number(config.canvas[key], `canvas.${key}`, 64, 8192);
    requireValue(Number.isInteger(config.canvas[key]), `canvas.${key}`, '需要整数');
  }
  number(config.canvas.duration, 'canvas.duration', 0.1, 600);
  number(config.canvas.fps, 'canvas.fps', 1, 120);
  config.theme = { preset: 'warm-paper', ...config.theme };
  requireValue(themes.includes(config.theme.preset), 'theme.preset', themes.join('、'));
  if (config.theme.colors !== undefined) {
    record(config.theme.colors, 'theme.colors');
    for (const [name, color] of Object.entries(config.theme.colors)) {
      requireValue(/^[-\w]+$/.test(name), `theme.colors.${name}`, '颜色名只能含字母、数字、下划线与连字符');
      text(color, `theme.colors.${name}`);
    }
  }
  for (const key of ['fontSize', 'lineHeight', 'packetSize', 'borderWidth', 'wireWidth']) {
    if (config.theme[key] !== undefined) number(config.theme[key], `theme.${key}`, 0.1, 1024);
  }
  if (config.clock) {
    requireValue(typeof config.clock.start === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(config.clock.start), 'clock.start', '需要 HH:MM:SS');
    number(config.clock.rate, 'clock.rate');
  }
  const color = (value, path) => {
    if (value !== undefined) requireValue(typeof value === 'string' && /^[-\w]+$/.test(value), path, '需要颜色名称');
  };
  const machines = config.machines ?? {};
  for (const [id, m] of Object.entries(machines)) {
    const p = `machines.${id}`;
    requireValue(/^[a-zA-Z][\w-]*$/.test(id), p, '状态机名称需要以字母开头');
    record(m, p);
    for (const key of ['color', 'lowColor', 'highColor', 'busyColor', 'doneColor', 'hl']) color(m[key], `${p}.${key}`);
    for (const key of ['t0', 'start', 'rate', 'phase', 'callsStart', 'seed']) {
      if (m[key] !== undefined) number(m[key], `${p}.${key}`);
    }
    requireValue(machineTypes.includes(m.type), `${p}.type`, machineTypes.join('、'));
    if (['cycle', 'gauge', 'lane', 'triggers'].includes(m.type)) number(m.period, `${p}.period`, 0.05, 86400);
    if (['cycle', 'gauge'].includes(m.type)) {
      list(m.values, `${p}.values`);
      if (m.type === 'gauge') {
        m.values.forEach((v, i) => number(v, `${p}.values[${i}]`));
        number(m.threshold, `${p}.threshold`);
        for (const key of ['low', 'high']) {
          if (m[key] !== undefined) {
            record(m[key], `${p}.${key}`);
            for (const field of ['label', 'dest']) if (m[key][field] !== undefined) text(m[key][field], `${p}.${key}.${field}`);
          }
        }
        if (m.decimals !== undefined) {
          number(m.decimals, `${p}.decimals`, 0, 10);
          requireValue(Number.isInteger(m.decimals), `${p}.decimals`, '需要整数');
        }
      } else {
        m.values.forEach((v, i) => requireValue(typeof v === 'string' || object(v), `${p}.values[${i}]`, '需要文字或对象'));
        if (m.order !== undefined) {
          list(m.order, `${p}.order`);
          m.order.forEach((v, i) => requireValue(Number.isInteger(v) && v >= 0 && v < m.values.length,
            `${p}.order[${i}]`, '需要有效的 values 索引'));
        }
      }
    }
    if (m.type === 'lane') {
      number(m.run, `${p}.run`, 0, m.period);
      number(m.off, `${p}.off`);
      text(m.busy, `${p}.busy`);
      list(m.done, `${p}.done`);
      if (m.spin !== undefined) {
        list(m.spin, `${p}.spin`);
        m.spin.forEach((v, i) => text(v, `${p}.spin[${i}]`));
      }
      if (m.spinStep !== undefined) number(m.spinStep, `${p}.spinStep`, 0.001);
      m.done.forEach((v, i) => text(v, `${p}.done[${i}]`));
    }
    if (m.type === 'triggers') {
      number(m.on, `${p}.on`, 0, m.period);
      number(m.t0, `${p}.t0`);
      list(m.items, `${p}.items`);
      if (m.tokens !== undefined) {
        record(m.tokens, `${p}.tokens`);
        number(m.tokens.start, `${p}.tokens.start`);
        number(m.tokens.step, `${p}.tokens.step`);
      }
      m.items.forEach((item, i) => {
        record(item, `${p}.items[${i}]`);
        text(item.name, `${p}.items[${i}].name`);
        list(item.adv, `${p}.items[${i}].adv`);
        item.adv.forEach((v, j) => text(v, `${p}.items[${i}].adv[${j}]`));
      });
    }
    if (m.type === 'any_low') {
      list(m.of, `${p}.of`);
      m.of.forEach(id => requireValue(machines[id]?.type === 'gauge', `${p}.of`, `找不到 gauge ${id}`));
    }
    if (m.log !== undefined) {
      record(m.log, `${p}.log`);
      color(m.log.c, `${p}.log.c`);
      if (['gauge', 'lane'].includes(m.type)) {
        list(m.log.msgs, `${p}.log.msgs`);
        m.log.msgs.forEach((v, i) => {
          if (m.type === 'lane') list(v, `${p}.log.msgs[${i}]`);
          else text(v, `${p}.log.msgs[${i}]`);
        });
      }
      if (m.type === 'triggers') {
        for (const key of ['start', 'end']) {
          record(m.log[key], `${p}.log.${key}`);
          text(m.log[key].m, `${p}.log.${key}.m`);
        }
      }
    }
  }
  const flow = (f, p) => {
    record(f, p);
    style(f, p);
    if (f.path !== undefined) points(f.path, `${p}.path`);
    number(f.period, `${p}.period`, 0.05, 86400);
    if (f.offsets !== undefined) {
      list(f.offsets, `${p}.offsets`);
      f.offsets.forEach((v, i) => number(v, `${p}.offsets[${i}]`));
    }
  };
  const condition = (value, path) => {
    if (value === undefined) return;
    if (Array.isArray(value)) { value.forEach((v, i) => condition(v, `${path}[${i}]`)); return; }
    record(value, path);
    text(value.var, `${path}.var`);
    if (value.in !== undefined) list(value.in, `${path}.in`);
  };
  const style = (value, path) => {
    condition(value.when, `${path}.when`);
    for (const key of ['c', 'color', 'fill', 'sw', 'bg', 'glow', 'packet']) color(value[key], `${path}.${key}`);
    if (value.size !== undefined) number(value.size, `${path}.size`, 1, 1024);
    if (value.then !== undefined) { record(value.then, `${path}.then`); style(value.then, `${path}.then`); }
  };
  const runs = (value, path) => {
    list(value, path, 0);
    value.forEach((run, i) => {
      if (typeof run === 'string') return;
      const p = `${path}[${i}]`;
      record(run, p); style(run, p);
      for (const key of ['t', 'v']) if (run[key] !== undefined) text(run[key], `${p}.${key}`);
    });
  };
  const bar = (value, path) => {
    record(value, path);
    for (const key of ['c', 'low', 'high']) color(value[key], `${path}.${key}`);
    for (const key of ['w', 'h']) if (value[key] !== undefined) number(value[key], `${path}.${key}`, 1);
    if (value.gauge !== undefined) {
      requireValue(machines[value.gauge]?.type === 'gauge', `${path}.gauge`, '找不到 gauge 状态机');
    } else if (value.segments !== undefined) {
      list(value.segments, `${path}.segments`);
      value.segments.forEach((s, i) => {
        record(s, `${path}.segments[${i}]`);
        number(s.from, `${path}.segments[${i}].from`, 0, 1);
        number(s.to, `${path}.segments[${i}].to`, s.from, 1);
        color(s.c, `${path}.segments[${i}].c`);
      });
    } else number(value.fixed, `${path}.fixed`, 0, 1);
    if (value.mark !== undefined) number(value.mark, `${path}.mark`, 0, 1);
  };
  const trigger = (id, index, path) => requireValue(machines[id]?.type === 'triggers' &&
    Number.isInteger(index) && index >= 0 && index < machines[id].items.length, path,
    '需要有效的 triggers 状态机与条目索引');
  const line = (value, path) => {
    if (typeof value === 'string') return;
    record(value, path); style(value, path);
    if (value.t !== undefined) text(value.t, `${path}.t`);
    if (value.runs !== undefined) runs(value.runs, `${path}.runs`);
    if (value.trigger !== undefined) {
      requireValue(Array.isArray(value.trigger) && value.trigger.length === 2, `${path}.trigger`, '需要 [状态机名称, 条目索引]');
      trigger(value.trigger[0], value.trigger[1], `${path}.trigger`);
    }
    if (value.items !== undefined) {
      list(value.items, `${path}.items`);
      value.items.forEach((item, i) => {
        const p = `${path}.items[${i}]`;
        record(item, p);
        if (item.bar !== undefined) bar(item.bar, `${p}.bar`);
        if (item.runs !== undefined) runs(item.runs, `${p}.runs`);
        requireValue(item.bar !== undefined || item.runs !== undefined, p, '需要 runs 或 bar');
      });
    }
  };
  list(config.elements, 'elements');
  config.elements.forEach((e, i) => {
    const p = `elements[${i}]`;
    record(e, p);
    style(e, p);
    if (e.runs !== undefined) runs(e.runs, `${p}.runs`);
    requireValue(elementTypes.includes(e.type), `${p}.type`, elementTypes.join('、'));
    if (['text', 'box', 'glyph', 'rule', 'log'].includes(e.type)) {
      number(e.x, `${p}.x`); number(e.y, `${p}.y`);
    }
    if (['box', 'rule', 'log'].includes(e.type)) number(e.w, `${p}.w`, 1);
    if (e.type === 'box') {
      number(e.h, `${p}.h`, 1);
      if (e.pad !== undefined) {
        requireValue(Array.isArray(e.pad) && e.pad.length >= 2 && e.pad.length <= 3, `${p}.pad`, '需要 [top,left,right?]');
        e.pad.forEach((v, j) => number(v, `${p}.pad[${j}]`, 0));
      }
      if (e.lines !== undefined) {
        list(e.lines, `${p}.lines`, 0);
        e.lines.forEach((value, j) => line(value, `${p}.lines[${j}]`));
      }
    }
    if (e.type === 'path') {
      points(e.points, `${p}.points`);
      if (e.flow !== undefined) flow(e.flow, `${p}.flow`);
    }
    if (e.type === 'flow') { points(e.path, `${p}.path`); flow(e, p); }
    if (['line', 'tarrow'].includes(e.type)) points([e.from, e.to], p);
    if (e.type === 'tarrow') trigger(e.machine, e.i, p);
    if (e.type === 'log') {
      if (e.rows !== undefined) requireValue(Number.isInteger(e.rows) && e.rows >= 1 && e.rows <= 100, `${p}.rows`, '需要 1–100 整数');
      list(e.cols, `${p}.cols`);
      e.cols.forEach((c, j) => {
        record(c, `${p}.cols[${j}]`);
        requireValue(['time', 'who', 'm', 'g'].includes(c.key), `${p}.cols[${j}].key`, '未知日志列');
        number(c.x, `${p}.cols[${j}].x`);
      });
    }
  });
  if (config.credit) {
    style(config.credit, 'credit');
    if (config.credit.runs !== undefined) runs(config.credit.runs, 'credit.runs');
  }
  return config;
}

export function buildLivePage(config) {
  const template = readFileSync(join(engineRoot, 'assets/template.html'), 'utf8');
  const blob = JSON.stringify(config).replace(/</g, '\\u003c');
  return template.replace('<!--LIVE_CONFIG-->', () =>
    `<script id="live-config" type="application/json">${blob}</script>`);
}

export function liveFrame(page, config, escape) {
  const { width, height } = config.canvas;
  const title = config.meta?.title || '动态面板';
  return `<figure class="am-live" style="max-width:${width}px;margin:0 auto">\n` +
    `<div style="position:relative;aspect-ratio:${width}/${height};min-height:160px;padding-bottom:44px;box-sizing:content-box">` +
    `<iframe title="${escape(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" ` +
    `srcdoc="${escape(page)}" style="position:absolute;inset:0;display:block;border:0;width:100%;height:100%"></iframe>` +
    `</div></figure>`;
}

export function bundlePaths(file) {
  const stem = file.replace(/\.html?$/i, '');
  return { source: `${stem}.md`, live: `${stem}-live.html`, config: `${stem}-live.json`, mp4: `${stem}-live.mp4` };
}

// Stage the complete bundle before replacing files; restore previous bytes on a write/rename error.
export function writeBundle(file, result, previous) {
  if (result.live || previous?.live) requireValue(/\.html?$/i.test(file), file, '组合页面的输出扩展名必须是 .html 或 .htm');
  const paths = bundlePaths(file);
  // A patch may replace generated outputs, but must not overwrite separately edited copies.
  if (previous && (result.live || previous.live)) {
    const owned = new Map([[paths.source, previous.source]]);
    if (previous.live) {
      owned.set(paths.live, previous.live.html);
      owned.set(paths.config, `${JSON.stringify(previous.live.config, null, 2)}\n`);
    }
    const replaced = result.live ? [paths.source, paths.live, paths.config] : [paths.source];
    for (const path of replaced) {
      if (!existsSync(path)) continue;
      requireValue(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), path, '输出目标必须是普通文件');
      requireValue(owned.has(path) && readFileSync(path, 'utf8') === owned.get(path), path,
        '文件在主页面之外被修改；请把修改合入源稿后重新 render，原文件已保留');
    }
  }
  const outputs = new Map([[file, result.html]]);
  if (result.live || previous?.live) outputs.set(paths.source, result.source);
  if (result.live) {
    outputs.set(paths.live, result.live.html);
    outputs.set(paths.config, `${JSON.stringify(result.live.config, null, 2)}\n`);
  }
  if (!result.live && previous?.live) {
    for (const [path, value] of [[paths.live, previous.live.html],
      [paths.config, `${JSON.stringify(previous.live.config, null, 2)}\n`]]) {
      if (existsSync(path) && lstatSync(path).isFile() && readFileSync(path, 'utf8') === value) outputs.set(path, null);
    }
  }
  const originals = new Map();
  const staged = new Map();
  const changed = [];
  try {
    for (const [path, value] of outputs) {
      if (existsSync(path)) requireValue(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), path, '输出目标必须是普通文件');
      originals.set(path, existsSync(path) ? readFileSync(path) : null);
      if (value === null) continue;
      const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
      writeFileSync(temp, value, { flag: 'wx' });
      staged.set(path, temp);
    }
    for (const [path, value] of outputs) {
      if (value === null) unlinkSync(path);
      else { renameSync(staged.get(path), path); staged.delete(path); }
      changed.push(path);
    }
  } catch (error) {
    for (const path of changed.reverse()) {
      const old = originals.get(path);
      if (old === null) unlinkSync(path);
      else writeFileSync(path, old);
    }
    throw error;
  } finally {
    for (const temp of staged.values()) if (existsSync(temp)) unlinkSync(temp);
  }
  return [...outputs].filter(([, value]) => value !== null).map(([path]) => path);
}

export function exportLiveMp4(file, env) {
  const paths = bundlePaths(file);
  const temporary = join(dirname(file), `.${basename(paths.mp4)}.${process.pid}.mp4`);
  requireValue(!existsSync(temporary), temporary, '临时视频已存在，请核对后清理');
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [join(engineRoot, 'scripts/render.py'), '--config', paths.config,
      '--out', temporary], { env, stdio: ['ignore', 'inherit', 'inherit'] });
    const failed = error => {
      if (existsSync(temporary)) unlinkSync(temporary);
      reject(error);
    };
    child.on('error', failed);
    child.on('exit', (code, signal) => {
      if (code !== 0) return failed(new Error(`live-panel 视频导出失败（${signal || code}），HTML 与旧 MP4 已保留`));
      try { renameSync(temporary, paths.mp4); resolve(paths.mp4); }
      catch (error) { failed(error); }
    });
  });
}
