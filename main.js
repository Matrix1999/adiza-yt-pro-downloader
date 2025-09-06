// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb5JJ438kyyGlFHTyZ0n";
const BOT_USERNAME = "adiza_ytdownloader_bot";
const MAX_FILE_SIZE_MB = 49;
// --- NEW: Add your Paystack Payment Page link here ---
const DONATE_URL = "https://paystack.shop/pay/adiza-bot-donate"; // <-- IMPORTANT: Replace this

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
    "CAACAgIAAxkBAAE6q6Fou5MX6nv0HE5duKOzHhvyR08osQACRgADUomRI_j-5eQK1QodNgQ", "CAACAgIAAxkBAAE6q59ou5MNTS_iZ5hTleMdiDQbVuh4rQACSQADUomRI4zdJVjkz_fvNgQ",
    "CAACAgIAAxkBAAE6q51ou5L3EZV6j-3b2pPqjIEN4ewQgAAC1QUAAj-VzAr0FV2u85b8KDYE", "CAACAgUAAxkBAAE6q7dou5WIlhBfKD6h3wWmZpoePIGWSAACDBEAApkMcFRMS-HQnAqmzzYE",
    "CAACAgUAAxkBAAE6q7lou5WM-I1TWj6Z5u6iER70yqszCQACphgAAnLIyFeyFwmm5dR_8zYE", "CAACAgUAAxkBAAE6q7tou5WR18mZRfVWpSXXMevkTKoTKAAC7BAAAkSw2FQUETd0uSTUdTYE",
    "CAACAgUAAxkBAAE6q71ou5XOmUTrhmn8-jWpplgzJ-fxcwACdxEAAk7CIFXNdisJ2fejnTYE", "CAACAgUAAxkBAAE6q79ou5Xa16ci77HKeE53XaQ_C4wqKAACXRAAAtGVYVQB72w7kFjy1jYE",
    "CAACAgUAAxkBAAE6q8Fou5XlYVE8etdE36V1cvEWyhQM-gACLhEAAoaQCVeBaEKoltXVFzYE", "CAACAgUAAxkBAAE6q8Nou5X-WlD8j5XFxMCjfHcel3GNdQACRQADunh9JkKCie3gP8QLNgQ"
];

// --- State Management ---
let stickerCounter = 0;
const activeDownloads = new Map();

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

