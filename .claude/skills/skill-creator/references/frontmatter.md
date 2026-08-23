# SKILL.md frontmatter fields

The frontmatter is a YAML mapping between two `---` lines at the very top of `SKILL.md`. Only `name` and `description` are required; every other field changes behavior and should be set only when the skill actually needs it.

## Full example

```yaml
---
name: release-notes
description: Draft release notes from merged pull requests. Use when the user asks to "write release notes", "summarize what shipped", or prepare a changelog for a tagged release.
allowed-tools:
  - Read
  - Grep
  - Bash(git log:*)
argument-hint: "[version-tag]"
disable-model-invocation: false
license: Apache-2.0
version: 0.1.0
---
```

## Field reference

- `name` (required) — hyphen-case identifier: lowercase letters, digits, and hyphens, no leading/trailing or doubled hyphens, under 64 characters. Match the containing folder name. This is also the slash command the user types: `/release-notes`.
- `description` (required) — what the skill does and when it applies, in the third person, up to 1024 characters and without angle brackets. This sits in context for every request, so it is the entire basis for automatic selection. Name concrete phrases a user would say, and state an exclusion only when a neighboring skill would otherwise be misrouted.
- `allowed-tools` — restricts the skill to the listed tools while it is active. Accepts the same specifiers as permission rules, including scoped Bash patterns such as `Bash(git log:*)`. Omit it unless the workflow genuinely should not reach further; an over-narrow list silently breaks the skill in unrelated tasks.
- `disable-model-invocation` — when `true`, Claude will not select the skill on its own; it runs only when the user types `/skill-name`. Defaults to `false`. Set it only on explicit request, not as a substitute for asking permission before a risky step.
- `user-invocable` — controls whether the skill is offered as a slash command. Defaults to `true`. Set it to `false` for a skill meant purely as background guidance for Claude.
- `argument-hint` — short placeholder text shown after the slash command, e.g. `"[version-tag]"`. Useful only for skills the user invokes with arguments.
- `license` — SPDX identifier or license name, for skills that are redistributed.
- `metadata` — a mapping for arbitrary extra keys. Unrecognized fields are ignored by Claude Code, so park anything non-standard here rather than at the top level.
- `version` — semantic version string, conventional for skills shipped inside a plugin.

## Constraints worth remembering

- Setting both `disable-model-invocation: true` and `user-invocable: false` leaves the skill unreachable.
- The description is matched as prose, not as keywords; a vague description ("helps with documents") loses to a specific one every time.
- Frontmatter is loaded for every skill on every request. Keep it small, and keep long guidance in the body or in `references/`.
