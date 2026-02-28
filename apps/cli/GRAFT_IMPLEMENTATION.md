# Graft Init Command Implementation

## Overview

Implemented `eidos graft init` command in the CLI to convert Eidos spaces to use graft storage format for remote synchronization.

## What Was Implemented

### 1. New Command File: `src/commands/graft.ts`

**Main Function:** `graftInitCommand(options: GraftInitOptions)`

**Key Features:**

- Validates the space exists and has a valid database
- Accepts credentials via command-line options or environment variables
- Loads the graft SQLite extension
- Creates a new graft volume using `PRAGMA graft_new`
- Imports existing `db.sqlite3` data using `PRAGMA graft_import`
- Creates `graft.toml` configuration file
- Updates `~/.eidos/spaces.json` with volumeId

**Process Flow:**

```
1. Validate space path and database existence
2. Get S3 credentials (from options or env vars)
3. Create .eidos/.graft directory
4. Generate graft.toml configuration
5. Set environment variables (GRAFT_CONFIG, AWS_*)
6. Open database with graft VFS (file:main?vfs=graft)
7. Load graft extension
8. Execute PRAGMA graft_new → get volumeId
9. Execute PRAGMA graft_import → import existing data
10. Update space registry with volumeId
```

### 2. CLI Integration: `src/index.ts`

Added graft command with subcommand structure:

```bash
eidos graft init [path] [options]
```

**Options:**

- `-r, --remote <url>` - Remote graft URL
- `--access-key-id <key>` - AWS access key ID
- `--secret-access-key <key>` - AWS secret access key
- `--bucket-name <name>` - S3 bucket name (default: eidos-sync)
- `--endpoint <url>` - S3 endpoint URL (default: https://s3.eidos.space)

### 3. Package Dependencies: `package.json`

Added required dependencies:

- Bun's built-in SQLite (`bun:sqlite`) - For SQLite database operations with extension support
- `@eidos.space/sync` - For graft helper functions (parseGraftNew)

### 4. Documentation: `README.md`

Added comprehensive documentation including:

- Command usage examples
- Credential configuration options
- What the command does
- Post-initialization next steps

## Key Implementation Details

### Graft Configuration File Format

```toml
data_dir = "/path/to/space/.eidos/.graft"
[remote]
type = "s3_compatible"
bucket = "eidos-sync"
prefix = "space-id"
```

### Space Registry Update

The command updates `~/.eidos/spaces.json` with:

```json
{
  "spaces": [
    {
      "id": "space-id",
      "name": "Space Name",
      "path": "/path/to/space",
      "sync": {
        "enabled": true,
        "remote": "https://eidos.space/username/space-id.graft",
        "volumeId": "74ggdmAVtx-3CLG4igbxFLAr"
      }
    }
  ]
}
```

### Environment Variables

The command sets these environment variables during execution:

- `GRAFT_CONFIG` - Path to graft.toml
- `AWS_ACCESS_KEY_ID` - S3 access key
- `AWS_SECRET_ACCESS_KEY` - S3 secret key
- `AWS_REGION` - Set to "auto"
- `AWS_ENDPOINT` - S3 endpoint URL

### Error Handling

The implementation includes comprehensive error handling for:

- Invalid or non-existent space paths
- Missing database files
- Missing credentials
- Extension loading failures
- Database operation failures
- Space registry update failures

## Usage Examples

### Basic Usage

```bash
# Initialize graft in current directory
cd /path/to/space
eidos graft init
```

### With Explicit Credentials

```bash
eidos graft init \
  --access-key-id YOUR_KEY \
  --secret-access-key YOUR_SECRET \
  --bucket-name eidos-sync \
  --endpoint https://s3.eidos.space
```

### Using Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_BUCKET_NAME=eidos-sync
export AWS_ENDPOINT=https://s3.eidos.space

eidos graft init /path/to/space
```

### With Remote URL

```bash
eidos graft init /path/to/space \
  --remote https://eidos.space/username/my-space.graft
```

## Comparison with Desktop App

The desktop app's `GraftDb.convertToGraft()` method has a different purpose:

- **Desktop App**: Converts an existing space to use graft storage on next open (uses `@eidos.space/better-sqlite3`)
- **CLI Command**: Immediately converts the space and initializes graft storage (uses Bun's built-in SQLite)

The CLI implementation follows the pattern used in the desktop app's `NodeServerDatabase` initialization (sqlite-server/index.ts), which:

1. Calls `PRAGMA graft_new` to create a volume
2. Calls `PRAGMA graft_import` to import existing data
3. Stores the volumeId in the space configuration

**Important**: The CLI uses Bun's native `bun:sqlite` module instead of better-sqlite3, which provides similar functionality but is optimized for the Bun runtime.

## Files Modified/Created

### Created:

- `/workspace/apps/cli/src/commands/graft.ts` - Main graft command implementation

### Modified:

- `/workspace/apps/cli/src/index.ts` - Added graft command registration
- `/workspace/apps/cli/package.json` - Added dependencies
- `/workspace/apps/cli/README.md` - Added documentation

## Future Enhancements

Potential future additions to the graft command:

- `eidos graft status` - Check sync status
- `eidos graft push` - Push local changes to remote
- `eidos graft pull` - Pull remote changes
- `eidos graft fetch` - Fetch remote changes without merging
- `eidos graft checkout` - Convert back from graft to regular db.sqlite3

## Testing Checklist

To test the implementation:

- [ ] Run `eidos graft init` in a valid Eidos space
- [ ] Verify `graft.toml` is created in `.eidos/` directory
- [ ] Verify `.graft/` directory is created
- [ ] Verify `spaces.json` is updated with volumeId
- [ ] Check that existing data is preserved after conversion
- [ ] Test with explicit credentials via command-line options
- [ ] Test with credentials from environment variables
- [ ] Test error handling with invalid paths
- [ ] Test error handling with missing credentials

## Notes

1. **Extension Requirement**: The graft extension (`libgraft.dylib`/`.so`/`.dll`) must be available in the `dist-sqlite-ext` directory. Run `bun run setup` to download it.

2. **Database Lock**: Ensure the database is not open in other applications (desktop app, other CLI instances) before running the command.

3. **WAL Checkpoint**: The command performs a WAL checkpoint on the existing database before conversion to ensure all data is persisted.

4. **Credentials Security**: Credentials are passed as environment variables to the graft extension. Consider using a secure credential storage mechanism in the future.

5. **Remote URL Format**: The remote URL should follow the format: `https://eidos.space/username/space-id.graft`

## References

- Desktop graft implementation: `apps/desktop/electron/sync/graft-db.ts`
- Desktop sqlite server: `apps/desktop/electron/sqlite-server/index.ts`
- Graft helpers: `packages/sync/graft/helpers.ts`
- Space registry: `packages/space-manager/src/space-registry.ts`
