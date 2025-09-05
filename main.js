import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import yts from "npm:yt-search";

// --- IMPORTANT CORRECTION ---
// Get your Telegram bot token from an environment variable named "BOT_TOKEN".
// Do NOT paste your token directly into the code.
const BOT_TOKEN = Deno.env.get("8495212213:AAGkx6NJ0slDxpMmD122uz46soLLVS1Ya7c");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev/";

// The main function that handles incoming webhook requests
async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Please use POST method", { status: 405 });
  }

  if (!BOT_TOKEN) {
    console.error("Error: TELEGRAM_BOT_TOKEN environment variable is not set.");
    return new Response("Internal Server Error", { status: 500 });
  }

  try {
    const update = await req.json();

    if (update.message && update.message.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;

      // --- ADDED: Handle the /start command ---
      if (text === "/start") {
        const startMessage = `
*Welcome to the YouTube Downloader Bot!*

To download a video or audio, use the \`/ytdl\` command followed by a song name or a YouTube URL.

*Example:*
\`/ytdl Never Gonna Give You Up\`

or

\`/ytdl https://www.youtube.com/watch?v=dQw4w9WgXcQ\`

The bot will send you direct download links for MP3 audio and 720p video.

---
_Developed by Matrix - King_
        `;
        await sendTelegramMessage(chatId, startMessage, "Markdown");

      // Check for the /ytdl command
      } else if (text.startsWith("/ytdl ")) {
        const query = text.substring(5).trim();
        if (!query) {
          await sendTelegramMessage(chatId, "Please provide a song name or YouTube URL after the command.");
          return new Response("ok");
        }

        await sendTelegramMessage(chatId, `Searching for "${query}"...`);

        let videoUrl = "";
        if (query.includes("youtube.com/") || query.includes("youtu.be/")) {
            videoUrl = query;
        } else {
            const searchResult = await yts(query);
            const firstVideo = searchResult.videos[0];
            if (!firstVideo) {
                await sendTelegramMessage(chatId, `Could not find any results for "${query}".`);
                return new Response("ok");
            }
            videoUrl = firstVideo.url;
        }
        
        const audioDownloadUrl = `${YOUR_API_BASE_URL}?url=${encodeURIComponent(videoUrl)}&format=mp3`;
        const videoDownloadUrl = `${YOUR_API_BASE_URL}?url=${encodeURIComponent(videoUrl)}&format=720`;

        const replyText = `
*Download Links Ready!*

*Audio (MP3):* [Click here to download](${audioDownloadUrl})

*Video (720p):* [Click here to download](${videoDownloadUrl})

---
_Developed by Matrix - King_
        `;
        await sendTelegramMessage(chatId, replyText, "Markdown");
      }
    }

    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("Error processing update", { status: 500 });
  }
}

// Function to send a message using the Telegram Bot API
async function sendTelegramMessage(chatId: number, text: string, parseMode?: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode || "",
  };

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Start the Deno server
console.log("Starting server...");
serve(handler);
