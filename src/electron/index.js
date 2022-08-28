const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
async function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true
    }
  })
  win.setMenu(null)
  win.loadFile('../../dist/index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await app.quit()
  }
})