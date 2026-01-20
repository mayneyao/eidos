const fs = require('fs');
const https = require('https');

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to download from: ${url}`);
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log(`Redirected to: ${response.headers.location}`);
        file.close();
        fs.unlink(destPath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error(`Error removing temp file before redirect: ${err.message}`);
            }
             downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        });
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
         fs.unlink(destPath, (err) => {
             if (err && err.code !== 'ENOENT') {
                 console.error(`Error removing temp file after failed download: ${err.message}`);
             }
             reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage} from ${url}`));
         });
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close((closeErr) => {
            if (closeErr) {
                return reject(new Error(`Error closing file stream: ${closeErr.message}`));
            }
             fs.stat(destPath, (statErr, stats) => {
                if (statErr) {
                    return reject(new Error(`Error stating downloaded file: ${statErr.message}`));
                }
                if (stats.size === 0) {
                    fs.unlink(destPath, (unlinkErr) => {
                        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                             console.error(`Error removing empty file: ${unlinkErr.message}`);
                        }
                        reject(new Error('Downloaded file is empty'));
                    });
                    return;
                }
                console.log(`File downloaded successfully to ${destPath}`);
                resolve();
            });
        });
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, (unlinkErr) => {
           if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                console.error(`Error removing temp file on request error: ${unlinkErr.message}`);
           }
           reject(new Error(`Request error: ${err.message}`));
       });
    });

    file.on('error', (err) => {
      request.destroy();
      fs.unlink(destPath, (unlinkErr) => {
           if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                console.error(`Error removing temp file on file stream error: ${unlinkErr.message}`);
           }
           reject(new Error(`File stream error: ${err.message}`));
       });
    });

    request.setTimeout(60000, () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, (unlinkErr) => {
           if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                console.error(`Error removing temp file on timeout: ${unlinkErr.message}`);
           }
           reject(new Error('Download timeout after 60 seconds'));
       });
    });
  });
}

module.exports = { downloadFile };
