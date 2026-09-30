@AGENTS.md

## Claude Code specifics

- All project guidance lives in [AGENTS.md](AGENTS.md) (shared with other agents) — update it there, not here. Only Claude-Code-specific notes belong in this file.
- Shared permissions are in [.claude/settings.json](.claude/settings.json) (lint/test/build/tsc and read-only git are pre-allowed). Personal overrides go in `.claude/settings.local.json`, which is git-ignored.
