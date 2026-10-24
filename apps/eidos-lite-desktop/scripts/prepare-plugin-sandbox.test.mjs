import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { preparePluginSandbox } from "./prepare-plugin-sandbox.mjs"

for (const platform of ["win32", "darwin", "linux"]) {
  test(`prepares ${platform} resources without a pnpm shell launcher`, async () => {
    const repository = await mkdtemp(path.join(os.tmpdir(), "sandbox build "))
    try {
      const sandbox = path.join(repository, "packages/plugin-sandbox")
      const compiler = path.join(sandbox, "node_modules/typescript/bin")
      await mkdir(compiler, { recursive: true })
      await mkdir(path.join(sandbox, "scripts"), { recursive: true })
      await writeFile(path.join(sandbox, "package.json"), '{"type":"module"}')
      await writeFile(
        path.join(compiler, "tsc"),
        `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        assert.deepEqual(process.argv.slice(2), ['-p', 'tsconfig.build.json']);
        fs.writeFileSync('compiled', 'ready');
      `
      )
      const filename =
        platform === "win32" ? "plugin-sandbox.exe" : "plugin-sandbox"
      await writeFile(
        path.join(sandbox, "scripts/build-native.mjs"),
        `
        import { readFile, mkdir, writeFile } from 'node:fs/promises';
        import path from 'node:path';
        const sandbox = path.join(process.cwd(), 'packages/plugin-sandbox');
        if (await readFile(path.join(sandbox, 'compiled'), 'utf8') !== 'ready') throw Error('Compile first');
        const output = path.join(sandbox, 'bin', ${JSON.stringify(`${platform}-x64`)});
        await mkdir(output, { recursive: true });
        await writeFile(path.join(output, ${JSON.stringify(filename)}), 'native fixture');
      `
      )
      await preparePluginSandbox({ repository, platform, architecture: "x64" })
      assert.equal(
        await readFile(
          path.join(
            repository,
            "apps/eidos-lite-desktop/resources/plugin-sandbox",
            filename
          ),
          "utf8"
        ),
        "native fixture"
      )
    } finally {
      await rm(repository, { recursive: true, force: true })
    }
  })
}
