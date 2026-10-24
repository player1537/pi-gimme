# Contributing

Thanks for helping improve this Pi package.

## Development

```bash
npm install
npm run ci
```

`npm run ci` runs typecheck, unit tests, the Pi-host smoke harness, and a pack check.

## Local Pi testing

```bash
pi -e . --gimme 'gimme(reply: string)' -p 'Reply with "testing 123" only, using the gimme tool.'
```

## Pull requests

Before opening a PR:

- Run `npm run ci`
- Update docs when behavior changes
- Keep package contents small and intentional
- Run `npm pack --dry-run` when you add, remove, or rename `docs/` files so `package.json` `files` matches what you ship

## Release

Releases publish **`pi-gimme`** to npm through Trusted Publishing. Do not add `NPM_TOKEN` to GitHub Secrets.

```bash
npm version patch
git push
```

Pushing a version bump runs CI only; it does not release or publish. After
separate release authorization, manually dispatch `auto-release.yml` on `main`
to create the tag/release and hand off to npm publication via `publish.yml`
(Trusted Publisher, `id-token: write`).