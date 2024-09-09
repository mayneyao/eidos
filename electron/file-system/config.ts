import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

export function checkAndPromptForFolder(mainWindow: BrowserWindow | null) {
    const userDataPath = app.getPath('userData');
    const configFilePath = path.join(userDataPath, 'config.json');

    console.log('checkAndPromptForFolder', configFilePath)
    let config;
    try {
        if (fs.existsSync(configFilePath)) {
            config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
            console.log('config', config)
        } else {
            config = {};
            console.log('config is empty')
        }
    } catch (error) {
        console.error('Error reading config file:', error);
        config = {};
    }
    if (!mainWindow) {
        console.log('mainWindow is null')
        return
    }

    if (!config.dataFolder || !fs.existsSync(config.dataFolder)) {
        console.log('promptForFolder', config.dataFolder)
        promptForFolder(mainWindow, configFilePath, config);
    }
}

function promptForFolder(mainWindow: BrowserWindow, configFilePath: string, config: any) {
    console.log('promptForFolder called'); // 添加调试日志
    dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    }).then(result => {
        console.log('dialog result', result); // 添加调试日志
        if (!result.canceled) {
            console.log('promptForFolder', result.filePaths[0])
            config.dataFolder = result.filePaths[0];
            fs.writeFileSync(configFilePath, JSON.stringify(config));
        } else {
            app.quit(); // Quit the app if the user cancels the folder selection
        }
    }).catch(err => {
        console.error(err);
        app.quit(); // Quit the app if there's an error
    });
}

export function getAppConfig(): {
    dataFolder: string
} {
    const userDataPath = app.getPath('userData');
    const configFilePath = path.join(userDataPath, 'config.json');
    return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
}