# Config schema

One JSON object. All coordinates are canvas pixels (default 1200x1500, y grows downward). Colour names refer to `theme.colors` and must contain only ASCII letters, digits, underscores or hyphens. Numeric fields must be finite JSON numbers, not CSS strings. Text is monospace; Latin glyphs are 0.6 em wide, CJK glyphs two cells.

## Top level

| key | meaning |
| --- | --- |
| `meta` | `{title, lang}` page title and language |
| `canvas` | `{preset:"4:5"|"3:4"|"1:1", width, height, duration, fps, preroll}` (explicit width/height win over the preset); `preroll` (s) is added to packet phases so delivery counters start above zero |
| `theme` | `{preset:"terminal-dark"|"warm-paper"|"light-pastel", font, fontSize, lineHeight, boxMode:"segmented"|"solid", radius, borderWidth, wireWidth, packetSize, glow, boxBg, boxShadow, barBg, barRadius, barBorder, logBg, logRadius, logShadow, pkShadow, stageShadow, colors:{name:"#rrggbb"}}`. A preset supplies the fields it lists; your values override those, `colors` are merged name by name. The surface keys (box/bar/log background, radius, border, shadow) are what make a light preset look flat-paper instead of terminal; `warm-paper` is currently the only preset that sets them, and a theme that leaves one out gets the template's CSS default. Colour names used by the engine: `bg bar line dim fg wh` (+ `line2` log frame); `dots` is kept for older configs but the template no longer reads it; add any others |
| `clock` | `{start:"HH:MM:SS", rate}`: log time at t=0 and how many log-seconds pass per second |
| `titlebar` | `{text, height?, size?}` terminal title bar with three dots |
| `credit` | footer line: `{text, y, size?, c?}` (default 12 px, centred, dim) |
| `machines` | named state machines, see below |
| `elements` | drawn in order (later = on top) |

## Elements

- `text` `{x, y, w?, align, runs | t | text, size?, lh?, c?, b?, ls?, font?, inside?}`; `y` is the vertical centre of the line. `inside:true` = intentionally drawn on top of a box (icons).
- `box` `{x, y, w, h, color (border), fill?, radius?, border? (px), dash?, container?, pad:[top,left,right?], align, sides:"solid"?, lines:[...], when?, then?:{fill,color,border,glow}}`. Lines flow at `lineHeight`. `container:true` marks a box that holds other boxes (skipped by the overlap check). `when/then` restyle the whole box while a condition holds (`glow` = colour name).
- `path` `{points:[[x,y],...], color, width?, r? (corner radius), dash?, arrow?:false, head?, opacity?, when?, then?:{color,width,opacity}, flow?:{period, offsets, color, tail, when}}` SVG polyline with arrow head; `flow` adds packets along it.
- `line` `{from:[x,y], to:[x,y], dash?, color?, width?}` axis-aligned wire.
- `glyph` `{x, y, ch, c, size}` e.g. an arrow head.
- `rule` `{x, y, w}` double rule.
- `flow` `{path:[[x,y],...], period, offsets:[...], color, gap?:[y0,y1], tail?, when?}` packets looping along a polyline. Delivery count of all flows is `{packets}`.
- `tarrow` `{machine, i, from:[x,y], to:[x,y]}` dashed arrow for trigger `i` of a `triggers` machine; coloured and carrying a packet while that trigger is lit.
- `log` `{x, y, w, rows, padTop, padBottom, padLeft, title, titleX, titleW, cols:[{key:"time|who|m|g", x}]}`. `title` defaults to `SESSION LOG`.

### Lines inside a box

A line is a string, or an object:
`{runs | t, c, b, align, indent, size, h, items, when, then, trigger}`
- `runs`: list of strings or run objects `{t | v | sw | cursor, c, b, size, when, then}`. `t` is text (may contain `{var}`), `v` a variable name, `sw` a colour swatch, `cursor` a blinking block. A run `v` that returns a coloured value uses its colour unless `c` is set.
- `items`: flex row `[{w?, grow?, ml?, align?, runs | bar}]`. `bar` is `{w, h, gauge: id}` (bound to a gauge machine) or `{w, h, segments:[{from,to,c}], mark?}` (fractions 0-1).
- `when` / `then`: condition `{var, eq|ne|in:[...]}` (a list of conditions = AND) and override `{c, b, bg}`. On a line the override applies to the whole row (e.g. highlight background); on a run it changes colour/weight.
- `trigger: [machineId, index]`: shortcut for a side-rail row bound to a triggers machine (`◇`/`◆` label, highlight).

## Machines (all pure functions of t)

| type | fields | variables |
| --- | --- | --- |
| `counter` | `start, rate, format:"comma"?, prefix?, suffix?` | `id` |
| `cycle` | `values:[string \| {t,m,g,...}], period, t0, order?, log?:{who,c}` | `id`, `id.i` (index), `id.<field>` |
| `gauge` | `values:[numbers], period, t0, seed, threshold, decimals?, high:{label,dest}, low:{label,dest}, log?:{who,c,msgs:[...],tail:"p={value} {label}"}` | `id`, `id.num`, `id.low` ("1"), `id.label`, `id.dest` |
| `any_low` | `of:[gaugeIds]` | `id` = "low" / "high" |
| `lane` | `period, run, off, busy, done:[...], phase?, spin?, log?:{who,c,msgs:[[text,tag]]}` | `id` (spinner + text, coloured), `id.state` |
| `triggers` | `period, on, t0, items:[{name, adv:[l1,l2], to?}], color, callsStart?, tokens?:{start,step,unit}, cps?, onText, offText, log?:{who,c,start:{m,g},end:{m,g}}` | `id.active` (index or -1), `id.label<i>`, `id.adv0`, `id.adv1` (typed), `id.calls`, `id.tokens`, `id.status`, `id.<item field>` |

Built-in variables: `{packets}` (deliveries so far), `{clock}`. Log templates may use item/gauge fields, e.g. `{name}`, `{value}`, `{label}`, `{dest}`.

## Replay hook

`window.seek(t)` draws the frame at second `t`. `window.__ready` becomes true when the config is loaded and fonts are ready; the stage becomes visible only after that complete first frame is drawn. `window.__check()` returns a list of layout problems (used by `check_frames.py`). `?manual` disables the live loop, hides playback controls and retains the original export layout, including its scale at the requested viewport size.

## Page playback

Outside manual mode, the stage shrinks proportionally to fit the viewport without cropping and never enlarges beyond 1:1. A native, keyboard-accessible Pause/Resume button sits outside the stage in a reserved 44 px bottom strip. Reduced-motion preference starts paused at t=0 (or a pending seek); the user can explicitly resume. Switching the preference to reduced motion also pauses playback.

`window.__livePanel.pause()` freezes the current frame; `resume()` continues from it without resetting time; the read-only `paused` property reports state. Resume is a no-op in manual mode. Pausing does not prevent deterministic `seek(t)` calls.

## Offline safety

The vendored template accepts embedded JSON only; the former `?config=...` fetch is removed. Its CSP uses `default-src 'none'`, allows inline script/style and data images/fonts, and forbids external requests. It works inside `sandbox="allow-scripts"` without same-origin access. Local installed font fallbacks still apply.

`build_page()` escapes every `<` in embedded JSON. Display text is escaped or assigned through `textContent`; colour names and numbers interpolated into generated HTML are validated. This protects insertion surfaces, not the entire config contract: the integrating renderer must still validate JSON structure, ranges and machine references. CSS theme values are set through DOM style APIs, and the CSP prevents resource requests from them.
