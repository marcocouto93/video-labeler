const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
// Replace 'app.asar' with 'app.asar.unpacked' so spawn can locate ffmpeg.exe on Windows
const ffmpegPath = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : '';

// If using fluent-ffmpeg:
// const ffmpeg = require('fluent-ffmpeg');
// ffmpeg.setFfmpegPath(ffmpegPath);

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 680,
    height: 650,
    // Automatically selects the right icon for OS
    icon: path.join(__dirname, 'assets/icons/png/512x512.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('select-label', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mov', 'mp4', 'webm'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-videos', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('process-videos', (event, { videoPaths, labelPath, outputDir }) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let index = 0;

  function processNext() {
    if (index >= videoPaths.length) {
      event.reply('log', '🎉 Finished processing all videos!');
      return;
    }

    const videoPath = videoPaths[index];
    const fileName = path.basename(videoPath);
    const outputPath = path.join(outputDir, fileName);

    event.reply('log', `[${index + 1}/${videoPaths.length}] Rendering: ${fileName}...`);

    const ffmpeg = spawn(ffmpegPath, [
      '-i', videoPath,
      '-i', labelPath,
      // Fix 1: Force dimensions divisible by 2 to prevent libx264 crashes
      '-filter_complex', '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[bg];[bg][1:v]overlay=0:0:eof_action=pass[v]',
      '-map', '[v]',
      // Fix 2: '0:a?' makes audio mapping optional (prevents crash if video is silent)
      '-map', '0:a?', 
      '-c:a', 'copy',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        event.reply('log', `✅ Saved: ${fileName}`);
      } else {
        event.reply('log', `❌ Error processing: ${fileName}`);
      }
      index++;
      processNext();
    });
  }

  processNext();
});