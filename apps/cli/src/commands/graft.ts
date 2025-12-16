import path from 'path';
import fs from 'fs';
import os from 'os';
import { Database } from 'bun:sqlite';
import { getExtensionPaths } from '../utils/extensions';
import { logger } from '../utils/logger';
import { parseGraftNew } from '@/packages/sync/graft/helpers';
import { getSpaceRegistry } from '@eidos.space/space-manager';

export interface GraftInitOptions {
  path?: string;
  remote?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  endpoint?: string;
}

interface SyncCredentials {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/**
 * Apply Graft Config to Environment
 */
function applyGraftConfigToEnv(spacePath: string, remoteSpaceId: string, credentials: SyncCredentials) {
  try {
    const graftConfigPath = path.join(spacePath, '.eidos', 'graft.toml');
    const graftDirPath = path.join(spacePath, '.eidos', '.graft');
    
    // Ensure .graft directory exists
    if (!fs.existsSync(graftDirPath)) {
      fs.mkdirSync(graftDirPath, { recursive: true });
      logger.info(`Created graft directory: ${graftDirPath}`);
    }

    // Create graft.toml config file
    const graftConfig = `
data_dir = "${graftDirPath.replace(/\\/g, '/')}"
[remote]
type = "s3_compatible"
bucket = "${credentials.bucketName}"
prefix = "${remoteSpaceId}"

# Configure your S3-compatible storage credentials here
# bucket: Your S3 bucket name
# prefix: Optional path prefix within the bucket
`;

    fs.writeFileSync(graftConfigPath, graftConfig, 'utf-8');
    logger.info(`Created graft config at: ${graftConfigPath}`);

    // Set environment variables
    process.env.GRAFT_CONFIG = graftConfigPath;
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    process.env.AWS_REGION = 'auto';
    process.env.AWS_ENDPOINT = credentials.endpoint;

    logger.info(`Set GRAFT_CONFIG=${graftConfigPath}`);
    logger.info(`Set AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`);
    logger.info(`Set AWS_REGION=auto`);
    logger.info(`Set AWS_ENDPOINT=${credentials.endpoint}`);
  } catch (error: any) {
    throw new Error(`Failed to apply graft config: ${error.message}`);
  }
}

/**
 * Register Graft VFS
 */
function registerGraftVFS(db: Database, graftLibPath: string): void {
  try {
    db.loadExtension(graftLibPath);
    logger.info('Loaded graft extension successfully');
  } catch (err: any) {
    throw new Error(`Failed to load graft VFS extension from ${graftLibPath}: ${err.message}`);
  }
}

/**
 * Get sync credentials from environment variables or command options
 */
function getSyncCredentials(options: GraftInitOptions): SyncCredentials {
  const accessKeyId = options.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = options.bucketName || process.env.AWS_BUCKET_NAME || 'eidos-sync';
  const endpoint = options.endpoint || process.env.AWS_ENDPOINT || 'https://s3.eidos.space';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'Sync credentials not found. Please provide credentials via options or environment variables:\n' +
      '  --access-key-id <key>     or AWS_ACCESS_KEY_ID\n' +
      '  --secret-access-key <key> or AWS_SECRET_ACCESS_KEY\n' +
      '  --bucket-name <name>      or AWS_BUCKET_NAME (optional, defaults to "eidos-sync")\n' +
      '  --endpoint <url>          or AWS_ENDPOINT (optional, defaults to "https://s3.eidos.space")'
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
  };
}

/**
 * Initialize Graft storage for a space
 * Converts db.sqlite3 to .graft storage format
 */
