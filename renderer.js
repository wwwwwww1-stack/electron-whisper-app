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
const concurrencyInput = document.getElementById('concurrency'); // New element

let currentVideoPaths = []; // Changed from string to array
let currentOutputDirPath = '';

selectVideoBtn.addEventListener('click', async () => {
    // Modify to handle multiple file selection if the API supports it
    // For now, assuming 'selectVideoFile' is updated in preload.js and main.js
    // to return an array of paths or we call it multiple times/have a new API method.
    // Let's assume 'selectVideoFiles' (plural) will be the new method in preload.js
    const filePaths = await window.electronAPI.selectVideoFiles(); // Assuming a new or modified API
    if (filePaths && filePaths.length > 0) {
        videoFilePathSpan.textContent = filePaths.join(', ');
        currentVideoPaths = filePaths;
    } else {
        videoFilePathSpan.textContent = 'No files selected';
        currentVideoPaths = [];
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
    if (currentVideoPaths.length === 0) {
        alert('Please select at least one video file.');
        return;
    }
    if (!currentOutputDirPath) {
        alert('Please select an output directory.');
        return;
    }

    const concurrency = parseInt(concurrencyInput.value, 10);
    if (isNaN(concurrency) || concurrency < 1) {
        alert('Please enter a valid number for concurrent transcriptions.');
        return;
    }

    // Clear previous log and srt path
    outputLog.textContent = '';
    srtOutputPathDisplay.textContent = ''; // This might need to be cleared or updated differently for batch
    startBtn.disabled = true;
    outputLog.textContent += `Starting transcription process for ${currentVideoPaths.length} file(s)...
`;
    outputLog.textContent += `Concurrency set to: ${concurrency}\n`;

    // For batch processing, we'll send all paths and concurrency to main.js
    // main.js will handle creating individual SRT names and managing the queue.
    const args = {
        videoPaths: currentVideoPaths, // Array of video paths
        outputDir: currentOutputDirPath, // Single output directory
        model: modelSelect.value,
        language: languageSelect.value || null,
        task: taskSelect.value,
        concurrency: concurrency
    };

    window.electronAPI.startTranscription(args);
});

window.electronAPI.onScriptOutput((data) => {
    outputLog.textContent += data;
    outputLog.scrollTop = outputLog.scrollHeight; // Auto-scroll
});

window.electronAPI.onTranscriptionComplete((data) => {
    // This will likely need to be updated to handle multiple completions
    // or a single message when all are done.
    outputLog.textContent += `\n${data.message}\n`;
    if (data.srtPath) { // For individual file completion if main.js sends it
        srtOutputPathDisplay.textContent += `SRT file saved: ${data.srtPath}\n`;
        outputLog.textContent += `SRT Output Path: ${data.srtPath}\n`;
    } else if (data.allComplete) { // A new flag to indicate all files are processed
        srtOutputPathDisplay.textContent = `All ${data.count} files processed. Check output directory.`;
    }
    // Potentially re-enable startBtn only when all tasks in the batch are done.
    // This logic will be managed by main.js sending appropriate signals.
    // For now, let's assume main.js sends a specific signal or updates a counter.
    // startBtn.disabled = false; // This will be handled by a new 'all-transcriptions-complete' event
});

window.electronAPI.onTranscriptionError((errorMsg) => {
    outputLog.textContent += `\nERROR: ${errorMsg}\n`;
    // Decide if startBtn should be re-enabled on error for one file in a batch
    // startBtn.disabled = false; // Potentially re-enable or handle based on batch status
});

// New event listener for when all batch transcriptions are complete
window.electronAPI.onAllTranscriptionsComplete((data) => {
    outputLog.textContent += `\n${data.message}\n`;
    srtOutputPathDisplay.textContent = data.summary || 'All transcriptions finished.';
    startBtn.disabled = false;
});