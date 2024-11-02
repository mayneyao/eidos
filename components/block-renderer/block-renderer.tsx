import { useEffect, useRef, useState } from "react"
import { useWhyDidYouUpdate } from "ahooks"

import { cn } from "@/lib/utils"
import { generateImportMap, getAllLibs } from "@/lib/v3/compiler"

import { LogoLoading } from "../loading"
import { twConfig } from "./tailwind-config"
import themeRawCode from "./theme-raw.css?raw"

interface BlockRendererProps {
  code: string
  compiledCode: string
  env?: Record<string, string>
  width?: string | number
  height?: string | number
  defaultProps?: Record<string, any>
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({
  code,
  compiledCode,
  env = {},
  width,
  height,
  defaultProps = {},
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [dependencies, setDependencies] = useState<string[]>([])
  const [uiComponents, setUiComponents] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [importMap, setImportMap] = useState<string>("")

  const defaultPropsString = JSON.stringify(defaultProps)

  useEffect(() => {
    if (!code.length) {
      return
    }
    getAllLibs(code).then(async ({ thirdPartyLibs, uiLibs }) => {
      setDependencies(thirdPartyLibs)
      setUiComponents(uiLibs)
      const { importMap } = await generateImportMap(thirdPartyLibs, uiLibs)
      console.log({ code, compiledCode, importMap })
      setImportMap(importMap)
      setIsLoading(false)
    })
  }, [code])

  const envString = env ? JSON.stringify(env) : "{}"

  useWhyDidYouUpdate("BlockRenderer", {
    code,
    compiledCode,
    env,
    width,
    height,
    defaultPropsString,
    defaultProps,
  })

  useEffect(() => {
    if (!iframeRef.current) return

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          ${importMap}
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            window.process = {
              env: ${envString}
            };
          </script>
          <style>
            ${themeRawCode}
            * {
              border-color: hsl(var(--border));
            }

            body {
              background-color: hsl(var(--background));
              color: hsl(var(--foreground));
              margin: 0;
              padding: 0;
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
            
            let retryCount = 0;
            const maxRetries = 3;
            
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
                root.render(React.createElement(MyComponent, ${JSON.stringify(
                  defaultProps
                )}));
              } catch (err) {
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(executeCode, 1000); 
                  return;
                }
                
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
  }, [
    compiledCode,
    dependencies,
    uiComponents,
    importMap,
    env,
    height,
    defaultPropsString,
  ])
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          border: "none",
          width: width
            ? typeof width === "number"
              ? `${width}px`
              : width
            : "100%",
          height: height
            ? typeof height === "number"
              ? `${height}px`
              : height
            : "100%",
        }}
      >
        <LogoLoading />
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      title="preview"
      className={cn(
        width ? "" : "w-full",
        height ? "" : "h-full",
        "overflow-hidden"
      )}
      sandbox="allow-scripts allow-same-origin"
      style={{
        border: "none",
        width: width
          ? typeof width === "number"
            ? `${width}px`
            : width
          : "100%",
        height: height
          ? typeof height === "number"
            ? `${height}px`
            : height
          : "100%",
      }}
    />
  )
}
