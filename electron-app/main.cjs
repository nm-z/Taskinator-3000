const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

process.on('uncaughtException', (error, origin) => {
  console.error('----- Uncaught Main Process Exception -----');
  console.error('Origin:', origin);
  console.error(error);
  console.error('-------------------------------------------');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('----- Unhandled Main Process Rejection -----');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('--------------------------------------------');
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelString = ['VERBOSE', 'INFO', 'WARNING', 'ERROR'][level] || 'INFO';
    console.log(`[RENDERER CONSOLE ${levelString}] ${sourceId}:${line} ${message}`);
  });

  win.loadFile(path.join(__dirname, 'dist-renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-app-config', () => {
  return {
    VNC_PASSWORD: process.env.XPRA_PASSWORD || 'password',
    VNC_WEBSOCKET_URL: 'ws://localhost:14500/websockify',
    CHAT_API_URL: 'http://localhost:5000/chat'
  };
});

ipcMain.on('log-renderer-error', (event, errorDetails) => {
  console.error('----- Unhandled Renderer Process Error/Rejection -----');
  console.error(errorDetails);
  console.error('----------------------------------------------------');
});

ipcMain.handle('get-novnc-rfb-path', () => {
  return path.join(app.getAppPath(), 'node_modules', '@novnc', 'novnc', 'lib', 'rfb.js');
}); 