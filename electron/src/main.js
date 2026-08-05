const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { initMain } = require("electron-audio-loopback");
const { startBackend, waitForBackend } = require("./backend");

// Enables driver-free system audio capture (desktopCapturer + loopback)
// on macOS 12.3+/Windows 10+/Linux, replacing the BlackHole requirement
// (see docs/adr/0001-system-audio-capture.md). Must be called before the
// app is ready.
initMain();

let backendProcess = null;
let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
