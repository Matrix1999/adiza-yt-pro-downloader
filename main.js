// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev/";
const WELCOME_IMAGE_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrix_Zat";
const CHANNEL_URL = "https://t.me/Matrix_Tech_Updates";
const SUPPORTED_FORMATS = ["mp3", "144", "240", "360", "480", "720", "1080"];
const MAX_FILE_SIZE_MB = 49; // Telegram's bot API limit is 50MB

// Main handler for all incoming requests from Telegram
async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Please use POST method", { status: 405 });
  }
  if (!BOT_TOKEN) {
    return new Response("Internal Server Error: BOT_TOKEN is not set.", { status: 500 });
  }

  try {
    const update = await req.json();

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
    
    return new Response("ok");
  } catch (e) {
    console.error("Main handler error:", e);
    return new Response("Error processing update", { status: 500 });
  }
}

// --- Logic Handlers ---

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const user = message.from;
  const userName = user.first_name || "User";

  if (text === "/start") {
    const startMessage = `👋 Hello, **${userName}**! Welcome to Adiza's YouTube Downloader Bot!\n🌹\n\n🔑 *Your Telegram ID:* \`${user.id}\`\n\n*How to use me:*\n1️⃣ Paste any YouTube video link here.\n2️⃣ Choose your preferred format from the buttons that appear.\n\n💡 *TIP:* This bot sends files under 50MB directly!\n\nStay connected:`;
    const inline_keyboard = [
      [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
      [{ text: "👑 OWNER 👑", url: OWNER_URL }]
    ];
    await sendPhoto(chatId, WELCOME_IMAGE_URL, startMessage, { reply_markup: { inline_keyboard } });
  } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
    await sendTelegramMessage(chatId, "Fetching download options...");
    const keyboard = createFormatButtons(text);
    await sendTelegramMessage(chatId, "Please choose a format to download:", {
      reply_markup: { inline_keyboard: keyboard }
    });
  } else {
    await sendTelegramMessage(chatId, "This bot now only accepts direct YouTube links. Please send a valid link to get started, or use the `/start` command.");
  }
}

async function handleCallbackQuery(callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const [format, videoUrl] = data.split("|");
  const downloadUrl = `${YOUR_API_BASE_URL}?url=${encodeURIComponent(videoUrl)}&format=${format}`;
  
  await answerCallbackQuery(callbackQuery.id, `Processing ${format.toUpperCase()}...`);
  const statusMsg = await sendTelegramMessage(chatId, `Checking file size for ${format.toUpperCase()}...`);

  try {
    const headRes = await fetch(downloadUrl, { method: 'HEAD' });
    const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
    const fileSizeMB = contentLength / (1024 * 1024);

    if (fileSizeMB > 0 && fileSizeMB < MAX_FILE_SIZE_MB) {
      await editMessageText(chatId, statusMsg.result.message_id, `✅ File is ${fileSizeMB.toFixed(2)}MB. Downloading now...`);
      const fileRes = await fetch(downloadUrl);
      const fileBlob = await fileRes.blob();
      
      await editMessageText(chatId, statusMsg.result.message_id, `Uploading to Telegram...`);
      
      const fileType = format === 'mp3' ? 'audio' : 'video';
      await sendMedia(chatId, fileBlob, fileType, `Downloaded via Adiza Bot\n_Developed by Matrix - King_`);
      await deleteMessage(chatId, statusMsg.result.message_id);

    } else {
      const replyText = `⚠️ File is ${fileSizeMB.toFixed(2)}MB (over 50MB limit).\n\n*Here is your direct download link:*\n\n[Click here to download ${format.toUpperCase()}](${downloadUrl})\n\n_Developed by Matrix - King_`;
      await editMessageText(chatId, statusMsg.result.message_id, replyText);
    }
  } catch (error) {
    console.error("Download handling error:", error);
    await editMessageText(chatId, statusMsg.result.message_id, "❌ Sorry, an error occurred while trying to get the file. The link may have expired or your API is down.");
  }
}

// --- Telegram API Helpers ---

async function apiRequest(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendTelegramMessage(chatId, text, extraParams = {}) {
  return await apiRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extraParams });
}

async function sendPhoto(chatId, photoUrl, caption, extraParams = {}) {
  return await apiRequest('sendPhoto', { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'Markdown', ...extraParams });
}

async function editMessageText(chatId, messageId, text, extraParams = {}) {
    return await apiRequest('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', ...extraParams });
}

async function deleteMessage(chatId, messageId) {
    return await apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return await apiRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

async function sendMedia(chatId, blob, type, caption) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append(type, blob, type === 'audio' ? 'audio.mp3' : 'video.mp4');
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/send${type.charAt(0).toUpperCase() + type.slice(1)}`;
    await fetch(url, { method: 'POST', body: formData });
}

function createFormatButtons(videoUrl) {
  const rows = [];
  let currentRow = [];
  SUPPORTED_FORMATS.forEach(format => {
    currentRow.push({ text: format.toUpperCase(), callback_data: `${format}|${videoUrl}` });
    if (currentRow.length === 3) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

// --- Server Start ---
console.log("Starting simplified, reliable bot server...");
Deno.serve(handler);
