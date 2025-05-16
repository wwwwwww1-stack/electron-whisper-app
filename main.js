const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 750, // 稍微增加高度以容纳更多日志
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // 指定 preload 脚本的路径
            contextIsolation: true, // 推荐，为了安全
            enableRemoteModule: false, // 推荐禁用 remote 模块，为了安全
            nodeIntegration: false // 在渲染进程中禁用 Node.js 集成，为了安全
        }
    });

    mainWindow.loadFile('index.html'); // 加载应用的 HTML 界面

    // 如果需要，可以取消注释下一行来打开开发者工具
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        // 取消引用 window 对象，如果你的应用支持多窗口，
        // 通常会把多个 window 对象存放在一个数组里，
        // 但在这里，我们只有一个窗口，所以直接设为 null。
        mainWindow = null;
    });
}

// Electron 应用已准备好创建浏览器窗口时调用此方法
app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
        // 通常会重新创建一个窗口。
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// 当所有窗口都关闭时退出应用，除了 macOS。
// 在 macOS 上，应用及其菜单栏通常会保持活动状态，直到用户使用 Cmd + Q 显式退出。
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC 处理程序 ---

// 处理选择视频文件的请求
ipcMain.handle('dialog:openVideoFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '选择视频文件',
        properties: ['openFile'],
        filters: [
            { name: '视频文件', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv'] },
            { name: '所有文件', extensions: ['*'] }
        ]
    });
    if (canceled || filePaths.length === 0) {
        return null;
    } else {
        return filePaths[0];
    }
});

// 处理选择多个视频文件的请求
ipcMain.handle('dialog:openVideoFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '选择视频文件',
        properties: ['openFile', 'multiSelections'], // 启用多选
        filters: [
            { name: '视频文件', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv'] },
            { name: '所有文件', extensions: ['*'] }
        ]
    });
    if (canceled || filePaths.length === 0) {
        return null;
    } else {
        return filePaths;
    }
});

// 处理选择输出目录的请求
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '选择SRT文件输出目录',
        properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return null;
    } else {
        return filePaths[0];
    }
});

// 处理启动 Python 脚本进行转录的请求
ipcMain.on('start-transcription', (event, args) => {
    const { videoPaths, outputDir, model, language, task, concurrency } = args;
    
    let completedCount = 0;
    let activeJobs = 0;
    const queue = [...videoPaths];
    
    const startNextJob = () => {
        if (queue.length === 0 || activeJobs >= concurrency) return;
        
        activeJobs++;
        const videoPath = queue.shift();
        const videoFileName = path.basename(videoPath);
        const srtFileName = videoFileName.substring(0, videoFileName.lastIndexOf('.')) + '.srt';
        const outputSrtPath = path.join(outputDir, srtFileName);
        
        const scriptPath = path.join(__dirname, 'transcribe_video.py');
        const pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
        
        const scriptArgs = [
            scriptPath,
            videoPath,
            '--output_srt_path', outputSrtPath,
            '--model', model,
            '--task', task
        ];
        
        if (language && language.trim() !== '') {
            scriptArgs.push('--language', language);
        }
        
        mainWindow.webContents.send('script-output', `开始处理文件: ${videoFileName}\n`);
        
        const pythonProcess = spawn(pythonExecutable, scriptArgs);
        
        pythonProcess.stdout.on('data', (data) => {
            mainWindow.webContents.send('script-output', data.toString());
        });
        
        pythonProcess.stderr.on('data', (data) => {
            mainWindow.webContents.send('script-output', `错误输出 (${videoFileName}): ${data.toString()}`);
        });
        
        pythonProcess.on('close', (code) => {
            activeJobs--;
            completedCount++;
            
            if (code === 0) {
                mainWindow.webContents.send('transcription-complete', {
                    message: `文件 ${videoFileName} 转录完成`,
                    srtPath: outputSrtPath
                });
            } else {
                mainWindow.webContents.send('transcription-error', 
                    `处理文件 ${videoFileName} 失败，退出代码: ${code}`);
            }
            
            // 检查是否所有任务都完成了
            if (completedCount === videoPaths.length) {
                mainWindow.webContents.send('all-transcriptions-complete', {
                    message: `所有 ${completedCount} 个文件处理完成`,
                    summary: `成功处理了 ${completedCount} 个文件，请查看输出目录`
                });
            } else {
                startNextJob(); // 启动下一个任务
            }
        });
        
        pythonProcess.on('error', (err) => {
            activeJobs--;
            completedCount++;
            mainWindow.webContents.send('transcription-error', 
                `启动处理文件 ${videoFileName} 失败: ${err.message}`);
            
            if (completedCount === videoPaths.length) {
                mainWindow.webContents.send('all-transcriptions-complete', {
                    message: `所有任务处理完成，但有错误发生`,
                    summary: `处理了 ${completedCount} 个文件，请检查日志了解详情`
                });
            } else {
                startNextJob(); // 启动下一个任务
            }
        });
    };
    
    // 根据并发数启动初始任务
    for (let i = 0; i < Math.min(concurrency, videoPaths.length); i++) {
        startNextJob();
    }
});