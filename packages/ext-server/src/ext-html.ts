import type { Config } from "tailwindcss"

export interface ExtensionContext {
  type?: string
  space?: string
  locale?: string
  nodeId?: string
  tableId?: string
  viewId?: string
  filePath?: string
  currentDay?: string
  syncEnabled?: boolean
}

export interface IndexHtmlProps {
  theme: string
  importMap: string
  cssLoaderScript: string
  sdkInjectScriptContent: string
  envString: string
  compiledCode: string
  defaultPropsString: string
  serverSideProps: any
  rawThemeCss: string
  extensionContext?: ExtensionContext
}

export const getIndexHtml = (props: IndexHtmlProps): string => {
  const {
    theme,
    importMap,
    cssLoaderScript,
    sdkInjectScriptContent,
    envString,
    serverSideProps,
    rawThemeCss,
    extensionContext,
  } = props

  return `<html class="${theme}">
      <head>
        ${importMap}
        <script src="/tailwind-raw.js"></script>
        ${sdkInjectScriptContent}
        ${cssLoaderScript}
        <script>
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
            }
        </script>
        <script>
          window.__serverSideProps = ${JSON.stringify(serverSideProps)};
          window.__extensionContext = ${extensionContext ? JSON.stringify(extensionContext) : "null"};
          window.process = {
            env: ${envString}
          };
          window.addEventListener('error', function(e) {
            console.error('Runtime error:', e);
          });
          window.addEventListener('unhandledrejection', function(e) {
            console.error('Unhandled Promise Rejection:', e);
          });
          window.addEventListener('message', (event) => {
            if (event.data.type === 'theme-change') {
              document.documentElement.className = event.data.theme;
            }
          });
        </script>
        <style>
          ${rawThemeCss}
          * {
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
            border-color: var(--border);
          }
    
          body {
            background-color: var(--background);
            color: var(--foreground);
            margin: 0;
            padding: 0;
          }
    
          #loading {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--background);
            transition: opacity 0.2s;
            font-family: monospace;
            font-size: 16px;
          }
    
          #loading::after {
            content: '...';
            animation: dots 1.5s steps(4, end) infinite;
            width: 1.5em;
            display: inline-block;
            text-align: left;
          }
    
          @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80%, 100% { content: '...'; }
          }
        </style>

      </head>
      <body>
        <div id="loading">Loading</div>
        <div id="root" style="height: 100%"></div>
        <script src="/app-wrapper.js" type="module"></script>
      </body>
    </html>
    `
}
