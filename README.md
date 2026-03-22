# skm - A package manager for Agent Skills

<a href="https://www.npmjs.com/package/@stefafafan/skm"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40stefafafan%2Fskm"></a>

`skm` is a package manager for [Agent Skills](https://agentskills.io).
It pins skills to exact commit hashes for reproducible installs and lets teams alias skill names consistently.

See [stefafafan/skm-demo](https://github.com/stefafafan/skm-demo) for real examples of how `skm` is used in a project.

> [!WARNING]
> This package is in beta. There may be breaking changes.

![skm demo](demo.gif)

## Motivation

Agent Skills are convenient, but currently have some downsides:

### No `skm`

- Copy and paste skills manually in different ways.
- No idea if upstream skills have updates.
- No naming convention, leading to inconsistent skill names across the team

```text
project/
└── .agents/
    └── skills/  <-- Files within this directory edited manually in many ways.
        ├── commit-msg-helper/
        │   └── SKILL.md
        ├── stefans-best-skill/
        │   └── SKILL.md
        ├── infra-master/
        │   └── SKILL.md
        └── ultra_fast_coder_skill/ <-- Random named skills depending on skill author
            └── SKILL.md
```

### With `skm`

- Standardized way of installing/updating skills. `skills.json` shows a clear outline of managed skills.
- `skills.lock.json` stores resolved commit hashes for reproducible installs.
- `skm rename` lets projects keep consistent local skill names.

```text
project/
├── skills.json      <-- This file is edited (via skm add, skm rename, etc.)
├── skills.lock.json <-- Contains exact commit hash for each skill installed. Reproducible.
└── .agents/
    └── skills/
        ├── commit-message-writer/
        │   └── SKILL.md
        ├── github-actions-pinner/
        │   └── SKILL.md
        └── web-security-reviewer/ <-- Skill renamed via skm, making things under-control.
            └── SKILL.md
```

## Installation

### Globally

```bash
npm install -g @stefafafan/skm
```

### Run Directly

```bash
npx @stefafafan/skm
```

## Setup

### For projects

Initialize a project with `skills.json` and `skills.lock.json`

```bash
skm init
```

Add your favorite skills.

```bash
skm add https://github.com/stefafafan/skills
```

Rename a skill locally if you prefer a different key name.

```bash
skm rename pin-github-actions gha-pinner
```

Add and commit your files.

```bash
git add skills.json skills.lock.json
git commit
```

### For global settings

You can use `skm` to manage global skills as well. Basically the same, but with `--global`

```bash
skm init --global
```

```bash
skm add stefafafan/skills --global
```

## Commands

Call `help` subcommand for more information.

```bash
skm help
```

Show help for specific subcommands.

```bash
skm help add
```

## Supported source formats

Currently this tool assumes the skills are on GitHub.

```bash
# Installing a skill in a specific path.
skm add https://github.com/stefafafan/skills/tree/main/skills/pin-github-actions

# Installing all skills in a repository (shorthand)
skm add stefafafan/skills

# Installing all skills in a repository (full URL)
skm add https://github.com/stefafafan/skills
```

Repository-wide imports discover every nested directory containing `SKILL.md`.

## Files read/edited by `skm`

The following files are used by `skm`:

| File               | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `skills.json`      | User-facing intent — what skills you want                               |
| `skills.lock.json` | Resolved commit hashes for reproducible installs                        |
| `.skm/`            | Internal state and cached contents (recommended to add to `.gitignore`) |
| `.agents/skills/`  | The derived skills, read by your coding agent                           |

## FAQ

### Q: My Coding Agent doesn't support `.agents/skills`

Although some agents support `.agents/skills`, there are still many agents that use different paths. Until the standard is more widely adopted, symbolic links are the recommended workaround (for example, making `.claude/skills` a symlink for `.agents/skills`).
