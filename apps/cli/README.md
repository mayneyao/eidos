# Eidos CLI

Command-line interface for managing Eidos spaces - initialize, serve, and open spaces from the terminal.

## What is Eidos CLI?

Eidos CLI is a **headless version of Eidos** that runs entirely from the command line. You can use it without installing the desktop app to:

- Create and manage Eidos spaces programmatically
- Run API servers for any space
- Integrate Eidos into automation workflows and CI/CD pipelines
- Access Eidos functionality via HTTP API

**Key advantages:**
- ✅ **Lightweight** - No GUI, minimal dependencies
- ✅ **Scriptable** - Perfect for automation
- ✅ **Portable** - Single executable file
- ✅ **Standalone** - No desktop app required

## Features

- 🚀 **Initialize** - Create new Eidos spaces anywhere
- 🌐 **Serve** - Run local API server for any space
- 💻 **Open** - Open spaces in desktop app (like `code .`)
- 📦 **Manage** - List and manage all your spaces
- 🔗 **Mount** - Mount external directories for file access

## Quick Start

### Prerequisites

**macOS only**: Install Homebrew SQLite for extension support:

```bash
brew install sqlite
```

> **Why?** Apple's built-in SQLite doesn't support extensions. Homebrew's version does.

### Installation

**Option 1: Install from built executable**

```bash
# Build the CLI
cd apps/cli
bun run build

# Install globally
sudo ./dist/eidos install
```

**Option 2: Development mode**

```bash
cd apps/cli
bun run dev [command]
```

### Verify Installation

```bash
eidos --version
eidos --help
```

## Commands

### 📝 Initialize a Space

Create a new Eidos space in any directory:

```bash
# Initialize in current directory
eidos init

# Initialize with custom name
eidos init --name "My Project"

# Initialize in specific directory
eidos init /path/to/project --name "My Project"
```

**What it does:**

- Creates `.eidos/` directory with database and file storage
- Initializes SQLite database with all meta tables
- Registers space in global config (`~/.eidos/spaces.json`)
- Loads SQLite extensions (FTS, vector search)

### 🌐 Start API Server

Run a local HTTP server for **any space** - no desktop app needed:

```bash
# Start in current directory
eidos serve

# Specify space and port
eidos serve /path/to/space --port 3000

# Bind to all network interfaces
eidos serve --host 0.0.0.0 --port 3000
```

**Available endpoints:**

- `POST /rpc` - Execute RPC methods
- `GET /files/*` - Access internal space files
- `GET /~/*` - Access project folder files
- `GET /@/*` - Access mounted directory files
- `GET /health` - Health check

**Example RPC call:**

```bash
curl -X POST http://localhost:13128/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "method": "doc.list",
    "params": []
  }'
```

> **Note:** The server works with spaces created by either the CLI or desktop app - they share the same format and registry.

### 💻 Open in Desktop App

Open a space in the Eidos desktop app (similar to `code .`):

```bash
# Open current directory
eidos .

# Or use the full command
eidos open

# Open specific path
eidos open /path/to/space
```

**Requirements:**

- Space must be initialized (contains `.eidos/` directory)
- Space must be registered in global config
- Eidos desktop app must be installed

### 🔗 Mount External Directories

Mount external directories to access files via the API server:

```bash
# Mount a directory
eidos mount audio /Users/username/Music

# Mount another directory
eidos mount books /Users/username/Documents/Books

# Remove a mount
eidos unmount audio
```

**How it works:**

- Mount configurations are stored in the space's database (KV table)
- Mounted directories are accessible via `/@/<mount-name>/<file-path>`
- Mount names must be alphanumeric (with underscores/hyphens allowed)
- Paths are resolved to absolute paths for portability

**Accessing mounted files:**

```bash
# Via HTTP API
curl http://localhost:13128/@/audio/song.mp3

# Via project folder (files in space root)
curl http://localhost:13128/~/readme.md
```

**Mount paths:**
- `/files/*` - Internal files stored in `.eidos/files/`
- `/~/` - Project folder (files in space root directory)
- `/@/<name>/` - Mounted external directories

### 🔧 Manage Installation

