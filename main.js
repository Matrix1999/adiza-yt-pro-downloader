
// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb5JJ438kyyGlFHTyZ0n";
const BOT_USERNAME = "adiza_ytdownloader_bot";
const MAX_FILE_SIZE_MB = 49;
const DONATE_URL = "https://paystack.com/pay/adiza-bot-donate";

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
    "CAACAgIAAxkBAAE6q6Fou5MX6nv0HE5duKOzHhvyR08osQACRgADUomRI_j-5eQK1QodNgQ", "CAACAgIAAxkBAAE6q59ou5MNTS_iZ5hTleMdiDQbVuh4rQACSQADUomRI4zdJVjkz_fvNgQ",
    "CAACAgIAAxkBAAE6q51ou5L3EZV6j-3b2pPqjIEN4ewQgAAC1QUAAj-VzAr0FV2u85b8KDYE", "CAACAgUAAxkBAAE6q7dou5WIlhBfKD6h3wWmZpoePIGWSAACDBEAApkMcFRMS-HQnAqmzzYE",
    "CAACAgUAAxkBAAE6q7lou5WM-I1TWj6Z5u6iER70yqszCQACphgAAnLIyFeyFwmm5dR_8zYE", "CAACAgUAAxkBAAE6q7tou5WR18mZRfVWpSXXMevkTKoTKAAC7BAAAkSw2FQUETd0uSTUdTYE",
    "CAACAgUAAxkBAAE6q71ou5XOmUTrhmn8-jWpplgzJ-fxcwACdxEAAk7CIFXNdisJ2fejnTYE",
    "CAACAgUAAxkBAAE6q79ou5Xa16ci77HKeE53XaQ_C4wqKAACXRAAAtGVYVQB72w7kFjy1jYE", "CAACAgUAAxkBAAE6q8Fou5XlYVE8etdE36V1cvEWyhQM-gACLhEAAoaQCVeBaEKoltXVFzYE",
    "CAACAgUAAxkBAAE6q8Nou5X-WlD8j5XFxMCjfHcel3GNdQACRQADunh9JkKCie3gP8QLNgQ"
];

// --- State Management ---
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
    const userId = user.id;

    if (text === "/start") {
        if (WELCOME_STICKER_IDS.length > 0) {
            const stickerCount = (await kv.get(["global", "stickerCounter"])).value || 0;
            await sendSticker(chatId, WELCOME_STICKER_IDS[stickerCount % WELCOME_STICKER_IDS.length]);
            await kv.set(["global", "stickerCounter"], stickerCount + 1);
        }
        
        await delay(4000); // 4-second delay
        
        const userStatus = user.is_premium ? "⭐ Premium User" : "👤 Standard User";
        const welcomeMessage = `
👋 Hello, <b>${user.first_name}</b>!

<b>User ID:</b> <code>${user.id}</code>
<b>Status:</b> ${userStatus}

Welcome to Adiza YouTube Downloader! 🌹
Paste a YouTube link or use the buttons below to get started.
        `;
        const inline_keyboard = [
            [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
            [{ text: "👑 OWNER 👑", url: OWNER_URL }],
            [{ text: "💖 Donate 💖", callback_data: "donate_now" }, { text: "⚙️ Settings", callback_data: "settings_menu" }]
        ];
        await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
    
    } else if (text === "/settings") {
        await sendSettingsMessage(chatId);
    
    } else if (text === "/donate") {
        await sendDonationMessage(chatId);
    
    } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        if (userQuality) {
            await startDownload(chatId, userId, text, userQuality);
        } else {
            await sendTelegramMessage(chatId, "Please choose a format to download:", { reply_markup: { inline_keyboard: createFormatButtons(text) } });
        }
    } else {
        await sendTelegramMessage(chatId, "Please send a valid YouTube link.");
    }
}

async function handleCallbackQuery(callbackQuery) {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id;
    const [action, payload] = data.split("|");

    if (action === "cancel") {
        const controller = activeDownloads.get(payload);
        if (controller) {
            controller.abort();
            activeDownloads.delete(payload);
        }
        await editMessageText(chatId, message.message_id, "❌ Download Canceled.");
        return;
    }

    if (action === "donate_now") {
        await sendDonationMessage(chatId);
        await answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (action === "settings_menu") {
        await answerCallbackQuery(callbackQuery.id);
        await deleteMessage(chatId, message.message_id); // Delete the old message
        await sendSettingsMessage(chatId); // Send a new settings message
        return;
    }
    
    if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        const qualityKeyboard = createQualitySettingsButtons(userQuality);
        await editMessageText(chatId, message.message_id, "Please choose your preferred default download quality:", { reply_markup: { inline_keyboard: qualityKeyboard } });
        return;
    }

    if (action === "set_default") {
        if (payload === "remove") {
            await kv.delete(["users", userId, "quality"]);
            await answerCallbackQuery(callbackQuery.id, `✅ Your default quality has been removed.`);
        } else {
            await kv.set(["users", userId, "quality"], payload);
            await answerCallbackQuery(callbackQuery.id, `✅ Your default quality has been set to ${payload.toUpperCase()}.`);
        }
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        const qualityKeyboard = createQualitySettingsButtons(userQuality);
        await editMessageText(chatId, message.message_id, "Please choose your preferred default download quality:", { reply_markup: { inline_keyboard: qualityKeyboard } });
        return;
    }

    if (action === "user_stats") {
        const downloads = await kv.get(["users", userId, "downloads"]);
        const statsMessage = `📊 **Your Stats**\n\nTotal Downloads: *${downloads.value || 0}*`;
        const statsKeyboard = [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]];
        await editMessageText(chatId, message.message_id, statsMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: statsKeyboard } });
        return;
    }
    
    if (action === "back_to_settings") {
        await sendSettingsMessage(chatId, message.message_id, true);
        return;
    }

    if (action === "help_menu") {
        const helpMessage = "📖 **Help & FAQ**\n\nTo use this bot, simply send a valid YouTube link. If you have a default quality set, the download will begin automatically. Otherwise, you'll be prompted to choose a format.\n\n⚙️ Use the **/settings** command to set or remove your default download quality and to check your usage statistics.";
        const helpKeyboard = [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]];
        await editMessageText(chatId, message.message_id, helpMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: helpKeyboard } });
        return;
    }

    const [format, videoUrl] = data.split("|");
    await deleteMessage(chatId, message.message_id);
    await startDownload(chatId, userId, videoUrl, format);
}

