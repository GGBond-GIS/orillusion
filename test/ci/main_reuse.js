// CI runner variant that reuses an already-running vite on :4000.
// Use when a dev server is already up and you don't want to spawn a second one.
import { app, BrowserWindow, ipcMain } from 'electron/main'
import { join } from 'path'
import { fileURLToPath } from 'url'
const __dirname = fileURLToPath(new URL('.', import.meta.url))

app.commandLine.appendSwitch('log-level', 'silent')
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer')
const HOST = 'http://localhost:4000'

const createWindow = async () => {
    const win = new BrowserWindow({
        width: 400,
        height: 350,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeintegrationinsubframes: true,
            webviewTag: true
        }
    })
    ipcMain.on('end', (_event, result) => {
        let pass = true
        for (let i in result) {
            if (result[i].pass === false) { pass = false; break }
        }
        if (pass) console.log('\x1b[32mCI pass\x1b[0m')
        else console.error('\x1b[31mCI not pass\x1b[0m')
        console.table(result)
        close(pass ? 0 : 1)
    })
    ipcMain.on('error', (_event, log) => {
        console.error(`\x1b[31m${log.replaceAll(HOST + '/', '')}\x1b[0m\n-----------------`)
    })
    ipcMain.on('test', (_event, log) => {
        console.log(`\x1b[33m[${log.target}]\x1b[0m`)
        console.table(log.result)
        console.log('\n-----------------')
        for (let test in log.result) {
            if (log.result[test].fail !== 0) close(1)
        }
    })
    await win.loadURL(HOST + '/test/?auto')
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

function close(code = 1) {
    process.exit(code)
}