// --- Helper: Delay Function ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Logic Handlers ---
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const user = message.from;

  if (text === "/start") {
    if (WELCOME_STICKER_IDS.length > 0) {
        const stickerIndex = stickerCounter % WELCOME_STICKER_IDS.length;
        await sendSticker(chatId, WELCOME_STICKER_IDS[stickerIndex]);
        stickerCounter++;
    }
    await delay(4000);
    const userStatus = user.is_premium ? "⭐ Premium User" : "👤 Standard User";
    const welcomeMessage = `
👋 Hello, <b>${user.first_name}</b>!

<b>User ID:</b> <code>${user.id}</code>
<b>Status:</b> ${userStatus}

Welcome to Adiza YouTube Downloader! 🌹
Paste a YouTube link, use /settings, or /donate to support us.
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
        [{ text: "👑 OWNER 👑", url: OWNER_URL }]
    ];
    await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
  
  } else if (text === "/settings") {
    await sendTelegramMessage(chatId, "⚙️ *User Settings*\n\n_This feature is coming soon!_", { parse_mode: 'Markdown' });

  } else if (text === "/donate") {
    const donateMessage = `
💖 **Support Adiza Bot!**

Thank you for considering a donation! Your support helps cover server costs and allows me to keep adding new features.

Click the button below to make a secure donation via Paystack.
    `;
    const inline_keyboard = [[{
        text: "💳 Donate with Paystack",
        url: DONATE_URL
    }]];
    await sendTelegramMessage(chatId, donateMessage.trim(), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
    });

  } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
    await sendTelegramMessage(chatId, "Please choose a format to download:", { reply_markup: { inline_keyboard: createFormatButtons(text) } });
  } else {
    await sendTelegramMessage(chatId, "Please send a valid YouTube link.");
  }
}

async function handleCallbackQuery(callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const [action, payload] = data.split("|");

  if (action === "cancel") {
      const controller = activeDownloads.get(payload);
      if (controller) {
          controller.abort();
          activeDownloads.delete(payload);
      }
      await editMessageText(chatId, message.message_id, "<i>❌ Download Canceled.</i>");
      return;
  }
  
  const videoUrl = payload;
  const format = action;
  
  await answerCallbackQuery(callbackQuery.id, `Processing ${format.toUpperCase()}...`);
  const statusMsg = await sendTelegramMessage(chatId, `<i>⏳ Processing request...</i>`);
  const downloadKey = `${chatId}:${statusMsg.result.message_id}`;
  const controller = new AbortController();
  activeDownloads.set(downloadKey, controller);

  const cancelBtn = { text: "❌ Cancel", callback_data: `cancel|${downloadKey}` };

  try {
    await editMessageText(chatId, statusMsg.result.message_id, `<i>🔎 Analyzing link...</i>`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
    const info = await getVideoInfo(videoUrl);
    const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
    const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;

    await editMessageText(chatId, statusMsg.result.message_id, `<i>💾 Checking file size...</i>`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
    const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
    const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
    const fileSizeMB = contentLength / (1024 * 1024);

    if (fileSizeMB > 0 && fileSizeMB < MAX_FILE_SIZE_MB) {
      await editMessageText(chatId, statusMsg.result.message_id, `<i>🚀 Downloading to our server...</i>`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
      const fileRes = await fetch(downloadUrl, { signal: controller.signal });
      const fileBlob = await fileRes.blob();
      
      await editMessageText(chatId, statusMsg.result.message_id, `<i>✅ Uploading to you...</i>`);
      const fileType = format.toLowerCase() === 'mp3' ? 'audio' : 'video';
      const fileName = `${safeTitle}.${fileType}`;
      await sendMedia(chatId, fileBlob, fileType, `📥 Adiza-YT Bot`, fileName, safeTitle);
      await deleteMessage(chatId, statusMsg.result.message_id);

    } else {
      const messageText = `⚠️ <b>File Too Large!</b>\nThe file is ${fileSizeMB > 0 ? fileSizeMB.toFixed(2) + 'MB' : 'too big'}. Please use the direct link.`;
      const inline_keyboard = [[{ text: `🔗 Download ${format.toUpperCase()} 🔮`, url: downloadUrl }]];
      await editMessageText(chatId, statusMsg.result.message_id, messageText, { reply_markup: { inline_keyboard } });
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error("Download handling error:", error);
      await editMessageText(chatId, statusMsg.result.message_id, "❌ Sorry, an error occurred.");
    }
  } finally {
      activeDownloads.delete(downloadKey);
  }
}

async function getVideoInfo(youtubeUrl) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${youtubeUrl}&format=json`);
        if (!response.ok) return { title: null };
        const data = await response.json();
        return { title: data.title };
    } catch (e) {
        console.error("oEmbed fetch failed:", e);
        return { title: null };
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

async function sendSticker(chatId, stickerFileId) {
    return await apiRequest('sendSticker', { chat_id: chatId, sticker: stickerFileId });
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

async function sendMedia(chatId, blob, type, caption, fileName, title) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append(type, blob, fileName);
    formData.append('caption', caption);
    let inline_keyboard = [[
        { text: "Share ↪️", switch_inline_query: "" },
        { text: "🔮 More Bots 🔮", url: CHANNEL_URL }
    ]];
    if (type === 'audio' && title) {
        const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(title)}`;
        inline_keyboard.unshift([{ text: "🎵 Find on Spotify", url: spotifyUrl }]);
    }
    formData.append('reply_markup', JSON.stringify({ inline_keyboard }));
    if (type === 'audio') {
        formData.append('title', title || 'Unknown Title');
        formData.append('performer', `Via @${BOT_USERNAME}`);
    }
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/send${type.charAt(0).toUpperCase() + type.slice(1)}`;
    await fetch(url, { method: 'POST', body: formData });
}

function createFormatButtons(videoUrl) {
    const formats = ['MP3', '144p', '240p', '360p', '480p', '720p', '1080p'];
    const formatMap = { 'mp3': '🎵', '144p': '📼', '240p': '⚡', '360p': '🔮', '480p': '📺', '720p': '🗳', '1080p': '💎' };
    let rows = [], currentRow = [];
    formats.forEach(f => {
        const quality = f.toLowerCase() === 'mp3' ? 'mp3' : f.toLowerCase().replace('p', '');
        const icon = formatMap[f.toLowerCase()] || '💾';
        currentRow.push({ text: `${icon} ${f.toUpperCase()}`, callback_data: `${quality}|${videoUrl}` });
        if (currentRow.length === 3) {
            rows.push(currentRow);
            currentRow = [];
        }
    });
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}

// --- Server Start ---
console.log("Starting final professional bot server (v11 - Donate Feature)...");
Deno.serve(handler);
