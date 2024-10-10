import { BrowserWindow, WebContents, WebContentsView, WebContentsViewConstructorOptions, shell } from "electron";
import path from "path";

export const defaultViewOptions: WebContentsViewConstructorOptions = {
    webPreferences: {
        preload: path.join(__dirname, './preload.mjs'),
        nodeIntegration: true,
        contextIsolation: true,
    }
}

export class WindowManager {
    currentTab: string | null = null;
    private openTabs: Map<string, WebContentsView> = new Map();
    private win: BrowserWindow


    get tabs() {
        return Array.from(this.openTabs.keys())
    }
    constructor(win: BrowserWindow) {
        this.currentTab = null;
        this.openTabs = new Map();
        this.win = win
        this.setWebContents(win.webContents)
    }

    private broadcastTabsUpdate(): void {
        const openTabs = Array.from(this.openTabs.keys());
        this.win?.webContents.send('tabs-updated', openTabs);
        this.win?.webContents.send('current-tab-updated', this.currentTab);
        this.openTabs.forEach((view) => {
            view.webContents.send('tabs-updated', openTabs);
            view.webContents.send('current-tab-updated', this.currentTab);
        });
    }

    createView(opt: {
        webPreferences: WebContentsViewConstructorOptions['webPreferences'],
        url: string,
    }) {
        const { webPreferences, url } = opt
        const parent = this.win
        const view = new WebContentsView({ webPreferences })
        view.webContents.loadURL(url)
        console.log(parent.getBounds())
        view.setBounds({
            x: 0,
            y: 0,
            width: parent.getBounds().width,
            height: parent.getBounds().height,
        })
        parent.contentView.addChildView(view)
        this.setWebContents(view.webContents)
        this.openTab(url, view) // Update to pass view
        view.webContents.openDevTools()
        return view
    }

    private setWebContents = (webContents: WebContents) => {
        // Test active push message to Renderer-process.
        webContents.on('did-finish-load', () => {
            webContents.send('main-process-message', (new Date).toLocaleString());
        });

        // Ensure links open in the default browser based on domain
        const handleExternalLinks = (event: Electron.Event, url: string) => {
            const { hostname } = new URL(url);
            if (hostname !== 'localhost') {
                event.preventDefault();
                shell.openExternal(url);
            }
        };

        webContents.on('will-navigate', handleExternalLinks);

        webContents.setWindowOpenHandler(({ url }) => {
            const currentDomain = new URL(this.win.webContents.getURL()).origin;
            const newDomain = new URL(url).origin;
            if (currentDomain === newDomain) {
                this.createView({
                    webPreferences: defaultViewOptions.webPreferences,
                    url,
                })
                return { action: 'deny' };
            } else {
                handleExternalLinks(new Event(''), url)
                return { action: 'deny' };
            }
        });
    }

    // 打开一个新的 tab
    openTab(url: string, view: WebContentsView): void {
        this.openTabs.set(url, view);
        this.currentTab = url;
        this.broadcastTabsUpdate();
    }

    // 关闭一个 tab
    closeTab(url: string): void {
        this.openTabs.delete(url);
        if (this.currentTab === url) {
            this.currentTab = this.openTabs.size > 0 ? Array.from(this.openTabs.keys())[0] : null;
        }
        this.broadcastTabsUpdate();
    }
    // 切换到一个已经打开的 tab
    switchTab(url: string): void {
        if (this.openTabs.has(url)) {
            this.currentTab = url;
            this.win?.webContents.send('current-tab-updated', this.currentTab);
        } else {
            console.error(`Tab with url ${url} is not open.`);
        }
    }

    // 获取当前 tab
    getCurrentTab(): string | null {
        return this.currentTab;
    }

    // 获取所有已经打开的 tab
    getOpenTabs(): string[] {
        return Array.from(this.openTabs.keys());
    }
}

