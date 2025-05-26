const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getNoVncRfbPath: async () => ipcRenderer.invoke('get-novnc-rfb-path'),
  logRendererError: (error) => ipcRenderer.send('log-renderer-error', error)
});

window.addEventListener('error', event => {
  ipcRenderer.send('log-renderer-error', {
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? event.error.stack : 'N/A'
  });
});

window.addEventListener('unhandledrejection', event => {
  ipcRenderer.send('log-renderer-error', {
    message: 'Unhandled Promise Rejection',
    reason: event.reason ? (event.reason.stack || event.reason.toString()) : 'N/A'
  });
}); 