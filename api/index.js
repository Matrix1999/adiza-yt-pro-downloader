

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
  return (match && match[7].length === 11) ? match[7] : null;
}

app.get('/api', (req, res) => {
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
    ];

    if (format === 'mp4') {
      dlpArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    } else {
      dlpArgs.push('-f', 'bestaudio[ext=m4a]', '--extract-audio', '--audio-format', 'mp3');
    }
    
    await ytDlpWrap.execPromise(dlpArgs);

    res.setHeader('Content-Disposition', `attachment; filename="${videoInfo.title}.${format}"`);
    const fileStream = fs.createReadStream(outputFilePath);
    
    // Pipe the file to the response.
    fileStream.pipe(res);

    // Clean up the file after the download is finished.
    fileStream.on('close', () => {
      fs.unlink(outputFilePath, (err) => {
        if (err) {
          console.error('Failed to delete temporary file:', err);
        }
      });
    });

    // Handle any errors from the stream itself.
    fileStream.on('error', (err) => {
      console.error('Stream Error:', err);
      // THE FIX IS HERE (Part 1) - Check if headers are already sent
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream the file.' });
      }
    });
    
  } catch (error) {
    console.error('API Error:', error);
    // THE FIX IS HERE (Part 2) - Check if headers are already sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process the download.', details: error.message });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
