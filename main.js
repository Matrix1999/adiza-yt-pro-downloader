import yts from "npm:yt-search";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev/";

// --- Bot Configuration ---
const WELCOME_IMAGE_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg"; // URL for your welcome image
const OWNER_URL = "https://t.me/Matrix_Zat"; // Your Telegram profile link
const CHANNEL_URL = "https://t.me/QueenAdiza"; 
const SUPPORTED_FORMATS = ["mp3", "144", "240", "360", "480", "720", "1080"];

// Main handler for all incoming requests from Telegram
async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Please use POST method", { status: 405 });
  }

  if (!BOT_TOKEN) {
    console.error("Error: BOT_TOKEN environment variable is not set.");
    return new Response("Internal Server Error", { status: 500 });
  }

  try {
    const update = await req.json();

    // Handle button presses (callbacks)
    if (update.callback_query) {
      const { data, message } = update.callback_query;
      const [format, videoUrl] = data.split("|");
      
      const downloadUrl = `${YOUR_API_BASE_URL}?url=${encodeURIComponent(videoUrl)}&format=${format}`;
      const replyText = `✅ *Your direct download link is ready:*\n\n[Click here to download ${format.toUpperCase()}](${downloadUrl})\n\n_Developed by Matrix - King_`;
      
      await sendTelegramMessage(message.chat.id, replyText, { parse_mode: "Markdown" });
      await answerCallbackQuery(update.callback_query.id);
      return new Response("ok");
    }

    // Handle regular messages
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text || "";
      const user = message.from;
      const userName = user.first_name || "User";

      // Handle the /start command
      if (text === "/start") {
        const startMessage = `
👋 Hello, ${userName}! Welcome to Adiza's YouTube Downloader Bot!
🌹

🔑 *Your Telegram ID:* \`${user.id}\`

*How to use me:*
1️⃣ Paste any YouTube video link here.
2️⃣ Choose your preferred format from the buttons that appear.

💡 *TIP:* This bot uses a free, easy-to-use API for fast YouTube video and audio downloads in various formats!

Stay connected:
        `;

        const inline_keyboard = [
          [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
          [{ text: "👑 OWNER 👑", url: OWNER_URL }]
        ];
        
        await sendPhoto(chatId, WELCOME_IMAGE_URL, startMessage, { 
            reply_markup: { inline_keyboard },
            parse_mode: "Markdown"
        });

      // Handle YouTube links
      } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
        await sendTelegramMessage(chatId, "Fetching download options...");

        const videoUrl = text;
        const keyboard = createFormatButtons(videoUrl);
        
        await sendTelegramMessage(chatId, "Please choose a format to download:", {
          reply_markup: { inline_keyboard: keyboard }
        });

      } else {
        // Optional: Reply if the message is not a command or a YouTube link
        await sendTelegramMessage(chatId, "Please send me a YouTube link to get started, or use the /start command.");
      }
    }

    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("Error processing update", { status: 500 });
  }
}

// --- Helper Functions for Telegram API ---

// Creates the grid of format buttons
function createFormatButtons(videoUrl) {
    const rows = [];
    let currentRow = [];
    SUPPORTED_FORMATS.forEach(format => {
        currentRow.push({
            text: format.toUpperCase(),
            callback_data: `${format}|${videoUrl}`
        });
        if (currentRow.length === 3) { // 3 buttons per row
            rows.push(currentRow);
            currentRow = [];
        }
    });
    if (currentRow.length > 0) {
        rows.push(currentRow);
    }
    return rows;
}

// Sends a text message
async function sendTelegramMessage(chatId, text, extraParams = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extraParams }),
  });
}

// Sends a photo with a caption
async function sendPhoto(chatId, photoUrl, caption, extraParams = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, ...extraParams }),
  });
}

// Acknowledges a button press
async function answerCallbackQuery(callbackQueryId) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
}

// Start the Deno server
console.log("Starting advanced bot server with Deno.serve...");
Deno.serve(handler);
