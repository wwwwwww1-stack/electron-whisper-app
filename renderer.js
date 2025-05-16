const selectVideoBtn = document.getElementById('selectVideoBtn');
const videoFilePathSpan = document.getElementById('videoFilePath');
const selectOutputDirBtn = document.getElementById('selectOutputDirBtn');
const outputDirPathSpan = document.getElementById('outputDirPath');
const modelSelect = document.getElementById('modelSelect');
const languageSelect = document.getElementById('languageSelect');
const taskSelect = document.getElementById('taskSelect');
const startBtn = document.getElementById('startBtn');
const outputLog = document.getElementById('outputLog');
const srtOutputPathDisplay = document.getElementById('srtOutputPathDisplay');

let currentVideoPath = '';
let currentOutputDirPath = '';

selectVideoBtn.addEventListener('click', async () => {
    const filePath = await window.electronAPI.selectVideoFile();
    if (filePath) {
        videoFilePathSpan.textContent = filePath;
        currentVideoPath = filePath;
    } else {
        videoFilePathSpan.textContent = 'No file selected';
        currentVideoPath = '';
    }
});

selectOutputDirBtn.addEventListener('click', async () => {
    const dirPath = await window.electronAPI.selectOutputDir();
    if (dirPath) {
        outputDirPathSpan.textContent = dirPath;
        currentOutputDirPath = dirPath;
    } else {
        outputDirPathSpan.textContent = 'No directory selected';
        currentOutputDirPath = '';
    }
});

startBtn.addEventListener('click', () => {
    if (!currentVideoPath) {
        alert('Please select a video file.');
        return;
    }
    if (!currentOutputDirPath) {
        alert('Please select an output directory.');
        return;
    }

    // Clear previous log and srt path
    outputLog.textContent = '';
    srtOutputPathDisplay.textContent = '';
    startBtn.disabled = true;
    outputLog.textContent += 'Starting transcription process...\n';

    const videoFileName = currentVideoPath.split(/[\\/]/).pop(); // Get filename
    const srtFileName = videoFileName.substring(0, videoFileName.lastIndexOf('.')) + '.srt'; // video.mp4 -> video.srt

    // Construct full output SRT path. Ensure it's platform-independent if sending to Python
    // For simplicity here, we assume Python script handles path joining if outputDirPath is just a dir.
    // The Python script expects a full path, so let's construct it.
    // Note: Node's path.join would be ideal if main.js constructed this,
    // but here renderer needs to pass it, so string concat is shown.
    // Python's Path(output_dir) / srt_filename is more robust.
    // The python script expects a full path `output_srt_path_str`
    const outputSrtPath = `${currentOutputDirPath}${currentOutputDirPath.includes('/') ? '/' : '\\'}${srtFileName}`;


    const args = {
        videoPath: currentVideoPath,
        outputSrtPath: outputSrtPath, // Send the constructed full path
        model: modelSelect.value,
        language: languageSelect.value || null, // Send null if empty for auto-detect
        task: taskSelect.value
    };

    window.electronAPI.startTranscription(args);
});

window.electronAPI.onScriptOutput((data) => {
    outputLog.textContent += data;
    outputLog.scrollTop = outputLog.scrollHeight; // Auto-scroll
});

window.electronAPI.onTranscriptionComplete((data) => {
    outputLog.textContent += `\n${data.message}\n`;
    if (data.srtPath) {
        srtOutputPathDisplay.textContent = `SRT file saved: ${data.srtPath}`;
        outputLog.textContent += `SRT Output Path: ${data.srtPath}\n`;
    }
    startBtn.disabled = false;
});

window.electronAPI.onTranscriptionError((errorMsg) => {
    outputLog.textContent += `\nERROR: ${errorMsg}\n`;
    startBtn.disabled = false;
});