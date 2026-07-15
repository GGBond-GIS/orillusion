// Minimal Electron main used by the Playwright sample runner.
// The runner attaches via CDP and drives the window; this file only opens
// an empty BrowserWindow with the webgpu flags enabled.
import { app, BrowserWindow } from 'electron/main';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');
app.commandLine.appendSwitch('log-level', 'silent');

const createWindow = async () => {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        webPreferences: {
            offscreen: false,
            sandbox: false,
            nodeintegrationinsubframes: true,
            webviewTag: true,
        },
    });
    await win.loadURL('about:blank');
};

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
