// Real APFS unmount/remount and separate Electron Node processes. No user data.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const require = createRequire(
  path.join(repo, "apps/eidos-lite-desktop/package.json")
)
const { build } = require("esbuild")
const electron = require("electron")
assert.equal(process.platform, "darwin", "This smoke requires macOS/APFS")
const output = path.resolve(
  process.argv[2] ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "eidos-identity-smoke-")))
)
await fs.mkdir(output, { recursive: true, mode: 0o700 })
await fs
  .symlink(
    path.join(repo, "apps/eidos-lite-desktop/node_modules"),
    path.join(output, "node_modules")
  )
  .catch((error) => {
    if (error.code !== "EEXIST") throw error
  })
const run = (binary, args, options = {}) =>
  execFileSync(binary, args, { encoding: "utf8", timeout: 60000, ...options })
const versions = ["lite-v0.30.1", "lite-v0.31.0", "fixed"]
for (const version of versions) {
  const source = path.join(output, version)
  await fs.mkdir(source, { recursive: true })
  const files = [
    "apps/eidos-lite-desktop/src/main/space/space-paths.ts",
    "apps/eidos-lite-desktop/src/main/plugins/plugin-store.ts",
    "apps/eidos-lite-desktop/src/main/plugins/plugin-storage.ts",
    "apps/eidos-lite-desktop/src/shared/file-metadata.ts",
  ]
  if (version === "fixed")
    files.push("apps/eidos-lite-desktop/src/main/space/space-identity.ts")
  for (const file of files) {
    const target = path.join(source, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(
      target,
      version === "fixed"
        ? await fs.readFile(path.join(repo, file))
        : run("git", ["show", `${version}:${file}`], { cwd: repo })
    )
  }
  await build({
    stdin: {
      contents: `export {canonicalizeSpaceRoot} from './apps/eidos-lite-desktop/src/main/space/space-paths.ts'; export {PluginStore} from './apps/eidos-lite-desktop/src/main/plugins/plugin-store.ts'; export {PluginStorage} from './apps/eidos-lite-desktop/src/main/plugins/plugin-storage.ts'; export {encodePackage} from '${repo}/packages/plugin-runtime/src/package.ts';`,
      resolveDir: source,
    },
    outfile: path.join(output, `${version}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["esbuild", "typescript"],
    banner: {
      js: "import {createRequire as __makeRequire} from 'node:module'; var require = __makeRequire(import.meta.url);",
    },
    plugins: [
      {
        name: "runtime-source",
        setup(build) {
          build.onResolve(
            { filter: /^@eidos\.space\/plugin-runtime\// },
            (args) => ({
              path: path.join(
                repo,
                "packages/plugin-runtime/src",
                `${args.path.split("/").at(-1)}.ts`
              ),
            })
          )
        },
      },
    ],
  })
}
const child = path.join(output, "child.mjs")
await fs.writeFile(
  child,
  `
import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import path from 'node:path';
const [module,mode,root,profile,catalog,expectedFile] = process.argv.slice(2);
const {canonicalizeSpaceRoot,PluginStore,PluginStorage,encodePackage} = await import(module);
const canonical = await canonicalizeSpaceRoot(root, profile); const store = new PluginStore(catalog);
const storage = new PluginStorage(path.join(catalog,'data','test.history')); const active = () => {};
if(mode==='seed') {
 const manifest = {apiVersion:1,requires:{pluginApi:'3.6.0'},id:'test.history',name:'History',version:'1.0.0',storage:{maxBytes:1024},background:{entry:'./background.js',autoStart:true},settings:{mode:{type:'string',title:'Mode',default:'default'}},views:[{id:'page',kind:'page',title:'History',entry:'./page.js',capabilities:[]}]};
 const bytes = encodePackage(manifest,{'./background.js':'onmessage = () => {};','./page.js':'export default function mount() {}'});
 const hash = await store.install(bytes,canonical.id); await store.approveBackground(manifest.id,canonical.id,hash); await store.setPluginSetting(canonical.id,manifest.id,'mode','kept');
 const disabled = encodePackage({...manifest,id:'test.disabled'}, {'./background.js':'onmessage = () => {};','./page.js':'export default function mount() {}'}); await store.install(disabled,canonical.id); await store.enable('test.disabled',false,canonical.id);
 await storage.request('storage.write',{key:'history/'+canonical.id+'/run',data:Buffer.from('synthetic-history').toString('base64')},1024,active);
 await fs.writeFile(expectedFile,JSON.stringify({id:canonical.id,hash,config:await store.config()}));
}
const expected=JSON.parse(await fs.readFile(expectedFile,'utf8')); const config=await store.config();
const binding=await store.binding('test.history',canonical.id); const list=await storage.request('storage.list',{prefix:'history/'+canonical.id+'/'},1024,active);
const preserved=canonical.id===expected.id && binding?.enabled===true && await store.backgroundApproved('test.history',canonical.id,expected.hash) && (await store.pluginSettings(canonical.id,'test.history')).mode==='kept' && list.length===1 && (await store.binding('test.disabled',canonical.id)).enabled===false;
if(mode==='verify') { assert.equal(preserved,true); assert.deepEqual(config,expected.config); }
if(mode==='broken') assert.equal(preserved,false);
console.log(JSON.stringify({mode,pid:process.pid,id:canonical.id,identity:canonical.identity,preserved,storageObjects:list.length,configUnchanged:JSON.stringify(config)===JSON.stringify(expected.config)}));
`
)
const mount = path.join(output, "mount")
const spacerMount = path.join(output, "spacer-mount")
await fs.mkdir(mount, { recursive: true })
await fs.mkdir(spacerMount, { recursive: true })
const image = path.join(output, "space.sparseimage")
const spacer = path.join(output, "spacer.sparseimage")
for (const [file, name] of [
  [image, "EidosIdentity"],
  [spacer, "EidosSpacer"],
])
  run("hdiutil", [
    "create",
    "-size",
    "64m",
    "-fs",
    "APFS",
    "-volname",
    name,
    "-type",
    "SPARSE",
    file,
  ])
const attached = new Set()
const attach = (file, point) => {
  run("hdiutil", ["attach", "-nobrowse", "-mountpoint", point, file])
  attached.add(point)
}
const detach = (point) => {
  run("hdiutil", ["detach", point])
  attached.delete(point)
}
const profile = path.join(output, "profile"),
  catalog = path.join(output, "home/.eidos/plugins"),
  expected = path.join(output, "expected.json")
const results = []
const stage = (version, mode) => {
  const stdout = run(
    electron,
    [
      child,
      path.join(output, version + ".mjs"),
      mode,
      path.join(mount, "Space"),
      profile,
      catalog,
      expected,
    ],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        HOME: path.join(output, "home"),
        EIDOS_HOME: path.join(output, "home/.eidos"),
      },
    }
  )
  const value = JSON.parse(stdout.trim().split("\n").at(-1))
  results.push({ version, ...value })
  return value
}
try {
  attach(image, mount)
  await fs.mkdir(path.join(mount, "Space"))
  stage("lite-v0.30.1", "seed")
  stage("lite-v0.31.0", "verify")
  stage("fixed", "verify")
  const before = (await fs.stat(path.join(mount, "Space"))).dev
  detach(mount)
  attach(spacer, spacerMount)
  attach(image, mount)
  const after = (await fs.stat(path.join(mount, "Space"))).dev
  assert.notEqual(after, before, "Need an actual device-number change")
  stage("lite-v0.31.0", "broken")
  stage("fixed", "verify")
  stage("fixed", "verify")
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify({ before, after, results }, null, 2)
  )
  console.log(JSON.stringify({ output, before, after, results }, null, 2))
} finally {
  for (const point of [...attached].reverse()) detach(point)
}
