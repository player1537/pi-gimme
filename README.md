# pi-gimme

[![CI](https://github.com/player1537/pi-gimme/actions/workflows/ci.yml/badge.svg)](https://github.com/player1537/pi-gimme/actions/workflows/ci.yml)
[![Publish](https://github.com/player1537/pi-gimme/actions/workflows/publish.yml/badge.svg)](https://github.com/player1537/pi-gimme/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-gimme.svg)](https://www.npmjs.com/package/pi-gimme)
[![npm downloads](https://img.shields.io/npm/dm/pi-gimme.svg)](https://www.npmjs.com/package/pi-gimme)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)

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

- `pi --gimme 'gimme(title: string)' --gimme 'submit_pr_comment(body: string)'`

  > Pass `--gimme` multiple times to register multiple tools. Each output is prefixed with a `_tool` field naming the tool that produced it.

## How it works

Each `--gimme` flag takes a tool signature of the form `name(param: type, ...) [ { validation } ]`:

- Supported parameter types: `string`, `number`, `boolean`, and arrays of any of those (`string[]`, `number[]`, `boolean[]`).
- The optional `{ ... }` block runs as JavaScript on every call, with the parsed arguments in scope as variables. Throwing an error sends the error message back to the model for another attempt.
- Attempts are capped by `--gimme-max-attempts` (default 3). The package manages the cap itself rather than relying on Pi's unbounded tool-error loop.
- The tool name `_error` is reserved and rejected at startup.

In `-p` mode the user sees only the tool result as a single-line JSON object:

```json
{"_tool":"gimme","title":"x","body":"y"}
```

When validation is exhausted, the output is:

```json
{"_tool":"_error","_error":"exhaustion","message":"<last validation error>"}
```

## Install

Install the published npm package with Pi:

```bash
pi install npm:pi-gimme
```

Pin a specific version when you want reproducible installs:

```bash
pi install npm:pi-gimme@0.1.0
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
pi -e npm:pi-gimme --gimme 'gimme(reply: string)' -p 'Reply with "testing 123" only, using the gimme tool.'
```

## Quick start

Try this package locally:

```bash
pi -e . --gimme 'gimme(reply: string)' -p 'Reply with "testing 123" only, using the gimme tool.'
```

Expected output:

```json
{"_tool":"gimme","reply":"testing 123"}
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints |
| `lib/` | Shared TypeScript helpers (signature parser, schema mapping, validation runner, flag collection) |
| `docs/` | Optional supporting docs |

## Development

```bash
npm install
npm run ci
```

`npm run ci` runs typecheck, unit tests, the Pi-host smoke harness, and a pack check.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages. The `{ ... }` validation block also runs as JavaScript with your local permissions.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-gimme
- GitHub: https://github.com/player1537/pi-gimme
- Issues: https://github.com/player1537/pi-gimme/issues

## License

MIT