const { contextBridge, ipcRenderer } = require("electron");

// electron-audio-loopback's manual-mode IPC handlers (registered by
// initMain() in main.js). The renderer calls enableLoopbackAudio(),
// then navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
// directly, then disableLoopbackAudio() once it has the stream.
contextBridge.exposeInMainWorld("scribeNative", {
  isElectron: true,
  enableLoopbackAudio: () => ipcRenderer.invoke("enable-loopback-audio"),
  disableLoopbackAudio: () => ipcRenderer.invoke("disable-loopback-audio"),
});
