const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

// macOS app icon required sizes
const MACOS_ICON_SIZES = [
  { size: 16, scale: 1, filename: "icon_16x16.png" },
  { size: 16, scale: 2, filename: "icon_16x16@2x.png" },
  { size: 32, scale: 1, filename: "icon_32x32.png" },
  { size: 32, scale: 2, filename: "icon_32x32@2x.png" },
  { size: 128, scale: 1, filename: "icon_128x128.png" },
  { size: 128, scale: 2, filename: "icon_128x128@2x.png" },
  { size: 256, scale: 1, filename: "icon_256x256.png" },
  { size: 256, scale: 2, filename: "icon_256x256@2x.png" },
  { size: 512, scale: 1, filename: "icon_512x512.png" },
  { size: 512, scale: 2, filename: "icon_512x512@2x.png" },
]

/**
 * Check system dependencies
 */
function checkDependencies() {
  const dependencies = [
    { command: "sips", name: "sips (macOS built-in)", required: true },
  ]

  let allDepsAvailable = true

  for (const dep of dependencies) {
    try {
      execSync(`which ${dep.command}`, { stdio: "pipe" })
      console.log(`✓ ${dep.name} is available`)
    } catch (error) {
      if (dep.required) {
        console.error(`✗ ${dep.name} not found`)
        allDepsAvailable = false
      } else {
        console.warn(`⚠ ${dep.name} not found (optional)`)
      }
    }
  }

  return allDepsAvailable
}

/**
 * Validate input PNG file
 */
