# skm

<a href="https://www.npmjs.com/package/@stefafafan/skm"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40stefafafan%2Fskm"></a>

`skm` is a package manager of [Agent Skills](https://agentskills.io), supporting both project and global-level skills.

See [stefafafan/skm-demo](https://github.com/stefafafan/skm-demo) for real examples of how `skm` is used in a project.

> [!WARNING]
> This package is in beta. There may be breaking changes.

![skm demo](demo.gif)

## Motivation

Agent Skills are convenient, but there are 2 points to consider:

1. Which version skill did I just download? How should I update them?
2. People make skills with different naming conventions--should I rename them?

`skm` solves these problems by storing metadata of installed skills and having the ability to alias skills with your favorite names.

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

Basically the same, but with `--global`

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
