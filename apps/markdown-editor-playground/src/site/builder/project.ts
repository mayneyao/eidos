import { resolveBuilder, type BuilderConfig } from "./model"
import storageHook from "./image-storage.ts?raw"
import storageImplementation from "../../opfs-image-store.ts?raw"

export function integrationFiles(
  config: BuilderConfig
): Record<string, string> {
  const result = resolveBuilder(config)
  return {
    "markdown-preset.ts": result.presetCode,
    "Editor.tsx": result.componentCode,
    ...(result.useOpfs
      ? {
          "image-storage.ts": storageHook,
          "opfs-image-store.ts": storageImplementation,
        }
      : {}),
  }
}

export function projectFiles(config: BuilderConfig): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(integrationFiles(config)).map(([name, content]) => [
        `src/${name}`,
        content,
      ])
    ),
    "src/main.tsx": `import { createRoot } from "react-dom/client"\nimport Editor from "./Editor.js"\nimport "./app.css"\n\nconst root = document.getElementById("root")\nif (!root) throw new Error("Missing root element")\ncreateRoot(root).render(<Editor />)\n`,
    "src/app.css": `body { margin: 0; background: #fafaf8; color: #262522; font-family: system-ui, sans-serif; }\n#root { max-width: 960px; margin: 32px auto; padding: 0 20px; }\n`,
    "index.html":
      '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Markdown editor</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
    "package.json":
      JSON.stringify(
        {
          name: "my-markdown-editor",
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite --host 127.0.0.1",
            build: "tsc --noEmit && vite build",
            preview: "vite preview --host 127.0.0.1",
          },
          dependencies: {
            "@eidos.space/markdown": "file:./vendor/markdown.tgz",
            react: "18.3.1",
            "react-dom": "18.3.1",
          },
          devDependencies: {
            "@types/react": "^18.3.0",
            "@types/react-dom": "^18.3.0",
            typescript: "^5.8.3",
            vite: "^8.1.5",
          },
        },
        null,
        2
      ) + "\n",
    "tsconfig.json":
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "ESNext.Disposable", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: false,
            noEmit: true,
          },
          include: ["src"],
        },
        null,
        2
      ) + "\n",
    "markdown.config.json": JSON.stringify(config, null, 2) + "\n",
    ".gitignore": "node_modules/\ndist/\n",
    "README.md": `# Your Markdown editor\n\nRequires Node.js 22.12+ and pnpm.\n\n\`\`\`sh\npnpm install\npnpm dev\n\`\`\`\n\nOpen the localhost URL printed by Vite. Run \`pnpm build\` to typecheck and build.\n\nThe vendor tarball is the pre-release Markdown package from the same site build as your preview. It includes its MIT license. React, Vite and other dependencies are fetched during installation; this archive is not a fully offline dependency cache.\n\nYour document is not included. The initial text is a new example and is held in React state only; connect persistence before using this as a document storage application.\n\nEdit \`src/markdown-preset.ts\` to change the syntax. \`markdown.config.json\` records the Builder choices. Configuration changes preserve controlled Markdown but start a new editor session and undo history.\n\n${resolveBuilder(config).usesImages ? "Images require a host storage adapter. See the public package API for onPasteImage and resolveImageUrl. External images render normally; no file is uploaded automatically.\n\n" : ""}The HTML safety policy remains enabled. Choosing raw HTML does not permit scripts or active embeds.\n`,
  }
}
