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
    const { videoPath, outputSrtPath, model, language, task } = args;

    // 确定 Python 脚本的路径。
    // 如果你打包你的应用，这里可能需要调整。
    const scriptName = 'transcribe_video.py'; // Python 脚本的文件名
    const scriptPath = path.join(__dirname, scriptName);

    // 确定 Python 可执行文件的路径
    // 在某些系统上可能是 'python3' 或需要指定完整路径
    const pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3'; // 或者只是 'python'

    const scriptArgs = [
        scriptPath, // Python 脚本本身作为第一个参数
        videoPath,
        '--output_srt_path', outputSrtPath,
        '--model', model,
        '--task', task
    ];

    if (language && language.trim() !== '') {
        scriptArgs.push('--language', language);
    }

    mainWindow.webContents.send('script-output', `准备执行: ${pythonExecutable} "${scriptArgs.join('" "')}"\n`);

    const pythonProcess = spawn(pythonExecutable, scriptArgs);

    let srtFileGeneratedPath = null; // 用于存储从 Python 脚本捕获的 SRT 文件路径

    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        mainWindow.webContents.send('script-output', output);
        // 检查 Python 脚本中定义的特殊标记
        const srtPathMarker = "SRT_OUTPUT_PATH:";
        if (output.includes(srtPathMarker)) {
            srtFileGeneratedPath = output.substring(output.indexOf(srtPathMarker) + srtPathMarker.length).trim();
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('script-output', `错误输出 (stderr): ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            mainWindow.webContents.send('transcription-complete', {
                message: '转录过程成功完成。',
                srtPath: srtFileGeneratedPath // 将捕获到的 SRT 路径发送回渲染器
            });
        } else {
            mainWindow.webContents.send('transcription-error', `Python 脚本执行失败，退出代码: ${code}`);
        }
        mainWindow.webContents.send('script-output', `\nPython 脚本已退出，代码: ${code}\n`);
    });

    pythonProcess.on('error', (err) => {
        mainWindow.webContents.send('transcription-error', `启动 Python 脚本失败: ${err.message}`);
        mainWindow.webContents.send('script-output', `启动 Python 脚本错误: ${err.message}\n`);
    });
});