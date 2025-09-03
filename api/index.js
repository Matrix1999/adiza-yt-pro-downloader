

const express = require('express');
const path = require('path');
const fs = require('fs');
const yts = require('yt-search');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('ffmpeg-static');

const app = express();
const port = process.env.PORT || 3000;

const rootDir = path.resolve(process.cwd());
const tempDir = '/tmp'; 

const ytDlpBinaryPath = path.join(rootDir, 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);
ytDlpWrap.setFfmpegPath(ffmpeg);

// --- NEW: Root endpoint for API documentation ---
app.get('/', (req, res) => {
  res.status(200).json({
    status: "online",
    message: "Welcome to the Adiza-YT-Pro-Downloader API!",
    author: "Matrix1999",
    usage: {
      endpoint: "/api/download",
      method: "GET",
      parameters: {
        url: {
          type: "string",
          required: true,
          description: "A valid YouTube video URL.",
        },
        format: {
          type: "string",
          required: false,
          default: "mp3",
          options: ["mp3", "mp4"],
          description: "The desired download format.",
        },
      },
      example: {
        mp3: "/api/download?url=YOUTUBE_URL&format=mp3",
        mp4: "/api/download?url=YOUTUBE_URL&format=mp4",
      },
    },
  });
});

// --- CORRECTED: Download endpoint ---
app.get('/download', async (req, res) => {
  const { url, format = 'mp3' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" parameter.' });
  }

  try {
    const videoId = yts.getVideoID(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const videoInfo = await yts({ videoId });
    const outputFileName = `${videoInfo.videoId}.${format}`;
    const outputFilePath = path.join(tempDir, outputFileName);
    const cookiesFilePath = path.join(rootDir, 'cookies.txt');

    let dlpArgs = [
      url,
      '--cookies', cookiesFilePath,
      '--no-mtime',
      '-o', outputFilePath,
    ];

    if (format === 'mp4') {
      dlpArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    } else {
      dlpArgs.push('-f', 'bestaudio[ext=m4a]', '--extract-audio', '--audio-format', 'mp3');
    }
    
    await ytDlpWrap.execPromise(dlpArgs);

    res.setHeader('Content-Disposition', `attachment; filename="${videoInfo.title}.${format}"`);
    const fileStream = fs.createReadStream(outputFilePath);
    
    fileStream.pipe(res);

    fileStream.on('close', () => {
      fs.unlinkSync(outputFilePath);
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to process the download.', details: error.message });
  }
});

// This part is for local testing; Vercel handles the serverless execution.
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
