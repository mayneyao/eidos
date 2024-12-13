import React, { useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTheme } from "next-themes"

import { generateImportMap, getAllLibs } from "@/lib/v3/compiler"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

import { LogoLoading } from "../loading"
import { makeSdkInjectScript } from "../script-container/helper"
import { twConfig } from "./tailwind-config"
import tailwindRaw from "./tailwind-raw.js?raw"
import themeRawCode from "./theme-raw.css?raw"

export interface BlockRendererRef {
  getHeight: () => number
}

interface BlockRendererProps {
  code: string
  compiledCode: string
  env?: Record<string, string>
  bindings?: Record<string, { type: "table"; value: string }>
  width?: string | number
  height?: string | number
  defaultProps?: Record<string, any>
}

export const BlockRenderer = React.forwardRef<
  BlockRendererRef,
  BlockRendererProps
>(
  (
    {
      code,
      compiledCode,
      env = {},
      width,
      height,
      defaultProps = {},
      bindings = {},
    },
    ref
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [dependencies, setDependencies] = useState<string[]>([])
    const [uiComponents, setUiComponents] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { space } = useCurrentPathInfo()
    const { theme } = useTheme()

    const sdkInjectScriptContent = makeSdkInjectScript({
      space,
      bindings,
    })

    const [importMap, setImportMap] = useState<string>("")

    const defaultPropsString = JSON.stringify(defaultProps)

    useEffect(() => {
      if (!code.length) {
        return
      }
      const { thirdPartyLibs, uiLibs } = getAllLibs(code)
      // preload some libs
      thirdPartyLibs.push(
        "@radix-ui/react-toast",
        "class-variance-authority",
        "lucide-react"
      )
      uiLibs.push("toast", "toaster", "use-toast")
      setDependencies(thirdPartyLibs)
      setUiComponents(uiLibs)
      generateImportMap(thirdPartyLibs, uiLibs).then(({ importMap }) => {
        setImportMap(importMap)
        setIsLoading(false)
      })
    }, [code])

    const envString = env ? JSON.stringify(env) : "{}"

    const rootHeight = height
      ? typeof height === "number"
        ? `${height}px`
        : height
      : "min-content"

    useEffect(() => {
      if (!iframeRef.current) return

      const html = `
      <!DOCTYPE html>
      <html class="${theme}">
        <head>
          ${importMap}
          <script>${tailwindRaw}</script>
          ${sdkInjectScriptContent}
          <script>
            window.process = {
              env: ${envString}
            };
            window.addEventListener('message', (event) => {
              if (event.data.type === 'theme-change') {
                document.documentElement.className = event.data.theme;
              }
            });
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
          <div id="root" style="height: ${rootHeight}"></div>
          <script type="module">
            import * as React from 'react';
            import { createRoot } from 'react-dom/client';
            import { Toaster } from "@/components/ui/toaster"
            
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
                root.render(React.createElement(
                  React.Fragment,
                  null,
                  [
                    React.createElement(MyComponent, ${JSON.stringify(
                      defaultProps
                    )}),
                    React.createElement('div', { id: 'portal-root' }),
                    // toaster has bug now
                    // React.createElement(Toaster)
                  ]
                ));
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
      theme,
    ])

    useEffect(() => {
      if (!iframeRef.current) return
      iframeRef.current.contentWindow?.postMessage(
        { type: "theme-change", theme },
        "*"
      )
    }, [theme])

    // 添加 useImperativeHandle
    useImperativeHandle(
      ref,
      () => ({
        getHeight: () => {
          if (!iframeRef.current) return 0
          return (
            iframeRef.current.contentWindow?.document.getElementById("root")
              ?.offsetHeight || 0
          )
        },
      }),
      []
    )

    const style = {
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
    }
    if (isLoading) {
      return (
        <div className="flex items-center justify-center" style={style}>
          <LogoLoading />
        </div>
      )
    }

    return (
      <iframe
        ref={iframeRef}
        title="preview"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        style={style}
      />
    )
  }
)