```bash
# Install CLI to PATH
sudo eidos install

# Uninstall
sudo eidos uninstall

# Check installation status
eidos status
```

## Usage Examples

### Example 1: Headless Eidos Server

Run Eidos as a pure backend service without any GUI:

```bash
# Initialize a space
mkdir /var/eidos-data/production
cd /var/eidos-data/production
eidos init --name "Production API"

# Start headless server
eidos serve --host 0.0.0.0 --port 13128

# Access from anywhere (no desktop app needed!)
curl http://your-server:13128/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"space.info","params":[]}'
```

### Example 2: Create and Open

```bash
# Create a new project
mkdir my-project
cd my-project

# Initialize as Eidos space
eidos init --name "My Project"

# Open in desktop app (optional)
eidos .
```

### Example 3: Remote Development

```bash
# On remote server
cd ~/my-space
eidos serve --host 0.0.0.0 --port 3000

# From local machine
curl http://remote-server:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"doc.list","params":[]}'
```

### Example 4: Automation Script

```javascript
// script.js - Automated space management
const API_URL = "http://localhost:13128/rpc"

async function listDocs() {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "doc.list",
      params: [],
    }),
  })

  const { data } = await response.json()
  console.log("Documents:", data)
}

listDocs()
```

### Example 5: CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test with Eidos

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Eidos CLI
        run: |
          curl -o eidos https://github.com/eidos/releases/latest/download/eidos-linux
          chmod +x eidos
          
      - name: Initialize Test Space
        run: ./eidos init ./test-space --name "CI Test"
      
      - name: Start Eidos Server
        run: |
          ./eidos serve ./test-space --port 13128 &
          sleep 2
      
      - name: Run Integration Tests
        run: npm test
```

### Example 6: Mount External Directories

Access files from external directories without copying them into the space:

```bash
# Navigate to your Eidos space
cd ~/my-project

# Mount external directories
eidos mount music /Users/username/Music
eidos mount videos /Users/username/Videos

# Start server
eidos serve

# Access mounted files via HTTP
curl http://localhost:13128/@/music/song.mp3
curl http://localhost:13128/@/videos/documentary.mp4

# Access project files
curl http://localhost:13128/~/readme.md
```

## Development

### Setup

```bash
cd apps/cli

# Install dependencies (via workspace root)
pnpm install

# Link SQLite extensions from desktop app
bun run setup
```

### Commands

```bash
# Run in development mode
bun run dev init
bun run dev serve
bun run dev open
bun run dev mount audio /path/to/music
bun run dev unmount audio

# Build executable
bun run build

# Type check
bun run typecheck

# Clean build artifacts
bun run clean
```

### Project Structure

```
apps/cli/
├── src/
│   ├── commands/          # CLI commands
│   │   ├── init.ts       # Space initialization
│   │   ├── serve.ts      # API server
│   │   ├── open.ts       # Open in desktop app
│   │   ├── mount.ts      # Mount external directories
│   │   ├── unmount.ts    # Remove mounts
│   │   └── install.ts    # Installation management
│   ├── db/               # Database adapters
│   │   ├── bun-server-database.ts  # Bun SQLite adapter
│   │   ├── database-manager.ts     # Connection pool
│   │   └── sqlite-setup.ts         # SQLite configuration
│   ├── server/           # HTTP server
│   │   ├── server.ts     # Hono server
│   │   └── data-space.ts # DataSpace management
│   ├── utils/            # Utilities
│   └── index.ts          # CLI entry point
├── dist/                 # Build output
├── dist-sqlite-ext/      # SQLite extensions (symlinked)
└── examples/             # Usage examples
```

## Architecture

### Database Adapter Pattern

The CLI uses `BunServerDatabase` to integrate with `@eidos.space/core`:

```typescript
import { DataSpace } from "@eidos.space/core/data-space"

import { BunServerDatabase } from "./db/bun-server-database"

// Create adapter
const db = new BunServerDatabase(dbPath)

// Load extensions
db.loadExtension("./dist-sqlite-ext/libsimple.dylib")

// Create DataSpace
const dataSpace = new DataSpace({
  db: db,
  dbName: "my-space",
  // ...
})
```

### Connection Management

Uses `DatabaseManager` singleton to prevent multiple connections:

```typescript
import { dbManager } from "./db/database-manager"

