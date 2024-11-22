import { ICommand } from "@/worker/web-worker/meta-table/script";

declare global {
  interface Window {
    resolveModule: (value: {
      commands: ICommand[]
    }) => void;
    rejectModule: (reason?: any) => void;
    scriptExports: any;
  }
}



export class ScriptSandbox {
  private iframe: HTMLIFrameElement | null = null

  constructor() {
    this.iframe = document.createElement("iframe")
    this.iframe.style.display = "none"
    document.body.appendChild(this.iframe)
  }

  async extractExports(scriptContent: string): Promise<ICommand[] | undefined> {
    if (!this.iframe?.contentWindow) {
      throw new Error("Sandbox iframe not initialized")
    }

    const blob = new Blob([scriptContent], { type: 'text/javascript' })
    const moduleUrl = URL.createObjectURL(blob)

    try {
      // console.log('iframe content before loading script:', this.iframe.contentWindow.document.body.innerHTML)

      const exports = await new Promise<{
        commands: ICommand[]
      }>((resolve, reject) => {
        this.iframe!.contentWindow!.resolveModule = resolve;
        this.iframe!.contentWindow!.rejectModule = reject;

        const script = this.iframe!.contentWindow!.document.createElement("script")
        script.type = "module"
        script.textContent = `
          import('${moduleUrl}')
            .then(module => {
              window.scriptExports = module;
              console.log('Module loaded:', module);
              window.resolveModule(module);
            })
            .catch(error => {
              console.error('Module loading error:', error);
              window.rejectModule(error);
            });
        `
        this.iframe!.contentWindow!.document.body.appendChild(script)

        // console.log('iframe content after adding script:', this.iframe!.contentWindow!.document.body.innerHTML)
      });
      return exports.commands
    } catch (error) {
      console.error('Error loading script:', error)
      throw error
    } finally {
      URL.revokeObjectURL(moduleUrl)
    }
  }

  destroy() {
    if (this.iframe) {
      document.body.removeChild(this.iframe)
      this.iframe = null
    }
  }
}
