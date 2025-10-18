import { existsSync } from 'fs';
import path from 'path';
import { getSpaceRegistry } from '@eidos.space/space-manager';
import { logger } from '../utils/logger';
import { startServer } from '../server/server';

export interface ServeOptions {
  path?: string;
  port?: number;
  host?: string;
}

/**
 * Start API server for a space
 */
export async function serveCommand(options: ServeOptions = {}) {
  try {
    // Resolve target path
    const resolvedPath = options.path 
      ? path.resolve(options.path)
      : process.cwd();

    logger.info(`Checking space at ${resolvedPath}...`);

    // Check if it's a valid Eidos space
    const eidosDir = path.join(resolvedPath, '.eidos');
    const dbPath = path.join(eidosDir, 'db.sqlite3');

    if (!existsSync(eidosDir)) {
      logger.error(`Not an Eidos space: ${resolvedPath}`);
      logger.info('To initialize a new space, run: eidos init');
      process.exit(1);
    }

    if (!existsSync(dbPath)) {
      logger.error(`Invalid Eidos space (missing database): ${resolvedPath}`);
      process.exit(1);
    }

    // Check if space is registered
    const registry = getSpaceRegistry();
    const allSpaces = registry.getAllSpaces();
    let space = allSpaces.find(s => s.path === resolvedPath);

    // If not registered, register it
    if (!space) {
      logger.info('Space not registered, registering now...');
      const folderName = path.basename(resolvedPath);
      space = registry.registerSpace(resolvedPath, folderName);
      logger.log(`✓ Registered space: ${space.id}`);
    }

    // Start server
    const port = options.port || 13128;
    const host = options.host || 'localhost';

    logger.log(`Starting Eidos API server for space "${space.name}"...`);
    logger.log(`Space ID: ${space.id}`);
    logger.log(`Database: ${dbPath}`);
    logger.log('');

    await startServer({
      spaceId: space.id,
      spacePath: resolvedPath,
      port,
      host,
    });

    logger.log(`✓ Server running at http://${host}:${port}`);
    logger.log('');
    logger.log('Available endpoints:');
    logger.log(`  POST http://${host}:${port}/rpc          - RPC API`);
    logger.log(`  GET  http://${host}:${port}/files/*      - File access`);
    logger.log(`  GET  http://${host}:${port}/health       - Health check`);
    logger.log('');
    logger.log('Press Ctrl+C to stop the server');

  } catch (error: any) {
    logger.error(`Failed to start server: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
      logger.info('Port is already in use. Try a different port with --port option.');
    }
    process.exit(1);
  }
}

