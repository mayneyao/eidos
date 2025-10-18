#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { serveCommand } from './commands/serve';
import { openCommand } from './commands/open';
import { installCommand, uninstallCommand, statusCommand } from './commands/install';

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

