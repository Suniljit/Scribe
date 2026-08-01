# ADR 0004: pre-commit for local lint/typecheck/test hooks

## Status
Accepted

## Context
The repo has three independently managed subprojects (backend: Python/uv,
frontend: Vite/npm, electron: npm) with no root Makefile or workspace tooling
tying them together, and no local git hook automation — lint, type, and test
issues were only ever caught manually or in CI. We want faster feedback,
enforced locally before code is shared.

## Decision
Adopt the [pre-commit](https://pre-commit.com) framework with a single root
`.pre-commit-config.yaml` using `local`/`system`-language hooks, since there
is no single pre-commit-supported language runtime spanning all three
subprojects. Each hook `cd`s into its subdir and shells out to the tool
already used there (`uv run ruff check`, `uv run ty check`, `uv run pytest`,
`npm run lint`, `npm run typecheck`).

The `pre-commit` tool itself is installed as a pinned dev dependency of a
new, minimal root-level uv project (`pyproject.toml` at repo root, dev-only,
no runtime dependencies), rather than via `pipx`/`brew`. This keeps the tool
version locked in `uv.lock` and reproducible per-checkout like the rest of
the Python tooling in this repo, and avoids polluting the contributor's
global Python/Homebrew environment. It's a separate uv project from
`backend/` because pre-commit hooks apply repo-wide (frontend and electron
too), not just to the backend.

Hooks are split across two git hook stages:
- **pre-commit** (fast): lint only — `ruff` (backend), `oxlint`
  (frontend, electron).
- **pre-push** (slower): type checking — `ty` (backend), `tsc -b`
  (frontend) — and tests — `pytest` (backend).

Backend `pytest` has no tests yet, so its hook explicitly tolerates pytest's
exit code 5 ("no tests collected") as success while still failing on any
other nonzero exit (real failures or collection errors).

Frontend and electron have no test runner installed, so no test hook was
added for them — only lint and (for frontend) typecheck.

## Consequences
- Contributors must run
  `pre-commit install --hook-type pre-commit --hook-type pre-push` once
  after cloning (documented in the README) for hooks to take effect locally.
- Commits stay fast (lint only); pushes take a bit longer (typecheck + test)
  but catch more before code is shared.
- The empty-pytest tolerance must be revisited once real backend tests
  exist — at that point `[tool.pytest.ini_options] testpaths` should be
  added, and the exit-code-5 tolerance can be reconsidered if `testpaths` is
  set to a directory that always exists.
- Electron and frontend remain untested at the hook level until a test
  runner (e.g. vitest) is deliberately added for them — this ADR does not
  make that decision.
