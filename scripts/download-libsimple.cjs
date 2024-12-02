const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getPlatformInfo() {
  const platform = process.platform;
  switch (platform) {
    case 'win32':
      return { name: 'windows', arch: 'x64', ext: 'zip' };
    case 'darwin':
      return { name: 'osx', arch: 'x64', ext: 'zip' };
    case 'linux':
      return { name: 'linux-ubuntu-latest', arch: '', ext: 'zip' };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const request = https.get(url, (response) => {
      // Check if the request was redirected
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      // Check for successful response
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        // Verify file size
        const stats = fs.statSync(destPath);
        if (stats.size === 0) {
          fs.unlinkSync(destPath);
          reject(new Error('Downloaded file is empty'));
          return;
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => reject(err));
    });

    file.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => reject(err));
    });

    // Set timeout
    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, () => reject(new Error('Download timeout')));
    });
  });
}

async function extract(zipPath, distPath) {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell Expand-Archive "${zipPath}" -DestinationPath . -Force`, { stdio: 'inherit' });
      const libsimpleDir = fs.readdirSync('.').find(dir => dir.startsWith('libsimple'));
      if (libsimpleDir) {
        execSync(`move "${libsimpleDir}" dist-simple`, { stdio: 'inherit' });
        execSync(`rename "dist-simple\\simple.dll" "libsimple.dll"`, { stdio: 'inherit' });
      }
    } else {
      execSync(`unzip -t "${zipPath}"`, { stdio: 'inherit' });
      execSync(`unzip -o "${zipPath}"`, { stdio: 'inherit' });
      const libsimpleDir = fs.readdirSync('.').find(dir => dir.startsWith('libsimple'));
      if (libsimpleDir) {
        execSync(`mv "${libsimpleDir}"/* dist-simple/`, { stdio: 'inherit' });
        execSync(`rm -rf "${libsimpleDir}"`, { stdio: 'inherit' });
      }
    }
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

async function main() {
  let zipPath = null;
  try {
    const { name, arch, ext } = getPlatformInfo();
    const fileName = `libsimple-${name}${arch ? '-' + arch : ''}.${ext}`;
    const downloadUrl = `https://github.com/wangfenjin/simple/releases/latest/download/${fileName}`;
    zipPath = path.join(__dirname, '..', 'libsimple.zip');
    const distPath = path.join(__dirname, '..', 'dist-simple');

    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }

    console.log(`Downloading ${downloadUrl}...`);
    await downloadFile(downloadUrl, zipPath);

    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
      throw new Error('Download failed: File is missing or empty');
    }

    console.log('Extracting...');
    await extract(zipPath, distPath);

    // Cleanup
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    console.log('libsimple downloaded and extracted successfully!');
    process.exit(0); // 显式退出进程
  } catch (error) {
    console.error('Error:', error.message);
    // Cleanup on error
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    process.exit(1);
  }
}

main(); 