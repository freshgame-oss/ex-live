# Vendored source

This engine is derived from [freshgame-oss/live-panel](https://github.com/freshgame-oss/live-panel)
at commit `1bca163c88a5ca98742d5f2f21fe350cafe6e102`, which retains implementation from
[ythx-101/live-panel-skill](https://github.com/ythx-101/live-panel-skill).
It is not a claim of original authorship by the integrating project.

Copied paths retain their internal relationships:

- `assets/template.html`
- `scripts/livepanel.py`, `scripts/render.py`, `scripts/check_frames.py`
- `references/config-schema.md`, `references/motion-grammar.md`
- `tests/test_cycle_replay.py`, `tests/test_glow_replay.py`

`tests/fixtures/original-template.html` copies that source `assets/template.html`,
with trailing whitespace on one blank line removed. It is retained as the
warm-paper manual-export pixel baseline.
The original theme values, layout builders, time-based machines, cycle-field
cleanup and glow reset are inherited from that source, not newly authored here.

Vendored changes add page-only playback controls, reduced-motion handling,
shrink-to-fit without enlargement, complete-first-frame visibility, offline CSP
and insertion-surface hardening. `livepanel.py` now escapes every `<` when
embedding JSON. The new playback tests exercise these changes and compare
manual exports with the source template. Reference edits document changed
behavior only.

The source LICENSE at copy time listed Kenny (freshgame-oss). The vendored
LICENSE retains that notice and restores `Copyright (c) 2026 live-panel
contributors` as required for this integration. The original template is
included under the same MIT license; the vendored copy does not reassign
ownership of inherited code.
