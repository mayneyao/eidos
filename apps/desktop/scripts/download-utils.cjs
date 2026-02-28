const fs = require("fs")
const https = require("https")

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to download from: ${url}`)
    const file = fs.createWriteStream(destPath)

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log(`Redirected to: ${response.headers.location}`)
        file.close()
        fs.unlink(destPath, (err) => {
          // Use async unlink
          if (err && err.code !== "ENOENT") {
            // Ignore if file doesn't exist
            console.error(
              `Error removing temp file before redirect: ${err.message}`
            )
          }
          // Recursively call downloadFile with the new URL
          downloadFile(response.headers.location, destPath)
            .then(resolve)
            .catch(reject)
        })
        return
      }

      // Check for successful response
      if (response.statusCode !== 200) {
        file.close()
        fs.unlink(destPath, (err) => {
          // Use async unlink
          if (err && err.code !== "ENOENT") {
            console.error(
              `Error removing temp file after failed download: ${err.message}`
            )
          }
          reject(
            new Error(
              `Failed to download: ${response.statusCode} ${response.statusMessage} from ${url}`
            )
          )
        })
        return
      }

      response.pipe(file)

      file.on("finish", () => {
        file.close((closeErr) => {
          if (closeErr) {
            return reject(
              new Error(`Error closing file stream: ${closeErr.message}`)
            )
          }
          // Verify file size after closing
          fs.stat(destPath, (statErr, stats) => {
            if (statErr) {
              return reject(
                new Error(`Error stating downloaded file: ${statErr.message}`)
              )
            }
            if (stats.size === 0) {
              fs.unlink(destPath, (unlinkErr) => {
                if (unlinkErr && unlinkErr.code !== "ENOENT") {
                  console.error(
                    `Error removing empty file: ${unlinkErr.message}`
                  )
                }
                reject(new Error("Downloaded file is empty"))
              })
              return
            }
            console.log(`File downloaded successfully to ${destPath}`)
            resolve()
          })
        })
      })
    })

    request.on("error", (err) => {
      file.close()
      fs.unlink(destPath, (unlinkErr) => {
        // Use async unlink
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          console.error(
            `Error removing temp file on request error: ${unlinkErr.message}`
          )
        }
        reject(new Error(`Request error: ${err.message}`))
      })
    })

    file.on("error", (err) => {
      // Handle stream errors
      request.destroy() // Abort the request if the stream fails
      fs.unlink(destPath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          console.error(
            `Error removing temp file on file stream error: ${unlinkErr.message}`
          )
        }
        reject(new Error(`File stream error: ${err.message}`))
      })
    })

    // Set timeout
    request.setTimeout(60000, () => {
      // Increased timeout
      request.destroy()
      file.close()
      fs.unlink(destPath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          console.error(
            `Error removing temp file on timeout: ${unlinkErr.message}`
          )
        }
        reject(new Error("Download timeout after 60 seconds"))
      })
    })
  })
}

module.exports = { downloadFile }
