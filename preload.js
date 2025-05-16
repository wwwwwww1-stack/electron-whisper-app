 const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectVideoFile: () => ipcRenderer.invoke('dialog:openVideoFile'),
    selectOutputDir: () => ipcRenderer.invoke('dialog:openDirectory'),
    startTranscription: (args) => ipcRenderer.send('start-transcription', args),
    onScriptOutput: (callback) => ipcRenderer.on('script-output', (_event, value) => callback(value)),
    onTranscriptionComplete: (callback) => ipcRenderer.on('transcription-complete', (_event, value) => callback(value)),
    onTranscriptionError: (callback) => ipcRenderer.on('transcription-error', (_event, value) => callback(value))
});