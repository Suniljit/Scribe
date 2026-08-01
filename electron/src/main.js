const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { startBackend, waitForBackend } = require("./backend");

let backendProcess = null;
let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, "..", "..", "frontend", "dist", "index.html")}`;
  await mainWindow.loadURL(startUrl);
}

app.whenReady().then(async () => {
  backendProcess = startBackend(app.isPackaged);

  const ready = await waitForBackend();
  if (!ready) {
    dialog.showErrorBox(
      "Backend failed to start",
      "The local transcription backend did not respond. Make sure 'uv' is installed and on your PATH, then restart the app.",
    );
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
});
