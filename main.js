// --- Bot Configuration (Your Details) ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev/";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://t.me/QueenAdiza";
const MAX_FILE_SIZE_MB = 49;

// --- Formats with Icons ---
const SUPPORTED_FORMATS = [
    { format: "mp3", icon: "🎵" }, { format: "144", icon: "🎬" },
    { format: "240", icon: "🎬" }, { format: "360", icon: "🎬" },
    { format: "480", icon: "🎬" }, { format: "720", icon: "🔥" },
    { format: "1080", icon: "🔥" }
];

// --- Main Request Handler ---
async function handler(req) {
  if (req.method !== "POST") return new Response("Not Allowed", { status: 405 });
  if (!BOT_TOKEN) return new Response("Internal Error: BOT_TOKEN not set", { status: 500 });

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

  if (text === "/start") {
    const user = message.from;
    const welcomeMessage = `
👋 <b>Hello, ${user.first_name}! Welcome to Adiza YouTube Downloader Bot!</b> 🌹

🔑 <b>Your Telegram ID:</b> <code>${user.id}</code>

<b>How to use me:</b>
1️⃣ Paste any YouTube video link here.
2️⃣ Choose your preferred format from the buttons that appear.

<b>Features:</b>
✅ Direct downloads for files under 50MB
✅ All formats supported with icons

💡 <i>TIP: This bot is fast, free, and easy to use.</i>

❄️ <b>Stay connected:</b>
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
        [{ text: "👑 OWNER 👑", url: OWNER_URL }]
    ];
    await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
  
  } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
    await sendTelegramMessage(chatId, "Fetching download options...");
    const keyboard = createFormatButtons(text);
    await sendTelegramMessage(chatId, "Please choose a format to download:", {
      reply_markup: { inline_keyboard: keyboard }
    });
  
  } else {
    await sendTelegramMessage(chatId, "Please send a valid YouTube link to get started, or use the /start command.");
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
      await editMessageText(chatId, statusMsg.result.message_id, `✅ File is ${fileSizeMB.toFixed(2)}MB. Downloading...`);
      const fileRes = await fetch(downloadUrl);
      const fileBlob = await fileRes.blob();
      
      await editMessageText(chatId, statusMsg.result.message_id, `Uploading to Telegram...`);
      
      const fileType = format === 'mp3' ? 'audio' : 'video';
      const fileName = `${fileType}_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
      await sendMedia(chatId, fileBlob, fileType, `Downloaded via Adiza Bot\n_Developed by Matrix - King_`, fileName);
      await deleteMessage(chatId, statusMsg.result.message_id);

    } else {
      const replyText = `⚠️ File is ${fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'too large or unavailable'}.\n\n<b>Here is your direct download link:</b>\n\n<a href="${downloadUrl}">Click here to download ${format.toUpperCase()}</a>\n\n_Developed by Matrix - King_`;
      await editMessageText(chatId, statusMsg.result.message_id, replyText);
    }
  } catch (error) {
    console.error("Download handling error:", error);
    await editMessageText(chatId, statusMsg.result.message_id, "❌ Sorry, an error occurred. The link may have expired or your API is down.");
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
  return await apiRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extraParams });
}

async function sendPhoto(chatId, photoUrl, caption, extraParams = {}) {
  return await apiRequest('sendPhoto', { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML', ...extraParams });
}

async function editMessageText(chatId, messageId, text, extraParams = {}) {
  return await apiRequest('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', ...extraParams });
}

async function deleteMessage(chatId, messageId) {
  return await apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return await apiRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

async function sendMedia(chatId, blob, type, caption, fileName) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append(type, blob, fileName);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/send${type.charAt(0).toUpperCase() + type.slice(1)}`;
    await fetch(url, { method: 'POST', body: formData });
}

function createFormatButtons(videoUrl) {
  let rows = [], currentRow = [];
  SUPPORTED_FORMATS.forEach(item => {
    currentRow.push({ text: `${item.icon} ${item.format.toUpperCase()}`, callback_data: `${item.format}|${videoUrl}` });
    if (currentRow.length === 3) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

// --- Server Start ---
console.log("Starting final, stable bot server with user details...");
Deno.serve(handler);
