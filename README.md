# skm - A package manager for Agent Skills

<a href="https://www.npmjs.com/package/@stefafafan/skm"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40stefafafan%2Fskm"></a>

`skm` helps keep [Agent Skills](https://agentskills.io) for projects under control.
It stores resolved commit hashes for reproducibility and lets you alias skill names so teams can keep naming consistent, which matters because the skill `name` and `description` affect how agents trigger them.

See [stefafafan/skm-demo](https://github.com/stefafafan/skm-demo) for real examples of how `skm` is used in a project.

> [!WARNING]
> This package is in beta. There may be breaking changes.

![skm demo](demo.gif)

## Motivation

Agent Skills are convenient, but there are 2 points to consider:

1. Which version skill did I just download? How should I update them?
2. People make skills with different naming conventions--should I rename them?

`skm` solves these problems by tracking exactly which commit of each skill was installed and by letting you rename skills locally without changing the upstream repository.

## No skm vs With skm

### No skm

- Copy and paste skills manually in different ways.
- No idea if upstream skills have updates.
- No real naming convention ending up to hundreds of skills with random names.

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

### With skm

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

## Metadata files used

The following files are used by `skm`

- `skills.json`
  - user-facing intent
- `skills.lock.json`
  - resolved commit hash and integrity data
- `.skm/`
  - internal state and stored contents
- `.agents/skills/`
  - the derived skills

The intended manifest-first flow is:

1. Change `skills.json` with `skm` commands or by editing it directly.
2. Run `skm install`.
3. Let `skills.lock.json` and `.agents/skills/` reconcile automatically.

It is recommended to add the `.skm` directory to `.gitignore`.

```sh
echo '.skm' >> .gitignore
```

## FAQ

### Q: My Coding Agent doesn't support `.agents/skills`

It is a design decision to only support `.agents/skills` for `skm`.

If you don't mind, you can use the workaround of symbolic links (e.g. make `.claude/skills` a symlink of `.agents/skills`).
