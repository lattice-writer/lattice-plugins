// Builds the Pages site: index.json, blocked.json, the theme files, the plugin zips the
// registry packed from each entry's tagged source, and the schema.
// Signing happens in a separate job that alone can read the key (see publish.yml).
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  checkBlocked,
  checkEntryShape,
  checkTheme,
  fetchThemeFile,
  listThemeDirs,
  makeThemeValidator,
  listEntryDirs,
  readJson,
} from "./lib.mjs";
import { checkPlugin, checkPluginEntryShape, fetchPluginFiles, indexPlugin } from "./plugins.mjs";

const outIndex = process.argv.indexOf("--out");
const out = path.resolve(outIndex === -1 ? "site" : process.argv[outIndex + 1]);
const baseUrl = (process.env.REGISTRY_BASE_URL ?? "https://lattice-writer.github.io/lattice-plugins").replace(/\/$/, "");
// The registry's address before it moved to lattice-writer. publish.yml mirrors the signed site
// there for Lattice releases from before the move, and a serial must not go back on either.
const MIRROR_URL = "https://leo1oel.github.io/lattice-plugins";

// The client refuses an index whose serial is lower than the one it has cached, so the serial
// must never go back. Pages sits behind a CDN that can serve a stale index.json for minutes,
// so the run number (monotonic per workflow) is a floor under "published + 1".
async function previousSerial(url) {
  const response = await fetch(`${url}/index.json?nocache=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`could not read the published index at ${url}: HTTP ${response.status}`);
  const { serial } = await response.json();
  if (!Number.isSafeInteger(serial) || serial < 0) throw new Error(`published index has a bad serial: ${serial}`);
  return serial;
}

const published = Math.max(await previousSerial(baseUrl), await previousSerial(MIRROR_URL));
const serial = Math.max(published + 1, Number(process.env.GITHUB_RUN_NUMBER ?? 0));
const generated = new Date().toISOString();

const validate = makeThemeValidator();
const { ids, stray } = listThemeDirs();
if (stray.length) throw new Error(`unexpected files under themes/: ${stray.join(", ")}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const themes = [];
for (const id of ids) {
  const entry = readJson(path.join(ROOT, "themes", id, "entry.json"));
  const errors = checkEntryShape(entry, id);
  const fetched = errors.length ? { errors: [] } : fetchThemeFile(entry);
  errors.push(...fetched.errors);
  const { theme, errors: themeErrors } = fetched.data ? checkTheme(fetched.data, entry, validate) : { errors: [] };
  errors.push(...themeErrors);
  if (errors.length) throw new Error(`themes/${id}/entry.json is invalid:\n  ${errors.join("\n  ")}`);

  const file = `themes/${id}/${entry.version}.lattice-theme.json`;
  mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  writeFileSync(path.join(out, file), fetched.data);
  themes.push({
    id,
    name: theme.name,
    version: theme.version,
    author: theme.author ?? null,
    license: theme.license ?? null,
    description: theme.description ?? null,
    repository: entry.repository,
    tag: entry.tag,
    commit: entry.commit,
    path: entry.path,
    url: `${baseUrl}/${file}`,
    sha256: entry.sha256,
    size: fetched.data.length,
    variants: theme.variants.map((variant) => ({
      id: variant.id,
      name: variant.name ?? null,
      appearance: variant.appearance,
      colors: variant.colors ?? {},
    })),
  });
}

const pluginDirs = listEntryDirs("plugins");
if (pluginDirs.stray.length) throw new Error(`unexpected files under plugins/: ${pluginDirs.stray.join(", ")}`);
const plugins = [];
for (const id of pluginDirs.ids) {
  const entry = readJson(path.join(ROOT, "plugins", id, "entry.json"));
  const errors = checkPluginEntryShape(entry, id);
  const fetched = errors.length ? { errors: [] } : fetchPluginFiles(entry);
  errors.push(...fetched.errors);
  const checked = fetched.files ? checkPlugin(fetched.files, entry) : { errors: [] };
  errors.push(...checked.errors);
  if (errors.length) throw new Error(`plugins/${id}/entry.json is invalid:\n  ${errors.join("\n  ")}`);

  const file = `plugins/${id}/${entry.version}.zip`;
  mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  writeFileSync(path.join(out, file), checked.zip);
  plugins.push(indexPlugin(entry, checked.manifest, checked.zip, fetched.updated, `${baseUrl}/${file}`));
}

const blockedList = readJson(path.join(ROOT, "blocked.json"));
const blockedErrors = checkBlocked(blockedList);
if (blockedErrors.length) throw new Error(`blocked.json is invalid:\n  ${blockedErrors.join("\n  ")}`);

const write = (file, value) => writeFileSync(path.join(out, file), `${JSON.stringify(value, null, 2)}\n`);
write("index.json", { format: 1, serial, generated, themes, plugins });
write("blocked.json", { format: 1, serial, generated, blocked: blockedList });

mkdirSync(path.join(out, "schema"));
for (const name of readdirSync(path.join(ROOT, "schema"))) copyFileSync(path.join(ROOT, "schema", name), path.join(out, "schema", name));
mkdirSync(path.join(out, "keys"));
for (const name of readdirSync(path.join(ROOT, "keys"))) copyFileSync(path.join(ROOT, "keys", name), path.join(out, "keys", name));

console.log(`Built index serial ${serial} with ${themes.length} theme(s) and ${plugins.length} plugin(s) at ${generated}`);
