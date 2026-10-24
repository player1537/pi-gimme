# pi-gimme

[![CI](https://github.com/player1537/pi-gimme/actions/workflows/ci.yml/badge.svg)](https://github.com/player1537/pi-gimme/actions/workflows/ci.yml)
[![Publish](https://github.com/player1537/pi-gimme/actions/workflows/publish.yml/badge.svg)](https://github.com/player1537/pi-gimme/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-gimme.svg)](https://www.npmjs.com/package/pi-gimme)
[![npm downloads](https://img.shields.io/npm/dm/pi-gimme.svg)](https://www.npmjs.com/package/pi-gimme)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Extract structured data from Pi without constraining the thinking process.

## What this is

Telling an AI "your response will be used as a GitHub PR comment" sometimes yields bad results, like prefixing the response with unhelpful text like "Got it. Writing a PR comment..."

The idea of this package is to give the model a tool to output structured content to the user. At its core, this is really simple: just give it a tool `gimme()` and whatever that outputs is what you return.

In practice, there are a few times that some special care will be needed. For example, if the model forgets to call the tool as the last response, then it should be prodded to call the tool.

There might also be some validation needs. For example, maybe a PR comment should not contain `#123` because GitHub will interpret it as a reference to an Issue or PR.

## Features

- `pi --gimme 'gimme(title: string, body: string)'`

  > Simple usage: just give me a JSON object with a title and a body property. Gives the model a tool called `gimme` that takes arguments matching that shape.

- `pi --gimme 'submit_pr_comment(body: string)'`

  > Give a special name (`submit_pr_comment`) to the tool.

- `pi --gimme 'submit_pr_comment(body: string) { const match = body.match(/(?<!\w)#\d+\w*/); if (match) throw new Error("GitHub treats " + match[0] + " as a reference to an Issue or PR. Replace # with No. (as in No. 123) if this is unintentional. Otherwise, prefix with organization/repo (as in foo-org/bar-repo#123)."); }'`

  > Validation along with model guidance. Thrown errors get sent to the model and another attempt is given.

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-gimme
```

Pin a specific version when you want reproducible installs:

```bash
pi install npm:pi-gimme@0.3.1
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-gimme -l
```

Or install from GitHub:

```bash
pi install git:github.com/player1537/pi-gimme
```

Try it without permanently installing:

```bash
pi -e npm:pi-gimme --gimme 'gimme(reply: string)' -p 'Reply with "testing 123"'
```

## Quick start

Try this package locally:

```bash
pi -e . --gimme 'gimme(reply: string)' -p 'Reply with "testing 123"'
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints (`*.ts` and `index.ts`) |
| `lib/` | Shared TypeScript helpers |
| `skills/` | Agent Skills |
| `prompts/` | Prompt templates |
| `themes/` | Pi themes |
| `docs/` | Optional supporting docs (usage, examples, release, ADRs) |

## Development

```bash
npm install
npm run ci
```

## Development flow

Use this default flow when building a new Pi extension OSS project from this template:

1. Create the Vault project notes under `4_Project/<ProjectName>/`.
2. Add `CONTEXT.md`, `README.md`, `ROADMAP.md`, `Docs/`, `Issues/`, and `Progress/`.
3. Write the PRD in `4_Project/<ProjectName>/Docs/`.
4. Split approved tracer-bullet issues into `4_Project/<ProjectName>/Issues/`.
5. Implement in the OSS repo.
6. Run `npm run ci`, `npm test`, and `npm pack --dry-run`.
7. Release with Trusted Publishing.
8. Save release notes and follow-up decisions back to the Vault project.

Short version:

```txt
Vault notes -> PRD -> Issues -> implement -> ci/check -> release -> save learnings
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

Code pushes/merges run CI only. After separate release authorization, manually
dispatch `auto-release.yml` on `main`, or use an explicitly authorized version tag
or published release. Ordinary maintenance verification must not publish.

See [`docs/release.md`](docs/release.md) for setup details.

## Docs

`docs/` is optional supporting documentation, not a fixed six-file set. README stays the GitHub/npm entrypoint; add `docs/*.md` only when they help users or maintainers.

After creating a repository from this template:

1. Follow [`docs/template-checklist.md`](docs/template-checklist.md) for setup.
2. Run the **post-generation docs cleanup** in that checklist: delete or merge template bootstrap docs that no longer add project value.

Useful docs to keep when they add value:

- [`docs/examples.md`](docs/examples.md) — examples for extensions, skills, prompts, and themes
- [`docs/release.md`](docs/release.md) — Trusted Publishing details (README Release summarizes the flow)
- `docs/usage.md` — create when usage does not fit in README

Optional maintainer guidance (not a public-user navigation target in mature repos):

- [`docs/template-checklist.md`](docs/template-checklist.md)

Template bootstrap docs to delete or merge after setup unless they still teach something project-specific:

- `docs/github-template.md`
- `docs/repository-settings.md`
- `docs/template-sync.md` — monorepo maintainer notes for refreshing the bundled CLI template
- `docs/typescript.md`

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-gimme
- GitHub: https://github.com/player1537/pi-gimme
- Issues: https://github.com/player1537/pi-gimme/issues

## License

MIT
