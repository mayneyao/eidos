import { createSpaceInitializer } from '@eidos.space/space-manager';
import path from 'path';
import { initDatabase } from '../db/init-database';
import { getExtensionPaths, validateExtensions } from '../utils/extensions';
import { logger } from '../utils/logger';

export interface InitOptions {
  name?: string;
  path?: string;
}

export async function initCommand(options: InitOptions = {}) {
  try {
    // Validate extensions first
    const validation = validateExtensions();
    if (!validation.valid) {
      logger.error('Required SQLite extensions not found:');
      validation.missing.forEach(missing => {
        logger.error(`  - ${missing}`);
      });
      logger.info(
        '\nPlease ensure the dist-sqlite-ext directory exists with the required libraries.'
      );
      process.exit(1);
    }

    // Determine target path
    const targetPath = options.path
      ? path.resolve(options.path)
      : process.cwd();

    logger.info(`Initializing Eidos space at: ${targetPath}`);

    // Get extension paths
    const extensions = getExtensionPaths();

    // Create space initializer
    const initializer = createSpaceInitializer(
      {
        name: options.name,
        extensions,
        logger,
      },
      initDatabase
    );

    // Initialize the space
    const space = await initializer.initSpace(targetPath);

    logger.log(`\n✨ Space initialized successfully!`);
    logger.log(`\nSpace details:`);
    logger.log(`  ID:   ${space.id}`);
    logger.log(`  Name: ${space.name}`);
    logger.log(`  Path: ${space.path}`);
    logger.log(`\nYou can now:`);
    logger.log(`  - Open this space in Eidos desktop app`);
    logger.log(`  - Start adding your data and documents`);
    logger.log(`\nSpace location: ${path.join(space.path, '.eidos')}`);

    // Exit cleanly
    process.exit(0);

  } catch (error: any) {
    logger.error(`Failed to initialize space: ${error.message}`);
    if (error.stack) {
      logger.info(`\nDetails:\n${error.stack}`);
    }
    process.exit(1);
  }
}

