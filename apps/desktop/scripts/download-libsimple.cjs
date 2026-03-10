const fs = require("fs")
const path = require("path")
const https = require("https")
const { execSync } = require("child_process")
const { downloadFile } = require("./download-utils.cjs") // Import the shared function

function getPlatformInfo() {
  const platform = process.platform
  const arch = process.arch // Get the architecture

  switch (platform) {
    case "win32":
      // Support both x64 and arm64 architectures
      if (arch === "arm64") {
        return { name: "windows", arch: "arm64", ext: "zip" }
      }
      return { name: "windows", arch: "x64", ext: "zip" }
    case "darwin":
      // Support both x64 and arm64 architectures
      if (arch === "arm64") {
        return { name: "osx", arch: "arm64", ext: "zip" }
      }
      return { name: "osx", arch: "x64", ext: "zip" }
    case "linux":
      if (arch === "arm64" || arch === "arm") {
        return { name: "linux-ubuntu-24.04", arch: "arm", ext: "zip" }
      }
      // Defaults to 'linux-ubuntu-latest' which usually implies x64.
      // If specific ARM builds (e.g., 'linux-ubuntu-latest-arm') or versioned builds
      // (e.g., 'linux-ubuntu-22.04') are needed, this logic needs adjustment
      // based on process.arch or other environment variables/arguments.
      return { name: "linux-ubuntu-latest", arch: "", ext: "zip" } // Keep arch empty as it's part of the name
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function extract(zipPath, distPath) {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell Expand-Archive "${zipPath}" -DestinationPath . -Force`,
        {
          stdio: "inherit",
        }
      )
      const libsimpleDir = fs
        .readdirSync(".")
        .find((dir) => dir.startsWith("libsimple"))
      if (libsimpleDir) {
        execSync(
          `xcopy "${path.join(".", libsimpleDir, "*")}" "${distPath}\\" /E /I /H /Y /S`,
          {
            stdio: "inherit",
          }
        )
        const sourceDll = path.join(distPath, "simple.dll")
        const targetDll = path.join(distPath, "libsimple.dll")
        if (fs.existsSync(sourceDll)) {
          execSync(`rename "${sourceDll}" "${path.basename(targetDll)}"`, {
            stdio: "inherit",
          })
        } else {
          console.warn(`Warning: Expected DLL not found at ${sourceDll}`)
        }
        execSync(`rmdir /S /Q "${libsimpleDir}"`, { stdio: "inherit" })
      } else {
        throw new Error("Could not find extracted libsimple directory.")
      }
    } else {
      execSync(`unzip -t "${zipPath}"`, { stdio: "inherit" })
      execSync(`unzip -o "${zipPath}"`, { stdio: "inherit" })
      const libsimpleDir = fs
        .readdirSync(".")
        .find((dir) => dir.startsWith("libsimple"))
      if (libsimpleDir) {
        if (!fs.existsSync(distPath)) {
          fs.mkdirSync(distPath, { recursive: true })
        }
        execSync(`mv "${libsimpleDir}"/* "${distPath}/"`, { stdio: "inherit" })
        execSync(`rm -rf "${libsimpleDir}"`, { stdio: "inherit" })
      } else {
        throw new Error("Could not find extracted libsimple directory.")
      }
    }
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`)
  }
}

async function main() {
  let zipPath = null
  try {
    const { name, arch, ext } = getPlatformInfo()
    const fileName = `libsimple-${name}${arch ? "-" + arch : ""}.${ext}`
    const downloadUrl = `https://github.com/wangfenjin/simple/releases/latest/download/${fileName}`
    zipPath = path.join(__dirname, "..", "libsimple.zip")
    const distPath = path.join(__dirname, "..", "dist-sqlite-ext")

    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true })
    }

    console.log(`Downloading ${downloadUrl}...`)
    await downloadFile(downloadUrl, zipPath)

    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
      throw new Error("Download failed: File is missing or empty")
    }

    console.log("Extracting...")
    await extract(zipPath, distPath)

    // Cleanup
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }

    console.log("libsimple downloaded and extracted successfully!")
    process.exit(0) // 显式退出进程
  } catch (error) {
    console.error("Error:", error.message)
    // Cleanup on error
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }
    process.exit(1)
  }
}

main()
