

const express = require('express');
const path = require('path');
const fs = require('fs');
const yts = require('yt-search');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg =require('ffmpeg-static');

const app = express();
const port = process.env.PORT || 8000;

const rootDir = path.resolve(process.cwd());
const tempDir = '/tmp'; 

const ytDlpBinaryPath = path.join(rootDir, 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);

function getYoutubeVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match : null;
}

app.get('/api', (req, res) => {
  res.status(200).json({
    status: "online",
    message: "Welcome to the Adiza-YT-Pro-Downloader API!",
    author: "Matrix1999",
    usage: {
      endpoint: "/api/download",
      method: "GET",
      parameters: { /* ... */ },
      example: { /* ... */ },
    },
  });
});

app.get('/api/download', async (req, res) => {
  const { url, format = 'mp3' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" parameter.' });
  }

  try {
    const videoId = getYoutubeVideoId(url);
    if (!videoId) throw new Error('Invalid or unsupported YouTube URL');

    const videoInfo = await yts({ videoId });
    const outputFileName = `${videoInfo.videoId}.${format}`;
    const outputFilePath = path.join(tempDir, outputFileName);
    const cookiesFilePath = path.join(rootDir, 'cookies.txt');

    let dlpArgs = [
      url,
      '--ffmpeg-location', ffmpeg,
      '--cookies', cookiesFilePath,
      '--no-mtime',
      '-o', outputFilePath,
      '--verbose' // --- THE FIX IS HERE (Part 1): Add verbose logging ---
    ];

    if (format === 'mp4') {
      dlpArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    } else {
      dlpArgs.push('-f', 'bestaudio[ext=m4a]', '--extract-audio', '--audio-format', 'mp3');
    }
    
    // --- THE FIX IS HERE (Part 2): Capture and log all output ---
    console.log('Executing yt-dlp with args:', dlpArgs.join(' '));
    const stdout = await ytDlpWrap.execPromise(dlpArgs);
    console.log('yt-dlp stdout:', stdout);

    res.setHeader('Content-Disposition', `attachment; filename="${videoInfo.title}.${format}"`);
    const fileStream = fs.createReadStream(outputFilePath);
    
    fileStream.pipe(res);

    fileStream.on('close', () => {
      fs.unlink(outputFilePath, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    });

    fileStream.on('error', (err) => {
      console.error('Stream Error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream the file.' });
      }
    });
    
  } catch (error) {
    console.error('API Error:', error.message);
    // --- THE FIX IS HERE (Part 3): Log the full error object ---
    console.error('Full Error Object:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process the download.', details: error.message, fullError: error });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
