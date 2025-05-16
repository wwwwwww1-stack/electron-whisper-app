const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectVideoFiles: () => ipcRenderer.invoke('dialog:openVideoFiles'), // 新的多文件选择方法
    selectOutputDir: () => ipcRenderer.invoke('dialog:openDirectory'),
    startTranscription: (args) => ipcRenderer.send('start-transcription', args),
    onScriptOutput: (callback) => ipcRenderer.on('script-output', (_event, value) => callback(value)),
    onTranscriptionComplete: (callback) => ipcRenderer.on('transcription-complete', (_event, value) => callback(value)),
    onTranscriptionError: (callback) => ipcRenderer.on('transcription-error', (_event, value) => callback(value)),
    onAllTranscriptionsComplete: (callback) => ipcRenderer.on('all-transcriptions-complete', (_event, value) => callback(value)) // 新的批量完成事件
});