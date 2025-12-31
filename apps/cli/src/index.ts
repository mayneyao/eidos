#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { serveCommand } from './commands/serve';
import { openCommand } from './commands/open';
import { installCommand, uninstallCommand, statusCommand } from './commands/install';
import { mountCommand } from './commands/mount';
import { unmountCommand } from './commands/unmount';
import { graftInitCommand } from './commands/graft';

const program = new Command();

program
  .name('eidos')
  .description('Eidos CLI - Initialize and manage Eidos spaces')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new Eidos space')
  .argument('[path]', 'Path to initialize the space (defaults to current directory)')
  .option('-n, --name <name>', 'Custom name for the space')
  .action(async (targetPath?: string, options?: { name?: string }) => {
    await initCommand({
      path: targetPath,
      name: options?.name,
    });
  });

program
  .command('serve')
  .description('Start API server for a space (like "npm serve")')
  .argument('[path]', 'Path to the space (defaults to current directory)')
  .option('-p, --port <port>', 'Port to listen on', '13128')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .action(async (targetPath?: string, options?: { port?: string; host?: string }) => {
    await serveCommand({
      path: targetPath,
      port: options?.port ? parseInt(options.port) : 13128,
      host: options?.host,
    });
  });

program
  .command('open')
  .description('Open a space in Eidos desktop app (like "code .")')
  .argument('[path]', 'Path to the space (defaults to current directory)')
  .action(async (targetPath?: string) => {
    await openCommand({
      path: targetPath,
    });
  });

program
  .command('install')
  .description('Install eidos command to PATH (requires sudo)')
  .action(async () => {
    await installCommand();
  });

program
  .command('uninstall')
  .description('Uninstall eidos command from PATH (requires sudo)')
  .action(async () => {
    await uninstallCommand();
  });

program
  .command('status')
  .description('Show installation status')
  .action(() => {
    statusCommand();
  });

program
  .command('mount')
  .description('Mount an external directory')
  .argument('<name>', 'mount name')
  .argument('<path>', 'directory path to mount')
  .action(async (name: string, dirPath: string) => {
    await mountCommand(name, dirPath);
  });

program
  .command('unmount')
  .description('Remove a mounted directory')
  .argument('<name>', 'mount name to remove')
  .action(async (name: string) => {
    await unmountCommand(name);
  });

// Graft command
const graftCommand = program
  .command('graft')
  .description('Graft storage management commands');

graftCommand
  .command('init')
  .description('Initialize graft storage for syncing')
  .argument('[path]', 'Path to the space (defaults to current directory)')
  .option('-r, --remote <url>', 'Remote graft URL (e.g., https://eidos.space/username/space.graft)')
  .option('--access-key-id <key>', 'AWS access key ID')
  .option('--secret-access-key <key>', 'AWS secret access key')
  .option('--bucket-name <name>', 'S3 bucket name (default: eidos-sync)')
  .option('--endpoint <url>', 'S3 endpoint URL (default: https://s3.eidos.space)')
  .action(async (targetPath?: string, options?: {
    remote?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    endpoint?: string;
  }) => {
    await graftInitCommand({
      path: targetPath,
      ...options,
    });
  });

// Default action: if a single argument is provided without a command, treat it as 'open'
// This allows: eidos . or eidos /path/to/space (like code .)
program
  .argument('[path]', 'Path to open (shortcut for "eidos open [path]")')
  .action(async (targetPath?: string) => {
    // Only run this if no command was matched
    if (targetPath) {
      await openCommand({ path: targetPath });
    }
  });

program.parse(process.argv);