export async function graftInitCommand(options: GraftInitOptions = {}) {
  try {
    // Determine target path
    const targetPath = options.path ? path.resolve(options.path) : process.cwd();
    const eidosPath = path.join(targetPath, '.eidos');
    const dbPath = path.join(eidosPath, 'db.sqlite3');

    logger.info(`Initializing graft storage for space at: ${targetPath}`);

    // Validate that this is an Eidos space
    if (!fs.existsSync(eidosPath)) {
      logger.error(`Not an Eidos space: ${targetPath}`);
      logger.info('Please run "eidos init" first to initialize a space.');
      process.exit(1);
    }

    if (!fs.existsSync(dbPath)) {
      logger.error(`Database not found: ${dbPath}`);
      logger.info('Please ensure the space is properly initialized.');
      process.exit(1);
    }

    // Get sync credentials
    const credentials = getSyncCredentials(options);

    // Determine remote space ID from remote URL or generate one
    let remoteSpaceId: string;
    if (options.remote) {
      const remoteMatch = options.remote.split('/').pop()?.split('.')[0];
      if (!remoteMatch) {
        logger.error(`Invalid remote URL: ${options.remote}`);
        logger.info('Remote URL should be like: https://eidos.space/username/space-id.graft');
        process.exit(1);
      }
      remoteSpaceId = remoteMatch;
    } else {
      // Generate remote space ID from space name
      const spaceName = path.basename(targetPath);
      remoteSpaceId = spaceName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      logger.info(`Using generated remote space ID: ${remoteSpaceId}`);
    }

    // Apply graft configuration
    applyGraftConfigToEnv(targetPath, remoteSpaceId, credentials);

    // Get extension paths
    const extensions = getExtensionPaths();
    if (!fs.existsSync(extensions.graft.libPath)) {
      logger.error(`Graft extension not found: ${extensions.graft.libPath}`);
      logger.info('Please run "bun run setup" to download the required extensions.');
      process.exit(1);
    }

    // Initialize database connection with graft VFS
    logger.info('Opening database with graft VFS...');
    const db = new Database('file:main?vfs=graft');

    try {
      // Register graft VFS extension
      registerGraftVFS(db, extensions.graft.libPath);

      // Checkpoint WAL before conversion
      if (fs.existsSync(dbPath)) {
        const tempDb = new Database(dbPath);
        try {
          tempDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
          logger.info('WAL checkpoint completed');
        } finally {
          tempDb.close();
        }
      }

      // Initialize a new graft volume
      logger.info('Creating new graft volume...');
      const parsedRes = db.query('PRAGMA graft_new').all();
      const graftInfo = parseGraftNew(parsedRes);
      
      if (!graftInfo?.volumeId) {
        throw new Error('Failed to create graft volume: No volumeId returned');
      }

      logger.log(`\n✨ Graft volume created successfully!`);
      logger.log(`  Volume ID: ${graftInfo.volumeId}`);
      if (graftInfo.localLog) {
        logger.log(`  Local Log: ${graftInfo.localLog}`);
      }
      if (graftInfo.remoteLog) {
        logger.log(`  Remote Log: ${graftInfo.remoteLog}`);
      }

      // Import existing database if it exists
      if (fs.existsSync(dbPath)) {
        logger.info(`\nImporting existing database from: ${dbPath}`);
        db.run(`PRAGMA graft_import = "${dbPath}";`);
        logger.log('✓ Database imported successfully');
      }

      // Update spaces.json with volumeId
      try {
        const registry = getSpaceRegistry();
        const spaces = registry.getAllSpaces();
        const space = spaces.find(s => s.path === targetPath);

        if (space) {
          const remoteUrl = options.remote || `https://eidos.space/${os.userInfo().username}/${remoteSpaceId}.graft`;
          
          registry.setSpaceSync(space.id, {
            enabled: true,
            remote: remoteUrl,
            volumeId: graftInfo.volumeId,
          });

          logger.log(`\n✓ Updated space registry with volumeId`);
          logger.log(`  Space ID: ${space.id}`);
          logger.log(`  Remote URL: ${remoteUrl}`);
        } else {
          logger.warn(`\nSpace not found in registry. You may need to register it first.`);
          logger.info(`Run: eidos init ${targetPath}`);
        }
      } catch (error: any) {
        logger.warn(`Failed to update space registry: ${error.message}`);
        logger.info('You may need to manually update ~/.eidos/spaces.json');
      }

      logger.log(`\n✨ Graft initialization completed successfully!`);
      logger.log(`\nGraft storage location:`);
      logger.log(`  Config: ${path.join(eidosPath, 'graft.toml')}`);
      logger.log(`  Data: ${path.join(eidosPath, '.graft')}`);
      logger.log(`\nYou can now use graft commands to sync your data:`);
      logger.log(`  - graft push: Push local changes to remote`);
      logger.log(`  - graft pull: Pull remote changes to local`);
      logger.log(`  - graft status: Check sync status`);

    } finally {
      // Close database connection
      try {
        db.close();
      } catch (e) {
        // Database already closed or error closing, ignore
      }
    }

    process.exit(0);

  } catch (error: any) {
    logger.error(`Failed to initialize graft storage: ${error.message}`);
    if (error.stack) {
      logger.info(`\nDetails:\n${error.stack}`);
    }
    process.exit(1);
  }
}