function validateInputPNG(pngPath) {
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Input file does not exist: ${pngPath}`)
  }

  const stats = fs.statSync(pngPath)
  if (stats.size === 0) {
    throw new Error(`Input file is empty: ${pngPath}`)
  }

  // Check if file is a valid PNG
  try {
    const result = execSync(`sips -g pixelHeight -g pixelWidth "${pngPath}"`, {
      encoding: "utf8",
      stdio: "pipe",
    })

    const lines = result.split("\n")
    const widthLine = lines.find((line) => line.includes("pixelWidth"))
    const heightLine = lines.find((line) => line.includes("pixelHeight"))

    if (!widthLine || !heightLine) {
      throw new Error("Unable to read image dimensions")
    }

    const width = parseInt(widthLine.split(":")[1].trim())
    const height = parseInt(heightLine.split(":")[1].trim())

    console.log(`Input image dimensions: ${width}x${height}`)

    if (width < 512 || height < 512) {
      console.warn(
        "⚠ Warning: Input image is smaller than 512x512, may affect large icon quality"
      )
    }

    if (width !== height) {
      console.warn(
        "⚠ Warning: Input image is not square, will be cropped to square"
      )
    }

    return { width, height }
  } catch (error) {
    throw new Error(`Failed to validate PNG file: ${error.message}`)
  }
}

/**
 * Generate single icon size
 */
function generateSingleIcon(inputPath, outputPath, targetSize) {
  try {
    // Use sips to resize image
    const command = `sips -z ${targetSize} ${targetSize} "${inputPath}" --out "${outputPath}"`
    execSync(command, { stdio: "pipe" })

    console.log(
      `✓ Generated ${path.basename(outputPath)} (${targetSize}x${targetSize})`
    )
    return true
  } catch (error) {
    console.error(
      `✗ Failed to generate ${path.basename(outputPath)}: ${error.message}`
    )
    return false
  }
}

/**
 * Generate iconset directory
 */
function generateIconset(inputPngPath, outputDir) {
  const iconsetDir = path.join(outputDir, "logo.iconset")

  // Create iconset directory
  if (fs.existsSync(iconsetDir)) {
    execSync(`rm -rf "${iconsetDir}"`, { stdio: "pipe" })
  }
  fs.mkdirSync(iconsetDir, { recursive: true })

  console.log(`Created iconset directory: ${iconsetDir}`)

  let successCount = 0

  // Generate all icon sizes
  for (const iconSpec of MACOS_ICON_SIZES) {
    const targetSize = iconSpec.size * iconSpec.scale
    const outputPath = path.join(iconsetDir, iconSpec.filename)

    if (generateSingleIcon(inputPngPath, outputPath, targetSize)) {
      successCount++
    }
  }

  console.log(
    `\nSuccessfully generated ${successCount}/${MACOS_ICON_SIZES.length} icon files`
  )

  return iconsetDir
}

/**
 * Convert iconset to .icns file
 */
function convertToIcns(iconsetDir, outputPath) {
  try {
    if (process.platform !== "darwin") {
      throw new Error("iconutil is only available on macOS")
    }

    console.log("\nConverting to .icns file...")
    const command = `iconutil -c icns "${iconsetDir}" -o "${outputPath}"`
    execSync(command, { stdio: "inherit" })

    console.log(`✓ Successfully generated ${outputPath}`)
    return true
  } catch (error) {
    console.error(`✗ Failed to convert to .icns: ${error.message}`)
    return false
  }
}

/**
 * Clean up temporary files
 */
function cleanup(iconsetDir, keepIconset = false) {
  if (!keepIconset && fs.existsSync(iconsetDir)) {
    try {
      execSync(`rm -rf "${iconsetDir}"`, { stdio: "pipe" })
      console.log("✓ Cleaned up temporary files")
    } catch (error) {
      console.warn(`⚠ Failed to clean up temporary files: ${error.message}`)
    }
  }
}

/**
 * Main function
 */
function generateMacOSAppIcon(options = {}) {
  const {
    inputPng = path.join(__dirname, "../public/logo.png"),
    outputPath = path.join(__dirname, "../public/logo.icns"),
    keepIconset = false,
  } = options

  console.log("🎨 macOS App Icon Generator")
  console.log("=====================================\n")

  try {
    // Check system dependencies
    console.log("1. Checking system dependencies...")
    if (!checkDependencies()) {
      throw new Error("Missing required system dependencies")
    }

    // Validate input file
    console.log("\n2. Validating input file...")
    const inputPath = path.resolve(inputPng)
    console.log(`Input file: ${inputPath}`)
    validateInputPNG(inputPath)

    // Generate iconset
    console.log("\n3. Generating icon files...")
    const outputDir = path.dirname(outputPath)
    const iconsetDir = generateIconset(inputPath, outputDir)

    // Convert to .icns
    console.log("\n4. Converting to .icns file...")
    const icnsSuccess = convertToIcns(iconsetDir, outputPath)

    // Clean up temporary files
    console.log("\n5. Cleaning up temporary files...")
    cleanup(iconsetDir, keepIconset)

    // Output result
    console.log("\n🎉 Icon generation completed!")
    console.log("=====================================")
    console.log(`✓ Output file: ${outputPath}`)
    if (keepIconset) {
      console.log(`✓ Iconset directory: ${path.basename(iconsetDir)}`)
    }

    return true
  } catch (error) {
    console.error(`\n❌ Generation failed: ${error.message}`)
    return false
  }
}

/**
 * Command line entry point
 */
function main() {
  const args = process.argv.slice(2)
  const options = {}

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case "--input":
      case "-i":
        options.inputPng = args[++i]
        break
      case "--output":
      case "-o":
        options.outputPath = args[++i]
        break
      case "--keep-iconset":
      case "-k":
        options.keepIconset = true
        break
      case "--help":
      case "-h":
        console.log(`
macOS App Icon Generator

Usage:
  node generate-icons.cjs [options]

Options:
  -i, --input <file>     Input PNG file path (default: ../public/logo.png)
  -o, --output <file>    Output .icns file path (default: ../public/logo.icns)
  -k, --keep-iconset     Keep iconset directory
  -h, --help             Show help information

Examples:
  node generate-icons.cjs
  node generate-icons.cjs -i my-icon.png -o my-app.icns
  node generate-icons.cjs --input logo.png --keep-iconset
`)
        return
      default:
        console.warn(`Unknown argument: ${arg}`)
    }
  }

  const success = generateMacOSAppIcon(options)
  process.exit(success ? 0 : 1)
}

// Run script if called directly
if (require.main === module) {
  main()
}

module.exports = { generateMacOSAppIcon }
