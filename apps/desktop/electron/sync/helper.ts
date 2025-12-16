// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
// AWS_REGION
// AWS_ENDPOINT (for S3-compatible services like MinIO, R2, etc.)

import path from "path";
import fs from "node:fs";
import type { SyncBucketCredentials } from "../credentials";
import type { SpaceInfo } from "../space-registry";


// --- START: Helper function to apply Graft Config to Environment --- 
export  function applyGraftConfigToEnv(space: SpaceInfo, credentials: SyncBucketCredentials) {
    try {
        const remoteSpaceId = space.sync?.remote?.split('/').pop()?.split('.')[0];
        if (!remoteSpaceId) {
            throw new Error(`Remote space id not found in ${space.sync?.remote}. Please check the remote url.`);
        }

        const graftConfigPath = path.join(space.path, '.eidos', 'graft.toml');
        if (!(fs.existsSync(graftConfigPath))) {
            console.warn(`Graft config file ${graftConfigPath} not found, creating sample config`);
            // Write sample graft config
            const sampleConfig = `
data_dir = "${path.join(space.path, '.eidos', '.graft')}"
[remote]
type = "s3_compatible"
bucket = "${credentials.bucketName}"
prefix = "${remoteSpaceId}"

# Configure your S3-compatible storage credentials here
# bucket: Your S3 bucket name
# prefix: Optional path prefix within the bucket
`;

            fs.writeFileSync(graftConfigPath, sampleConfig, 'utf-8');
            console.log(`Created sample graft config at ${graftConfigPath}`);
        }


        const graftDataDir = path.join(space.path, '.eidos', '.graft');
        if (!(fs.existsSync(graftDataDir))) {
            console.log(`Graft data directory ${graftDataDir} not found, creating it`);
            fs.mkdirSync(graftDataDir, { recursive: true });
        }
        process.env.GRAFT_CONFIG = graftConfigPath;
        console.log(`Set GRAFT_CONFIG=${graftConfigPath}`);
        process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
        console.log(`Set AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`);
        process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
        console.log(`Set AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`);
        process.env.AWS_REGION = 'auto';
        console.log(`Set AWS_REGION=auto`);
        process.env.AWS_ENDPOINT = credentials.endpoint;
        console.log(`Set AWS_ENDPOINT=${credentials.endpoint}`);

    } catch (error) {
        console.error('Failed to read graft config or set environment variables:', error);
        // Decide if this is fatal. For now, just log and continue.
    }
}
// --- END: Helper function --- 
