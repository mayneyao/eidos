import { execSync } from 'child_process';
import { existsSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Install the eidos command globally
 */
export async function installCommand() {
  try {
    const binPath = '/usr/local/bin/eidos';
    
    // Find the CLI executable
    let cliPath: string | undefined;
    
    // Detect if running from built executable or dev
    // When built, process.execPath points to the executable
    const executablePath = process.execPath;
    
    // Check multiple possible locations for the built executable
    const possibleBuiltPaths = [
      path.resolve(process.cwd(), 'dist/eidos'),
      path.resolve(__dirname, '../../dist/eidos'),
      executablePath.endsWith('/eidos') ? executablePath : null,
    ].filter(Boolean) as string[];
    
    let foundBuilt = false;
    for (const builtPath of possibleBuiltPaths) {
      if (existsSync(builtPath)) {
        cliPath = builtPath;
        foundBuilt = true;
        logger.info(`Found built executable: ${builtPath}`);
        break;
      }
    }
    
    if (!foundBuilt) {
      // Development mode - create a wrapper script in temp or project dir
      const projectRoot = process.cwd();
      const devWrapperPath = path.join(projectRoot, 'eidos-dev');
      
      // Create a dev wrapper script
      const wrapperContent = `#!/bin/bash
cd "${projectRoot}"
bun run src/index.ts "$@"
`;
      
      try {
        const fs = await import('fs/promises');
        await fs.writeFile(devWrapperPath, wrapperContent, { mode: 0o755 });
        cliPath = devWrapperPath;
        logger.warn('Installing development version (will run via Bun)');
        logger.info(`Created wrapper at: ${devWrapperPath}`);
      } catch (error) {
        logger.error('Failed to create development wrapper');
        throw error;
      }
    }
    
    // Ensure cliPath is defined before using it
    if (!cliPath) {
      throw new Error('Failed to determine CLI path');
    }

    // Check if symlink already exists
    if (existsSync(binPath)) {
      try {
        const currentLink = readlinkSync(binPath);
        if (currentLink === cliPath) {
          logger.log('✓ Command is already installed');
          logger.info(`\nYou can now use: eidos init`);
          return;
        }
        
        // Different target - ask to overwrite
        logger.warn(`\n⚠️  A different 'eidos' command already exists at ${binPath}`);
        logger.info(`   Current: ${currentLink}`);
        logger.info(`   New:     ${cliPath}`);
        logger.info(`\nTo overwrite, run: sudo rm ${binPath} && eidos install`);
        process.exit(1);
      } catch (error) {
        // Not a symlink or can't read
        logger.error(`\n✗ File exists at ${binPath} and is not a symlink`);
        logger.info(`  Please remove it manually: sudo rm ${binPath}`);
        process.exit(1);
      }
    }

    // Create symlink (requires sudo)
    logger.info(`Installing 'eidos' command to ${binPath}...`);
    logger.info(`Source: ${cliPath}`);
    
    try {
      symlinkSync(cliPath, binPath);
      logger.log('\n✨ Successfully installed!');
      logger.log('\nYou can now use the following commands:');
      logger.log('  eidos init [path]           # Initialize a new space');
      logger.log('  eidos init --name "Name"    # Initialize with custom name');
      logger.info('\nNote: You may need to restart your terminal for the command to be available.');
    } catch (error: any) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        logger.error('\n✗ Permission denied. Please run with sudo:');
        logger.info(`  sudo ${process.argv.slice(0, 2).join(' ')} install`);
        process.exit(1);
      }
      throw error;
    }

  } catch (error: any) {
    logger.error(`Failed to install command: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Uninstall the eidos command
 */
export async function uninstallCommand() {
  try {
    const binPath = '/usr/local/bin/eidos';

    if (!existsSync(binPath)) {
      logger.warn('Command is not installed');
      return;
    }

    try {
      unlinkSync(binPath);
      logger.log('✓ Successfully uninstalled the eidos command');
    } catch (error: any) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        logger.error('\n✗ Permission denied. Please run with sudo:');
        logger.info(`  sudo ${process.argv.slice(0, 2).join(' ')} uninstall`);
        process.exit(1);
      }
      throw error;
    }

  } catch (error: any) {
    logger.error(`Failed to uninstall command: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Show installation status
 */
export function statusCommand() {
  const binPath = '/usr/local/bin/eidos';
  
  if (!existsSync(binPath)) {
    logger.info('Status: Not installed');
    logger.info('\nTo install, run:');
    logger.info('  bun run dev install');
    logger.info('  # or after building:');
    logger.info('  ./dist/eidos install');
    return;
  }

  try {
    const target = readlinkSync(binPath);
    logger.log('Status: Installed');
    logger.info(`Location: ${binPath}`);
    logger.info(`Target:   ${target}`);
    
    // Check if target exists
    if (!existsSync(target)) {
      logger.warn('\n⚠️  Warning: Target file does not exist');
      logger.info('   Run reinstall or uninstall');
    } else {
      logger.log('\n✓ Command is working correctly');
    }
  } catch (error) {
    logger.warn('Status: Installed (not a symlink)');
    logger.info(`Location: ${binPath}`);
  }
}

