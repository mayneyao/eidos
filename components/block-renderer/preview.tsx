import { useEffect, useRef, useState } from "react"

import { generateImportMap, getAllLibs } from "@/lib/v3/compiler"

import { twConfig } from "./tailwind-config"
import themeRawCode from "./themeRaw.css?raw"

interface PreviewProps {
  code: string
  compiledCode: string
}

export const Preview: React.FC<PreviewProps> = ({ code, compiledCode }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [dependencies, setDependencies] = useState<string[]>([])
  const [uiComponents, setUiComponents] = useState<string[]>([])

  const [importMap, setImportMap] = useState<string>("")

  useEffect(() => {
    getAllLibs(code).then(async ({ thirdPartyLibs, uiLibs }) => {
      setDependencies(thirdPartyLibs)
      setUiComponents(uiLibs)
      const { importMap } = await generateImportMap(thirdPartyLibs, uiLibs)
      setImportMap(importMap)
    })
  }, [code])

  useEffect(() => {
    if (!iframeRef.current) return

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          ${importMap}
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            ${themeRawCode}
            * {
              border-color: hsl(var(--border));
            }

            body {
              background-color: hsl(var(--background));
              color: hsl(var(--foreground));
            }
          </style>
          <script>
            tailwind.config = ${JSON.stringify(twConfig)};
          </script>
        </head>
        <body>
          <div id="root"></div>
          <script type="module">
            import React from 'react';
            import { createRoot } from 'react-dom/client';

            const executeCode = async () => {
              try {
                const codeStr = ${JSON.stringify(compiledCode)};
                
                const codeModule = new Blob(
                  [codeStr],
                  { type: 'text/javascript' }
                );
                
                const moduleUrl = URL.createObjectURL(codeModule);
                const moduleExports = await import(moduleUrl);
                URL.revokeObjectURL(moduleUrl);

                let MyComponent = moduleExports.default;

                if (!MyComponent) {
                  MyComponent = Object.values(moduleExports).find(
                    (exported) => typeof exported === 'function'
                  );
                }

                if (!MyComponent) {
                  throw new Error("Make sure to export a default component or a function");
                }

                const root = createRoot(document.getElementById('root'));
                root.render(React.createElement(MyComponent));
              } catch (err) {
                const errorElement = document.createElement('div');
                errorElement.style.color = 'red';
                errorElement.style.padding = '1rem';
                errorElement.style.fontFamily = 'monospace';
                errorElement.textContent = err.message;
                document.body.appendChild(errorElement);
              }
            };

            executeCode();
          </script>
        </body>
      </html>
    `

    iframeRef.current.srcdoc = html
  }, [compiledCode, dependencies, uiComponents])

  return (
    <iframe
      ref={iframeRef}
      title="preview"
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full"
    />
  )
}
