# Lattice plugins and themes registry

This repository is the registry behind Settings › Appearance › Themes and Settings ›
Plugins › Browse in [Lattice](https://github.com/leo1oel/lattice). Authors add an entry by
pull request. CI checks every entry against the exact commit it pins, and on every merge
to `main` a workflow builds a signed `index.json` and publishes it, with the theme files,
the plugin zips and the kill switch, to GitHub Pages:

| File | URL |
|---|---|
| Index | https://lattice-writer.github.io/lattice-plugins/index.json |
| Index signature | https://lattice-writer.github.io/lattice-plugins/index.json.minisig |
| Kill switch | https://lattice-writer.github.io/lattice-plugins/blocked.json |
| Kill switch signature | https://lattice-writer.github.io/lattice-plugins/blocked.json.minisig |
| Theme schema | https://lattice-writer.github.io/lattice-plugins/schema/theme-1.json |

Lattice verifies both signatures against public keys compiled into the app
([`keys/primary.pub`](keys/primary.pub), with [`keys/backup.pub`](keys/backup.pub) held
back for rotation) and checks each theme file's and plugin zip's sha256 against the index
before it installs it. A compromised CDN or GitHub account can't inject a theme or a
plugin without the signing key.

Themes are data only: one JSON file that gives colors to Lattice's design roles. They
can't run code or bundle fonts, so installing one asks for no permission and works on
every platform. The format is documented in Lattice's
[`docs/themes.md`](https://github.com/leo1oel/lattice/blob/main/docs/themes.md) and
[`schema/theme-1.json`](schema/theme-1.json).

## Developer guide

New to writing a plugin or a theme? The developer guide in Lattice's user guide walks through
it step by step, from a hello-world plugin to a merged entry here:
[Developing plugins](https://leo1oel.github.io/lattice/guide/plugin-development.html)
([简体中文](https://leo1oel.github.io/lattice/guide/zh-CN/plugin-development.html)). Its
[Publishing a plugin](https://leo1oel.github.io/lattice/guide/plugin-publishing.html) and
[Making a theme](https://leo1oel.github.io/lattice/guide/theme-development.html) pages cover this
repository's side. The sections below are the reference.

## Submitting a theme

1. Keep your theme in a public GitHub repository as a `*.lattice-theme.json` file,
   at most 256 KiB, that validates against
   `https://lattice-writer.github.io/lattice-plugins/schema/theme-1.json`. Pick a reverse-domain
   `id` you own (for example `io.github.<you>.<theme>`); `app.lattice.*` is reserved for
   the themes bundled with Lattice. Include a licence.
2. Tag the commit you want listed and push the tag.
3. Add `themes/<id>/entry.json` here in a pull request:

   ```json
   {
     "id": "io.github.leo1oel.harbor",
     "version": "1.0.0",
     "repository": "https://github.com/lattice-writer/lattice-plugins",
     "tag": "examples/harbor-v1.0.0",
     "commit": "<the full 40-character sha the tag points at>",
     "path": "examples/harbor.lattice-theme.json",
     "sha256": "<shasum -a 256 harbor.lattice-theme.json>"
   }
   ```

   `id` and `version` must equal the theme file's own. The folder name must equal `id`.
4. Fill in the checklist in the pull request template.

To update a theme, tag a new commit, raise `version` in the theme file, and change
`version`, `tag`, `commit` and `sha256` in your entry. Versions only go up.

### What CI checks on every pull request

For each entry, [`scripts/validate.mjs`](scripts/validate.mjs):

- fetches only the pinned tag from the source repository and requires it to point at
  `commit`;
- reads the file at `path` out of that commit (a regular file, not a symlink) and
  rejects it if it is over 256 KiB;
- checks its sha256 against the entry;
- validates it against `schema/theme-1.json`, and checks that its `id` and `version`
  match the entry and that variant ids are unique;
- on an update, checks that `version` is greater than the one on `main`, and flags a
  change of repository for a human;
- validates `blocked.json`.

## Submitting a plugin

Plugins run Node code in Lattice's sandbox and reach only what their manifest asks for
(Lattice's [`plugin-sdk/README.md`](https://github.com/leo1oel/lattice/blob/main/plugin-sdk/README.md)).
The registry lists **node plugins only**; native (`exec`) plugins stay URL installs.

1. Keep the plugin folder (`lattice-plugin.toml`, its `main`, a `README.md` and a
   licence file) in a public GitHub repository. Pick a reverse-domain `id` you own;
   `app.lattice.*` is reserved for the plugins in leo1oel/lattice. The README names every
   `network` origin and `network-local` port with the reason, and says plainly if the
   plugin sends project content off the machine.
2. Tag the commit you want listed and push the tag.
3. Pack the folder at that commit with Lattice's
   `node plugin-sdk/scripts/pack-plugin.mjs <folder> out.zip`, which prints its sha256.
   The pack is reproducible: it leaves out tests and dot files and gives the same bytes on
   any machine.
4. Add `plugins/<id>/entry.json` here in a pull request:

   ```json
   {
     "id": "app.lattice.zotero-search",
     "version": "0.1.0",
     "repository": "https://github.com/leo1oel/lattice",
     "tag": "plugins/zotero-search-v0.1.0",
     "commit": "<the full 40-character sha the tag points at>",
     "path": "examples/plugins/zotero-search",
     "sha256": "<what pack-plugin.mjs printed>",
     "author": "Lattice",
     "categories": ["citations"]
   }
   ```

   `path` is the plugin folder in the repository (`"."` for its root). `id` and `version`
   must equal the manifest's own. The folder name must equal `id`.

The registry never takes an author-built archive: CI packs the folder at the tagged commit
with [`scripts/pack.mjs`](scripts/pack.mjs) (a copy of `pack-plugin.mjs`) and publishes
that zip only when its sha256 equals the entry's, so what the reviewer read is byte for
byte what Lattice installs. For each plugin entry, [`scripts/validate.mjs`](scripts/validate.mjs)
also:

- reads the folder out of git's object store, refusing symlinks and submodules, within
  Lattice's unpack limits (10,000 files, 200 MiB, a 50 MiB zip);
- checks the manifest as Lattice does (schema, id, version, API level, name, permissions
  and commands) and the registry's stricter rules: runtime `node`, a description, a
  licence from Lattice's accepted list, a README and a licence file;
- rejects scripts with lines over 1000 characters (minified or generated code) or that
  evaluate code at run time (`eval`, `new Function`, `vm`);
- on an update, checks that `version` went up and prints what the new version asks for
  beyond the published one, so the reviewer sees a permission diff without reading TOML.

## Review rules

CI does the mechanical half. A maintainer (today, leo1oel) reviews:

- **every first submission**;
- **any update that changes the repository or owner** (and, for plugins, any update
  whose permissions grow or whose runtime changes).

Other updates merge after green CI and a 24-hour cooling period, during which any
maintainer can hold them. [`REVIEW.md`](REVIEW.md) is the full checklist. For themes, the
reviewer asks:

1. Is the id or name impersonating someone? No "Lattice" or "Overleaf" names without
   permission, no confusable ids.
2. Is the description accurate, the licence present, and the repository real and
   public? Ported palettes credit the original author and keep its licence.
3. Is the theme readable? Lattice lifts text to 4.5:1 on every surface, but a theme
   that only works after heavy lifting will look wrong; reject it.
4. Does it stay data? No fonts, no images in the theme file, nothing outside the schema.

### Plugins

The plugin review adds: do the permissions fit the stated purpose, with every network
origin and local port named in the README; does the plugin send project content off the
machine, and say so plainly if it does; is the source readable, with no fetching and
running remote code; does it duplicate a built-in feature in a misleading way. A plugin
update also needs a human when its permissions grow or its runtime changes.

## The kill switch

[`blocked.json`](blocked.json) lists versions Lattice must turn off. It is signed and
published with the index:

```json
[
  {
    "id": "dev.bad.plugin",
    "versions": "<=0.3.1",
    "action": "disable",
    "reason": "Sent bibliography contents to an undeclared server.",
    "url": "https://github.com/lattice-writer/lattice-plugins/issues/123"
  }
]
```

- `versions` is a semver range, or `"*"` for all.
- `action` is `"disable"` (turned off and can't be turned back on) or `"warn"` (a
  banner; it keeps working).
- Lattice never deletes the files or the data folder. Removing an entry from `themes/`
  only stops new installs; existing installs keep working unless they are also blocked.
- Folder (developer) installs are never touched by the block list.
- For plugins, `disable` turns installed copies off and refuses new installs of those
  versions; `warn` shows the reason on the plugin's card.

To block something, open a pull request that adds an item to `blocked.json`. It is
published on the next signed run like any other change.

## Published formats

`index.json`:

```json
{
  "format": 1,
  "serial": 7,
  "generated": "2026-11-18T12:00:00.000Z",
  "themes": [
    {
      "id": "io.github.leo1oel.harbor",
      "name": "Harbor",
      "version": "1.0.0",
      "author": "leo1oel",
      "license": "MIT",
      "description": "…",
      "repository": "https://github.com/lattice-writer/lattice-plugins",
      "tag": "examples/harbor-v1.0.0",
      "commit": "…",
      "path": "examples/harbor.lattice-theme.json",
      "url": "https://lattice-writer.github.io/lattice-plugins/themes/io.github.leo1oel.harbor/1.0.0.lattice-theme.json",
      "sha256": "…",
      "size": 2052,
      "variants": [
        { "id": "day", "name": "Harbor Day", "appearance": "light", "colors": { "window": "#f4f6f8", "…": "…" } }
      ]
    }
  ],
  "plugins": [
    {
      "id": "app.lattice.zotero-search",
      "name": "Zotero",
      "version": "0.1.0",
      "api": 1,
      "runtime": "node",
      "license": "MIT",
      "author": "Lattice",
      "description": "…",
      "repository": "https://github.com/leo1oel/lattice/tree/plugins/zotero-search-v0.1.0/examples/plugins/zotero-search",
      "commit": "…",
      "categories": ["citations"],
      "permissions": { "projectRead": ["bibliography"], "networkLocal": [23119], "network": [], "secrets": [] },
      "commands": [{ "id": "search", "title": "Search Zotero…", "description": "…" }],
      "url": "https://lattice-writer.github.io/lattice-plugins/plugins/app.lattice.zotero-search/0.1.0.zip",
      "sha256": "…",
      "size": 7386,
      "downloads": null,
      "updated": "2026-11-19T04:02:25.000Z"
    }
  ]
}
```

- `serial` goes up by at least one on every publish. Clients keep the highest serial
  they have verified and refuse a lower one, so an old signed index can't be replayed.
- `generated` is the build time (ISO 8601, UTC), for display.
- `variants[].colors` is each variant's base colors as the theme gives them, for preview
  swatches. Roles a theme leaves out are absent; the app fills them from its own palette.
- `url` serves the exact bytes the `sha256` covers.
- A plugin's `permissions` and `commands` are its manifest's, permissions in the order
  Lattice compares them in; Lattice installs the zip only when the manifest inside asks for
  exactly those. `updated` is the pinned commit's date; `downloads` is not counted yet.

`blocked.json` is `{ "format": 1, "serial", "generated", "blocked": [ … ] }` with the
same serial as the index it was published with.

Each `.minisig` is a minisign (Ed25519) signature whose trusted comment is
`lattice-plugins file:<name> serial:<serial>`. Verify by hand:

```sh
minisign -V -p keys/primary.pub -m index.json -x index.json.minisig
```

## Signing

Only the `sign` job in [`publish.yml`](.github/workflows/publish.yml) can read the
signing key. It runs in the `registry-signing` environment, which accepts deployments
only from `main` and waits for leo1oel's approval on every run. The private keys exist
only as secrets of that environment: `MINISIGN_PRIMARY_SECRET_KEY` signs,
`MINISIGN_BACKUP_SECRET_KEY` is kept for rotation.

To rotate: ship a Lattice release that trusts the backup key (it already does), switch
the sign step to `MINISIGN_BACKUP_SECRET_KEY`, generate a new backup pair, and ship a
release that trusts the new backup before retiring the old primary.

## Layout

```
themes/<id>/entry.json      one entry per theme
plugins/<id>/entry.json     one entry per plugin
REVIEW.md                   the reviewer's checklist
blocked.json                kill switch
schema/theme-1.json         theme JSON Schema (copied from leo1oel/lattice)
keys/primary.pub            public key that signs the index
keys/backup.pub             rotation key
examples/                   themes hosted here to seed the registry
scripts/                    validate, build-index, and pack (the reproducible plugin zip)
.github/workflows/          validate on PR; build, sign and publish on main
```

Run the checks locally with `npm ci && npm run validate`.
