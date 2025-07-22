# Component Interactions and Data Flow

## 📋 Table of Contents

- [Component Hierarchy](#component-hierarchy)
- [State Flow Diagrams](#state-flow-diagrams)
- [Event Handling](#event-handling)
- [Plugin Integration](#plugin-integration)
- [Monaco Model Lifecycle](#monaco-model-lifecycle)

## Component Hierarchy

```mermaid
graph TD
    MFE[MultiFileEditor] --> FT[FileTree]
    MFE --> TABS[Tabs]
    MFE --> EA[EditorArea]
    MFE --> SB[StatusBar]
    MFE --> SH[ShortcutHelp]
    MFE --> PS[PluginStatus]
    
    FT --> FTB[FileToolbar]
    
    EA --> MONACO[Monaco Editor Instance]
    
    subgraph "Hooks"
        KS[useKeyboardShortcuts]
    end
    
    subgraph "Store"
        STORE[useMultiFileEditorStore]
    end
    
    MFE -.-> KS
    FT -.-> STORE
    TABS -.-> STORE
    EA -.-> STORE
    SB -.-> STORE
```

## State Flow Diagrams

### File Operations Flow

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    Idle --> FileSelected: User clicks file
    FileSelected --> CheckIfOpen: Check if file is open
    
    CheckIfOpen --> AlreadyOpen: File is open
    CheckIfOpen --> CreateModel: File not open
    
    AlreadyOpen --> SetActive: Set as active
    CreateModel --> AddToOpen: Create Monaco model
    AddToOpen --> SetActive: Add to open files
    
    SetActive --> EditorReady: Update editor
    EditorReady --> Idle: Ready for next action
    
    Idle --> FileClose: User closes file
    FileClose --> RemoveFromOpen: Remove from open files
    RemoveFromOpen --> DisposeModel: Dispose Monaco model
    DisposeModel --> UpdateActive: Update active file
    UpdateActive --> Idle: Complete
    
    Idle --> FileEdit: User edits content
    FileEdit --> UpdateContent: Update file content
    UpdateContent --> TriggerAnalysis: Trigger plugin analysis
    TriggerAnalysis --> Idle: Analysis complete
```

### Plugin Initialization Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant MFE as MultiFileEditor
    participant Monaco as Monaco Setup
    participant PM as Plugin Manager
    participant ESM as ESM Plugin
    participant TS as TypeScript Service
    
    App->>MFE: Initialize with files
    MFE->>Monaco: setupMonacoEnvironment()
    
    Monaco->>Monaco: Configure workers
    Monaco->>Monaco: Initialize loader
    
    Monaco->>PM: getPluginManager().initialize()
    PM->>ESM: new ESMImportResolverPlugin()
    PM->>ESM: initialize()
    
    ESM->>TS: registerCompletionItemProvider()
    ESM->>TS: registerHoverProvider()
    ESM->>TS: registerCodeActionProvider()
    ESM->>TS: configureCompilerOptions()
    
    TS-->>ESM: Providers registered
    ESM-->>PM: Plugin initialized
    PM-->>Monaco: All plugins ready
    Monaco-->>MFE: Monaco ready
    MFE-->>App: Editor ready
```

## Event Handling

### Keyboard Shortcuts

The editor implements comprehensive keyboard shortcuts through the `useKeyboardShortcuts` hook:

```typescript
// Key bindings
const shortcuts = {
  'Ctrl+S': 'Save file',
  'Ctrl+W': 'Close tab',
  'Ctrl+Tab': 'Next tab',
  'Ctrl+Shift+Tab': 'Previous tab',
  'Ctrl+1-9': 'Switch to tab N',
  'F2': 'Rename file',
  'Alt+Shift+F': 'Format document'
}
```

### File Tree Events

```mermaid
graph LR
    subgraph "File Tree Events"
        FC[File Click] --> OS[Open/Select]
        RC[Right Click] --> CM[Context Menu]
        DD[Drag & Drop] --> MF[Move File]
        DC[Double Click] --> OF[Open File]
    end
    
    subgraph "Actions"
        OS --> SA[Set Active]
        CM --> CR[Create/Rename/Delete]
        MF --> UF[Update File Path]
        OF --> OM[Open in Editor]
    end
```

### Tab Events

```mermaid
graph LR
    subgraph "Tab Events"
        TC[Tab Click] --> SA[Set Active]
        TX[Tab Close] --> CF[Close File]
        TD[Tab Drag] --> RT[Reorder Tabs]
        MW[Mouse Wheel] --> ST[Scroll Tabs]
    end
    
    subgraph "State Updates"
        SA --> UA[Update Active File]
        CF --> RF[Remove from Open]
        RT --> UO[Update Order]
        ST --> SV[Scroll View]
    end
```

## Plugin Integration

### ESM Import Resolver Integration

```mermaid
graph TB
    subgraph "Monaco Editor"
        MODEL[Text Model]
        LS[Language Service]
        CP[Completion Provider]
        HP[Hover Provider]
        CAP[Code Action Provider]
    end
    
    subgraph "ESM Plugin"
        IP[Import Parser]
        UR[URL Resolver]
        TDM[Type Definition Manager]
        MI[Monaco Integration]
    end
    
    subgraph "External Services"
        CDN[CDN/Registry]
        TYPES[Type Definitions]
    end
    
    MODEL --> IP: Content changes
    IP --> UR: Parse imports
    UR --> TDM: Resolve URLs
    TDM --> CDN: Fetch types
    CDN --> TYPES: Return definitions
    TYPES --> MI: Register types
    MI --> LS: Update language service
    
    LS --> CP: Provide completions
    LS --> HP: Provide hover info
    LS --> CAP: Provide code actions
```

### Plugin Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: new Plugin()
    Created --> Initializing: initialize()
    Initializing --> Active: Success
    Initializing --> Error: Failure
    
    Active --> Processing: Handle events
    Processing --> Active: Complete
    
    Active --> Disabled: disable()
    Disabled --> Active: enable()
    
    Active --> Disposing: dispose()
    Disabled --> Disposing: dispose()
    Error --> Disposing: dispose()
    
    Disposing --> [*]: Cleanup complete
```

## Monaco Model Lifecycle

### Model Creation and Management

```mermaid
sequenceDiagram
    participant Store as Zustand Store
    participant Monaco as Monaco Editor
    participant Plugin as Plugin System
    participant Model as Text Model
    
    Store->>Monaco: openFile(fileId)
    Monaco->>Monaco: Check if model exists
    
    alt Model doesn't exist
        Monaco->>Model: createModel(content, language, uri)
        Model-->>Monaco: Model created
        Monaco->>Store: setFileModel(fileId, model)
        Monaco->>Plugin: setupModelListeners(model)
        Plugin->>Model: onDidChangeContent()
        Plugin->>Plugin: analyzeImports()
    else Model exists
        Monaco->>Monaco: Use existing model
    end
    
    Monaco->>Monaco: setModel(model)
    Monaco-->>Store: File opened
```

### Model Disposal

```mermaid
sequenceDiagram
    participant User as User
    participant Store as Zustand Store
    participant Monaco as Monaco Editor
    participant Model as Text Model
    
    User->>Store: closeFile(fileId)
    Store->>Monaco: getFileModel(fileId)
    Monaco-->>Store: Return model
    
    alt Model exists
        Store->>Model: dispose()
        Model-->>Store: Model disposed
        Store->>Store: Remove from fileModels
        Store->>Store: Update openFiles
        Store->>Store: Update activeFileId
    end
    
    Store-->>User: File closed
```

### Memory Management

The editor implements careful memory management to prevent leaks:

1. **Model Disposal**: Automatic cleanup when files are closed
2. **Plugin Cleanup**: Disposable pattern for event listeners
3. **Worker Management**: Shared workers for efficiency
4. **State Cleanup**: Immutable updates with proper cleanup

```typescript
// Example cleanup pattern
const disposables: monaco.IDisposable[] = []

// Register disposable
const provider = monaco.languages.registerCompletionItemProvider(...)
disposables.push(provider)

// Cleanup
disposables.forEach(d => d.dispose())
disposables.length = 0
```
