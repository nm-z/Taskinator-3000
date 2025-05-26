const { BrowserWindow } = require('electron');
const path = require('path');

const win = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
  },
});

win.loadFile(path.join(__dirname, 'dist-renderer', 'index.html'));
win.webContents.openDevTools(); 