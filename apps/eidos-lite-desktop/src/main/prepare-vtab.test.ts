import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it.each([
  [
    "darwin",
    "arm64",
    "libfs_meta-aarch64-apple-darwin.dylib",
    "libfs_meta.dylib",
  ],
  ["darwin", "x64", "libfs_meta-x86_64-apple-darwin.dylib", "libfs_meta.dylib"],
  [
    "linux",
    "arm64",
    "libfs_meta-aarch64-unknown-linux-gnu.so",
    "libfs_meta.so",
  ],
  ["linux", "x64", "libfs_meta-x86_64-unknown-linux-gnu.so", "libfs_meta.so"],
  ["win32", "x64", "fs_meta-x86_64-pc-windows-msvc.dll", "fs_meta.dll"],
])(
  "verifies %s/%s release checksums before installing the extension",
  async (platform, arch, asset, binary) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vtab-package-"))
    try {
      await fs.mkdir(path.join(root, "scripts"))
      const script = path.join(root, "scripts/prepare-vtab.mjs")
      await fs.copyFile(
        fileURLToPath(
          new URL("../../scripts/prepare-vtab.mjs", import.meta.url)
        ),
        script
      )
      const bootstrap = (valid: boolean) => `
      import { createHash } from 'node:crypto';
      const data = Buffer.from('extension fixture');
      globalThis.fetch = async url => {
        if (String(url).endsWith('/SHA256SUMS')) return new Response(${valid ? "createHash('sha256').update(data).digest('hex')" : "'0'.repeat(64)"} + '  ' + ${JSON.stringify(asset)});
        if (!String(url).endsWith('/' + ${JSON.stringify(asset)})) throw Error('Wrong platform asset: ' + url);
        return new Response(data);
      };
      await import(${JSON.stringify(pathToFileURL(script).href)});
    `
      const run = (valid: boolean) =>
        execFileSync(
          process.execPath,
          ["--input-type=module", "--eval", bootstrap(valid)],
          {
            env: {
              ...process.env,
              ELECTRON_RUN_AS_NODE: "1",
              TARGET_PLATFORM: platform,
              TARGET_ARCH: arch,
              SQLITE_FS_META_PATH: "",
              FORCE_DOWNLOAD: "1",
            },
            stdio: "pipe",
          }
        )
      expect(() => run(false)).toThrow()
      await expect(
        fs.stat(path.join(root, "resources/vtab", binary))
      ).rejects.toMatchObject({ code: "ENOENT" })
      run(true)
      expect(
        await fs.readFile(path.join(root, "resources/vtab", binary), "utf8")
      ).toBe("extension fixture")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }
)
