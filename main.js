// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev/";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://t.me/QueenAdiza";
const MAX_FILE_SIZE_MB = 49;

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
👋 <b>Hello, ${user.first_name}! Welcome to Adiza YouTube Downloader!</b> 🌹

Paste a YouTube link to get started.
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
        [{ text: "👑 OWNER 👑", url: OWNER_URL }]
    ];
    await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
  
  } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
    await sendTelegramMessage(chatId, "<i>Fetching video details, please wait...</i>");
    try {
        const infoUrl = `${YOUR_API_BASE_URL}/info?url=${encodeURIComponent(text)}`;
        const infoRes = await fetch(infoUrl);
        if (!infoRes.ok) throw new Error("API did not return video info.");
        const info = await infoRes.json();

        let caption = `<b>${info.title || 'Unknown Title'}</b>\n`;
        caption += `<i>by ${info.author || 'Unknown Artist'}</i>\n\n`;
        caption += `📦 <b>Available Formats:</b>\n<pre>`;
        info.formats.forEach(f => {
            caption += `\n${f.quality.padEnd(5)} - ${f.size.padStart(6)}`;
        });
        caption += `</pre>`;
        
        const keyboard = createFormatButtons(text, info.formats);
        await sendPhoto(chatId, info.thumbnail_url, caption, { reply_markup: { inline_keyboard: keyboard } });

    } catch (e) {
        console.error("Failed to fetch video info:", e);
        await sendTelegramMessage(chatId, "❌ Could not fetch video details. Please check the link or try again.");
    }
  
  } else {
    await sendTelegramMessage(chatId, "Please send a valid YouTube link.");
  }
}

async function handleCallbackQuery(callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const [format, videoUrl] = data.split("|");
  
  await answerCallbackQuery(callbackQuery.id, `Processing ${format.toUpperCase()}...`);
  const statusMsg = await sendTelegramMessage(chatId, `<i>Checking file size...</i>`);

  try {
    const downloadUrl = `${YOUR_API_BASE_URL}/download?url=${encodeURIComponent(videoUrl)}&format=${format}`;
    const headRes = await fetch(downloadUrl, { method: 'HEAD' });
    const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
    const fileSizeMB = contentLength / (1024 * 1024);

    if (fileSizeMB > 0 && fileSizeMB < MAX_FILE_SIZE_MB) {
      await editMessageText(chatId, statusMsg.result.message_id, `<i>✅ File is ${fileSizeMB.toFixed(2)}MB. Downloading...</i>`);
      const fileRes = await fetch(downloadUrl);
      const fileBlob = await fileRes.blob();
      
      await editMessageText(chatId, statusMsg.result.message_id, `<i>Uploading to Telegram...</i>`);
      
      const fileType = format === 'mp3' ? 'audio' : 'video';
      const fileName = `video_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
      await sendMedia(chatId, fileBlob, fileType, `Downloaded via @${message.chat.username || 'AdizaBot'}`, fileName);
      await deleteMessage(chatId, statusMsg.result.message_id);

    } else {
      const replyText = `⚠️ File is ${fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'too large or unavailable'}.\n\n<b>Here is your direct download link:</b>\n\n<a href="${downloadUrl}">Click here to download ${format.toUpperCase()}</a>`;
      await editMessageText(chatId, statusMsg.result.message_id, replyText);
    }
  } catch (error) {
    console.error("Download handling error:", error);
    await editMessageText(chatId, statusMsg.result.message_id, "❌ Sorry, an error occurred while downloading.");
  }
}

// --- Telegram API Helpers ---
async function apiRequest(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
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
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/send${type.charAt(0).toUpperCase() + type.slice(1)}`;
    await fetch(url, { method: 'POST', body: formData });
}

function createFormatButtons(videoUrl, formats) {
  const rows = [];
  let currentRow = [];
  const formatMap = {
      'mp3': '🎵', '144p': '📼', '240p': '📼', '360p': '📼',
      '480p': '📺', '720p': '🔥', '1080p': '🔥'
  };
  formats.forEach(f => {
    const quality = f.quality.toLowerCase();
    const icon = formatMap[quality] || '💾';
    currentRow.push({ text: `${icon} ${quality.toUpperCase()}`, callback_data: `${quality}|${videoUrl}` });
    if (currentRow.length === 3) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

// --- Server Start ---
console.log("Starting ultimate advanced bot server...");
Deno.serve(handler);
