# Eidos Capture - Mobile Capture App

A minimal, chat-like mobile application for capturing thoughts, ideas, and moments with Eidos. Built with React Native and Expo.

## Overview

Eidos Capture is designed to be as simple as Telegram's saved messages or WeChat's file transfer assistant - a quick, frictionless way to capture anything on your phone and have it sync to your Eidos workspace.

## Features

### ✅ Implemented (Phase 1 - Local Mode)

- **Chat-like Interface**: Telegram-inspired UI for quick capture
- **Text Capture**: Quick text notes with timestamp
- **Image Capture**: Take photos or choose from library
- **File Attachments**: Attach any file type
- **Local Storage**: SQLite database with file storage
- **File Management**: Organized storage in `.eidos/files/_capture/`
- **Settings**: Configuration UI for storage and sync
- **Pull to Refresh**: Manual data refresh

### 🔧 Implemented (Phase 2 - Sync Infrastructure)

- **Graft Extension Loader**: Infrastructure for VFS-based database sync
- **File Synchronizer**: S3-compatible file sync (adapted from desktop)
- **Sync Manager**: Coordinates database and file synchronization
- **Sync Configuration**: Settings UI for S3 credentials and endpoints
- **Manual Sync**: On-demand sync trigger
- **Auto Sync**: Periodic background sync (5-minute intervals)

### ⚠️ Limitations & Future Work

**Graft Extension on Mobile:**
- The graft extension requires native modules to load on mobile
- Current implementation provides the infrastructure but doesn't load the actual extension
- Full database sync via graft VFS requires custom native module development
- See `db/graft-loader.ts` for detailed implementation notes

**To enable full graft support:**
1. Build custom native modules for iOS/Android
2. Bundle platform-specific graft binaries (.so for Android, .framework for iOS)
3. Integrate with expo-sqlite's native layer
4. Consider using expo-dev-client or direct React Native

## Architecture

```
apps/capture/
├── app/
│   ├── _layout.tsx              # Root layout with app initialization
│   └── (tabs)/
│       ├── _layout.tsx          # Tab navigation
│       ├── index.tsx            # Main capture screen (chat UI)
│       └── settings.tsx         # Settings screen
├── components/
│   ├── CaptureInput.tsx         # Message input with attachments
│   └── CaptureItem.tsx          # Message bubble component
├── db/
│   ├── database.ts              # SQLite database manager
│   ├── graft-loader.ts          # Graft VFS extension loader
│   ├── schema.sql               # Database schema
│   └── types.ts                 # TypeScript types
├── storage/
│   └── file-manager.ts          # File upload/storage manager
├── sync/
│   ├── sync-manager.ts          # Coordinates sync operations
│   └── file-sync-mobile.ts      # S3 file synchronization
├── hooks/
│   └── useSync.ts               # React hook for sync
└── package.json
```

## Data Storage

### Database Schema

```sql
-- Captures table
captures (
  id TEXT PRIMARY KEY,
  content TEXT,
  created_at INTEGER NOT NULL,
  type TEXT,                    -- 'text', 'image', 'file', etc.
  metadata TEXT,                -- JSON metadata
  synced INTEGER DEFAULT 0
)

-- Settings table
settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

### File Structure

```
Documents/
  .eidos/
    db.sqlite3              # SQLite database
    .graft/                 # Graft VFS data (future)
    files/
      _capture/             # User-uploaded files
        {timestamp}-{uuid}.{ext}
```

## Sync Architecture

### Two-Layer Sync System

1. **Database Sync (via Graft VFS)**
   - Syncs SQLite database changes
   - Requires native extension (Phase 2+)
   - Uses S3-compatible storage as backend

2. **File Sync (via FileSynchronizer)**
   - Syncs files in `_capture` directory only
   - Last-write-wins conflict resolution
   - Automatic periodic sync (5 minutes)
   - Manual sync on demand

### Sync Configuration

Configure in Settings tab:
- S3 Endpoint (e.g., `https://s3.eidos.space`)
- Bucket Name (e.g., `eidos-sync`)
- Access Key ID
- Secret Access Key
- Region (default: `auto`)

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
cd apps/capture
pnpm start

# Run on iOS
pnpm ios

# Run on Android
pnpm android
```

### Key Dependencies

- `expo` ~54.0.30 - React Native framework
- `expo-sqlite` ~15.0.0 - SQLite database
- `expo-file-system` ~18.0.0 - File operations
- `expo-image-picker` ~16.0.3 - Camera and gallery
- `expo-document-picker` ~13.0.3 - File picker
- `@aws-sdk/client-s3` ^3.609.0 - S3 sync
- `expo-router` ~6.0.21 - File-based routing

## Usage

### Capturing Content

1. **Text**: Type in the input field and tap send
2. **Image**: Tap + button → Choose from Library or Take Photo
3. **File**: Tap + button → Attach File

### Syncing

1. Go to Settings tab
2. Enable "Enable Sync" toggle
3. Configure S3 credentials
4. Tap "Save Configuration"
5. Sync starts automatically
6. Use "Sync Now" for manual sync

### Managing Data

- Long-press any capture to delete it
- Pull down on main screen to refresh
- Clear all data in Settings → "Clear All Data"

## Design Principles

1. **Speed First**: Quick capture is the priority
2. **No Organization**: Append-only, no folders or categories
3. **No Editing**: Captures are immutable (delete and re-create)
4. **Minimal UI**: Clean, distraction-free interface
5. **Offline First**: Works without internet, syncs when available

## Comparison with Desktop

| Feature | Desktop | Mobile Capture |
|---------|---------|----------------|
| UI | Full workspace | Chat-only |
| Extensions | Full support | N/A |
| Tables | Full database | Simple captures |
| Files | All directories | `_capture` only |
| Graft | Native support | Infrastructure only |
| Sync | Full VFS + files | Files only (working) |

## Future Enhancements

### Short Term
- Background sync when app is closed
- Rich text formatting
- Audio recording
- Search functionality
- Share extension (capture from other apps)

### Long Term
- Full graft VFS support with native modules
- End-to-end encryption
- Offline-first conflict resolution
- Integration with desktop Eidos tables
- Voice memos with transcription
- Location tagging

## Testing

```bash
# Run linter
pnpm lint

# Type checking
pnpm typecheck
```

## Building for Production

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

## Troubleshooting

### Database Issues
- Clear app data and restart
- Check file permissions
- Ensure `.eidos` directory exists

### Sync Issues
- Verify S3 credentials
- Check network connectivity
- Review endpoint URL format
- Check bucket permissions

### File Upload Issues
- Grant camera/photo permissions
- Check storage space
- Verify file formats supported

## Contributing

This is part of the Eidos monorepo. See main project README for contribution guidelines.

## License

See main Eidos project license.