// Get or create connection
const db = dbManager.getConnection(dbPath, { readwrite: true })

// Release when done
dbManager.releaseConnection(dbPath)
```

## Troubleshooting

### "SQLite extensions not found"

**Cause:** Extensions are missing or not symlinked.

**Solution:**

```bash
cd apps/cli
bun run setup
```

Ensure `../desktop/dist-sqlite-ext` exists (build desktop app if needed).

### "This build of sqlite3 does not support dynamic extension loading"

**Cause:** Using Apple's built-in SQLite on macOS.

**Solution:**

```bash
# Install Homebrew SQLite
brew install sqlite

# Verify
brew --prefix sqlite

# Restart terminal and try again
eidos init ~/test
```

### "Space not registered"

**Cause:** Space exists but not in global registry.

**Solution:**

```bash
# Re-initialize to register
eidos init /path/to/space
```

### "Port already in use"

**Cause:** Another process is using the port.

**Solution:**

```bash
# Use a different port
eidos serve --port 3001

# Or kill the process using the port
lsof -ti:13128 | xargs kill -9
```

### Database locked errors

**Cause:** Multiple connections to the same database.

**Solution:**

- Stop other `eidos serve` instances
- Close desktop app if it has the space open
- The CLI uses `DatabaseManager` to prevent this, but external tools can still cause locks

## Environment Variables

```bash
# Force production mode (uses compiled packages)
NODE_ENV=production eidos serve

# Custom SQLite library path (macOS)
CUSTOM_SQLITE_PATH=/path/to/libsqlite3.dylib eidos init
```

## Known Limitations

### User-Defined Functions (UDF)

⚠️ **Important**: The current Bun SQLite adapter does not support custom SQL functions (UDFs). This means:

- **Most read operations work perfectly** ✅
  - Querying documents, tables, and data
  - Full-text search (via extensions)
  - Vector search (via extensions)

- **Some write operations may behave differently** ⚠️
  - Operations that rely on custom SQL functions may not work as expected
  - Triggers using UDFs won't execute
  - Computed columns with UDFs may not update

**Workaround**: For complex write operations, consider:
1. Using the desktop app (which supports UDFs via better-sqlite3)
2. Implementing logic in your application layer instead of database triggers
3. Waiting for Bun's native UDF support (planned)

**Why this limitation?**
- The CLI uses Bun's native `bun:sqlite` for performance and portability
- Bun's SQLite doesn't yet support `createFunction()` API
- The desktop app uses `better-sqlite3` which has full UDF support

> **Most use cases are unaffected** - reading data, basic CRUD operations, and FTS/vector search all work great!

## FAQ

**Q: Can I use the CLI without the desktop app?**  
A: **Yes!** The CLI is a standalone headless Eidos. It creates fully compatible spaces that can later be opened in the desktop app if needed, but the desktop app is entirely optional.

**Q: Does the CLI work on Windows/Linux?**  
A: The CLI is built with Bun which supports all platforms. However, SQLite extensions may need platform-specific builds.

**Q: Can I run multiple servers?**  
A: Yes, just use different ports: `eidos serve --port 3001`, `eidos serve --port 3002`, etc.

**Q: Is the server secure?**  
A: The server is for local development only. Don't expose it to the internet without proper authentication and HTTPS.

**Q: Can I access desktop app's spaces?**  
A: Yes! The CLI and desktop app share the same space registry (`~/.eidos/spaces.json`) and space format.

**Q: What about the UDF limitation?**  
A: For most use cases (reading data, basic writes, search), the CLI works perfectly. Complex write operations with database triggers may need the desktop app.

## Contributing

The CLI is part of the Eidos monorepo. See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../../LICENSE) in the repository root.

## Related Documentation

- [Eidos Core Package](../../packages/core/readme.md) - Core architecture
- [Space Manager Package](../../packages/space-manager/README.md) - Space management utilities
- [Desktop App](../desktop/readme.md) - Eidos desktop application

---

**Built with:** [Bun](https://bun.sh) • [Hono](https://hono.dev) • [@eidos.space/core](../../packages/core)
