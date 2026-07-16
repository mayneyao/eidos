const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const WINDOWS_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

function runMagick(args) {
  execFileSync("magick", args, { stdio: "pipe" })
}

function checkDependencies() {
  try {
    runMagick(["-version"])
  } catch {
    throw new Error(
      "ImageMagick 7 is required. Install it and make sure `magick` is on PATH."
    )
  }
}

function validateInputSvg(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input SVG does not exist: ${inputPath}`)
  }

  const source = fs.readFileSync(inputPath, "utf8")
  if (!source.includes("<svg")) {
    throw new Error(`Input is not an SVG file: ${inputPath}`)
  }
}

function generateWindowsIcon(options = {}) {
  const inputPath = path.resolve(
    options.inputSvg || path.join(__dirname, "../public/logo.svg")
  )
  const outputPath = path.resolve(
    options.outputPath || path.join(__dirname, "../public/logo.ico")
  )

  checkDependencies()
  validateInputSvg(inputPath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-windows-icon-"))

  try {
    const pngPaths = WINDOWS_ICON_SIZES.map((size) => {
      const pngPath = path.join(tempDir, `logo-${size}.png`)

      // Supersample the SVG before reducing it to each final size so diagonal
      // edges stay crisp without deriving small icons from a pre-rasterized PNG.
      runMagick([
        "-background",
        "none",
        "-density",
        "384",
        inputPath,
        "-filter",
        "Lanczos",
        "-resize",
        `${size}x${size}`,
        "-colorspace",
        "sRGB",
        "-strip",
        "-depth",
        "8",
        `PNG32:${pngPath}`,
      ])

      return pngPath
    })

    runMagick([...pngPaths, outputPath])
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true })
  }

  console.log(`Generated ${outputPath} (${WINDOWS_ICON_SIZES.join(", ")} px)`)
}

function main() {
  const args = process.argv.slice(2)
  const options = {}

  for (let index = 0; index < args.length; index++) {
    switch (args[index]) {
      case "--input":
      case "-i":
        options.inputSvg = args[++index]
        break
      case "--output":
      case "-o":
        options.outputPath = args[++index]
        break
      case "--help":
      case "-h":
        console.log(`
Windows App Icon Generator

Usage:
  node generate-windows-icon.cjs [options]

Options:
  -i, --input <file>   Input SVG (default: ../public/logo.svg)
  -o, --output <file>  Output ICO (default: ../public/logo.ico)
  -h, --help           Show this help
`)
        return
      default:
        throw new Error(`Unknown argument: ${args[index]}`)
    }
  }

  generateWindowsIcon(options)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`Failed to generate Windows icon: ${error.message}`)
    process.exit(1)
  }
}

module.exports = { generateWindowsIcon, WINDOWS_ICON_SIZES }