// --- Main Download Logic ---
async function startDownload(chatId, userId, videoUrl, format) {
    const statusMsg = await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);
    const cancelBtn = { text: "❌ Cancel", callback_data: `cancel|${downloadKey}` };
    
    try {
        await editMessageText(chatId, statusMsg.result.message_id, `🔎 Analyzing link...`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
        
        await editMessageText(chatId, statusMsg.result.message_id, `💾 Checking file size...`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
        const fileSizeMB = contentLength / (1024 * 1024);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
             const messageText = `⚠️ <b>File Too Large!</b> (${fileSizeMB.toFixed(2)} MB)\nPlease use the direct link to download.`;
             await editMessageText(chatId, statusMsg.result.message_id, messageText, { reply_markup: { inline_keyboard: [[{ text: `🔗 Download ${format.toUpperCase()} 🔮`, url: downloadUrl }]] } });
             return; // Stop execution
        }

        await editMessageText(chatId, statusMsg.result.message_id, `🚀 Downloading to our server...`, { reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const fileRes = await fetch(downloadUrl, { signal: controller.signal });
        const fileBlob = await fileRes.blob();
        await editMessageText(chatId, statusMsg.result.message_id, `✅ Uploading to you...`);
        
        // **BUG FIX**: Use correct file type and extension for audio vs video
        const fileType = format.toLowerCase() === 'mp3' ? 'audio' : 'video';
        const fileExtension = format.toLowerCase() === 'mp3' ? 'mp3' : 'mp4';
        const fileName = `${safeTitle}.${fileExtension}`;
        
        await sendMedia(chatId, fileBlob, fileType, `📥 Adiza-YT Bot`, fileName, safeTitle);
        await deleteMessage(chatId, statusMsg.result.message_id);
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Download handling error:", error);
            await editMessageText(chatId, statusMsg.result.message_id, "❌ Sorry, an error occurred.");
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}

// --- Helper Functions ---
async function sendDonationMessage(chatId) {
    const donateMessage = `
💖 **Support Adiza Bot!**

Thank you for considering a donation! Your support helps cover server costs and allows me to keep adding new features.

Click the button below to make a secure donation via Paystack.
    `;
    const inline_keyboard = [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]];
    await sendTelegramMessage(chatId, donateMessage.trim(), { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ **User Settings**\n\nHere you can customize your experience and view your stats. Select an option below.";
    const inline_keyboard = [
        [{ text: "⚙️ Set Default Quality", callback_data: "settings_quality" }],
        [{ text: "📊 My Stats", callback_data: "user_stats" }],
        [{ text: "❓ Help & FAQ", callback_data: "help_menu" }]
    ];
    if (shouldEdit && messageIdToUpdate) {
        await editMessageText(chatId, messageIdToUpdate, settingsMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }});
    } else {
        await sendTelegramMessage(chatId, settingsMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }});
    }
}

function createQualitySettingsButtons(currentQuality) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatLabels = { 'mp3': 'MP3', '144': '144p', '240': '240p', '360': '360p', '480': '480p', '720': '720p', '1080': '1080p' };
    const formatIcons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    
    let buttons = formats.map(f => {
        const label = formatLabels[f];
        const icon = formatIcons[f];
        const text = currentQuality === f ? `✅ ${icon} ${label}` : `${icon} ${label}`;
        return { text, callback_data: `set_default|${f}` };
    });

    let rows = [];
    while (buttons.length > 0) {
        rows.push(buttons.splice(0, 3));
    }
    
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back to Settings", callback_data: "back_to_settings" }]);
    return rows;
}

async function getVideoInfo(youtubeUrl) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`);
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
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatMap = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let rows = [], currentRow = [];
    formats.forEach(f => {
        const quality = f.toLowerCase().replace('p', '');
        const icon = formatMap[f] || '💾';
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
console.log("Starting final professional bot server (v23 - MP3 Fix)...");
Deno.serve(handler);