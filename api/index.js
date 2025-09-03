

const express = require('express');
const path = require('path');
const fs = require('fs');
const yts = require('yt-search');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const port = process.env.PORT || 3000;

// --- Define file paths for the Vercel environment ---
const rootDir = path.resolve(process.cwd());
// Vercel's serverless functions can write to the /tmp directory
const tempDir = '/tmp'; 

// Initialize yt-dlp
const ytDlpBinaryPath = path.join(rootDir, 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);

// --- The Main API Endpoint ---
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp3' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" parameter.' });
  }

  try {
    const videoInfo = await yts({ videoId: yts.getVideoID(url) });
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

    // Execute yt-dlp and wait for it to finish
    await ytDlpWrap.execPromise(dlpArgs);

    // --- Stream the file back to the user ---
    // This avoids loading the whole file into memory, which is crucial for serverless environments.
    res.setHeader('Content-Disposition', `attachment; filename="${videoInfo.title}.${format}"`);
    const fileStream = fs.createReadStream(outputFilePath);
    fileStream.pipe(res);

    // Clean up the temporary file after the stream is finished
    fileStream.on('close', () => {
      fs.unlinkSync(outputFilePath);
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to process the download.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
