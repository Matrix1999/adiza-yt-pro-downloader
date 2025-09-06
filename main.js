// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb5JJ438kyyGlFHTyZ0n";
const BOT_USERNAME = "adiza_ytdownloader_bot";
const MAX_FILE_SIZE_MB = 49;
const DONATE_URL = "https://paystack.com/pay/adiza-bot-donate";
const ADMIN_ID = 853645999; // Your Telegram User ID for Admin commands

// --- External Libraries ---
import YouTube from "https://esm.sh/youtube-search-api@1.2.1";

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
    "CAACAgIAAxkBAAE6q6Fou5MX6nv0HE5duKOzHhvyR08osQACRgADUomRI_j-5eQK1QodNgQ", "CAACAgIAAxkBAAE6q59ou5MNTS_iZ5hTleMdiDQbVuh4rQACSQADUomRI4zdJVjkz_fvNgQ",
    "CAACAgIAAxkBAAE6q51ou5L3EZV6j-3b2pPqjIEN4ewQgAAC1QUAAj-VzAr0FV2u85b8KDYE"
];

// --- State Management ---
const activeDownloads = new Map();

// --- Main Request Handler ---
async function handler(req) {
    if (req.method !== "POST") return new Response("Not Allowed", { status: 405 });
    if (!BOT_TOKEN) return new Response("Internal Error: BOT_TOKEN not set", { status: 500 });
    try {
        const update = await req.json();
        if (update.inline_query) {
            await handleInlineQuery(update.inline_query);
        } else if (update.callback_query) {
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

    if (text === "/broadcast" && userId === ADMIN_ID) {
        await handleBroadcast(message);
        return;
    }

    if (text === "/start") {
        await kv.set(["users", userId], user); // Track user
        if (WELCOME_STICKER_IDS.length > 0) {
            const stickerCount = (await kv.get(["global", "stickerCounter"])).value || 0;
            await sendSticker(chatId, WELCOME_STICKER_IDS[stickerCount % WELCOME_STICKER_IDS.length]);
            await kv.set(["global", "stickerCounter"], stickerCount + 1);
        }
        await delay(4000);
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
    const { data, message, from, inline_message_id } = callbackQuery;
    const userId = from.id;
    const [action, ...payloadParts] = data.split("|");
    const payload = payloadParts.join("|");

    // --- Logic for Inline Mode Callbacks ---
    if (inline_message_id) {
        if (action === "download") {
            await answerCallbackQuery(callbackQuery.id);
            const [format, videoId] = payload.split(":");
            const videoUrl = `https://youtu.be/${videoId}`;
            
            await editMessageText("✅ Request accepted! Sending file to your DMs.", { inline_message_id, reply_markup: {inline_keyboard: []} });
            await startDownload(userId, userId, videoUrl, format, true); // Pass inline flag
        } else if (action === "formats") {
             const videoId = payload;
             await answerCallbackQuery(callbackQuery.id);
             const formatButtons = createInlineFormatButtons(videoId);
             await editMessageText("Choose a format to download:", {inline_message_id, reply_markup: {inline_keyboard: formatButtons}});
        }
        return;
    }
    
    // --- Logic for Private Chat Callbacks ---
    if(message) {
        const privateChatId = message.chat.id;
        if (action === "cancel") {
            const controller = activeDownloads.get(payload);
            if (controller) controller.abort();
            await editMessageText("❌ Download Canceled.", { chat_id: privateChatId, message_id: message.message_id });
            return;
        }
        if (action === "donate_now") {
            await sendDonationMessage(privateChatId);
            await answerCallbackQuery(callbackQuery.id);
            return;
        }
        if (action.startsWith("settings") || action.startsWith("back_to_") || action.startsWith("user_") || action.startsWith("set_default") || action.startsWith("help_")) {
            await handleSettingsCallbacks(action, payload, privateChatId, message.message_id, userId);
            await answerCallbackQuery(callbackQuery.id);
            return;
        }
        const [format, videoUrl] = data.split("|");
        await deleteMessage(privateChatId, message.message_id);
        await startDownload(privateChatId, userId, videoUrl, format);
    }
}

// --- Inline Query Handler ---
async function handleInlineQuery(inlineQuery) {
    const query = inlineQuery.query.trim();
    if (!query) return;

    const searchResults = await searchYoutube(query);
    const results = searchResults.map(video => ({
        type: 'article',
        id: video.id,
        title: video.title,
        description: `Duration: ${video.length.simpleText}`,
        thumb_url: video.thumbnail.url,
        input_message_content: { message_text: `🎨𝗬𝗼𝘂 𝘀𝗲𝗹𝗲𝗰𝘁𝗲𝗱: ${video.title}\n\nPress the button below to choose a download format.` },
        reply_markup: {
            inline_keyboard: [[{ text: "👉 Choose Format", callback_data: `formats|${video.id}` }]]
        }
    }));

    await apiRequest('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: JSON.stringify(results),
        cache_time: 300 
    });
}

// --- Broadcast Handler ---
async function handleBroadcast(message) {
    if (!message.reply_to_message) {
        await sendTelegramMessage(message.chat.id, "⚠️ **Broadcast Error**\nPlease reply to the message to broadcast.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) users.push(entry.key[1]);
    await sendTelegramMessage(message.chat.id, `🚀 **Starting Broadcast...**\nSending to ${users.length} users.`);
    let successCount = 0;
    for (const userId of users) {
        try {
            await apiRequest('copyMessage', { chat_id: userId, from_chat_id: message.chat.id, message_id: message.reply_to_message.message_id });
            successCount++;
        } catch (e) { console.error(`Failed to broadcast to user ${userId}:`, e.message); }
        await delay(100); 
    }
    await sendTelegramMessage(message.chat.id, `✅ **Broadcast Complete!**\nSent to ${successCount} of ${users.length} users.`);
}

// --- YouTube Search for Inline Mode ---
async function searchYoutube(query) {
    try {
        const response = await YouTube.GetListByKeyword(query, false, 15, [{type: 'video'}]);
        return response.items || [];
    } catch (error) {
        console.error("YouTube search error:", error);
        return [];
    }
}

// --- Main Download Logic ---
async function startDownload(chatId, userId, videoUrl, format, isInline = false) {
    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = isInline ? `${chatId}:${Date.now()}` : `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);
    const cancelBtn = { text: "❌ Cancel", callback_data: `cancel|${downloadKey}` };
    const editTarget = isInline ? {} : { chat_id: chatId, message_id: statusMsg.result.message_id };
    
    try {
        if (!isInline) await editMessageText(`🔎 Analyzing link...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
        
        // This HEAD check is good practice, we'll leave it.
        if (!isInline) await editMessageText(`💾 Checking file size...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        if (!headRes.ok) {
            throw new Error(`The download server check failed with status: ${headRes.status}.`);
        }
        const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
        const fileSizeMB = contentLength / (1024 * 1024);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
             const largeFileMessage = `⚠️ <b>File Is Too Large!</b> (${fileSizeMB.toFixed(2)} MB)\nPlease use the direct link to download.`;
             if (isInline) await sendTelegramMessage(chatId, largeFileMessage, { reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } });
             else await editMessageText(largeFileMessage, { ...editTarget, reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } });
             return; 
        }

        if (!isInline) await editMessageText(`🚀 Downloading file...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        
        const fileRes = await fetch(downloadUrl, { signal: controller.signal });

        // --- THE ONLY FIX NEEDED IS HERE ---
        // This checks if the final download request failed.
        if (!fileRes.ok) {
            const errorBody = await fileRes.text();
            console.error("Worker failed to send file:", errorBody);
            throw new Error(`Download worker responded with error status: ${fileRes.status}`);
        }
        // --- END OF FIX ---

        const fileBlob = await fileRes.blob();
        if (!isInline) await editMessageText(`✅ Uploading to you...`, editTarget);
        
        const fileType = format.toLowerCase() === 'mp3' ? 'audio' : 'video';
        const fileExtension = fileType === 'audio' ? 'mp3' : 'mp4';
        const fileName = `${safeTitle}.${fileExtension}`;
        
        await sendMedia(chatId, fileBlob, fileType, `📥 Adiza-YT Bot`, fileName, info.title);
        if (!isInline) await deleteMessage(chatId, statusMsg.result.message_id);
        
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Download handling error:", error);
            const errorMessage = `❌ Sorry, an error occurred.\n\n<i>${error.message}</i>`;
            if (isInline) await sendTelegramMessage(chatId, errorMessage);
            else if (statusMsg) await editMessageText(errorMessage, { chat_id: chatId, message_id: statusMsg.result.message_id });
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}

// --- Helper Functions ---
async function handleSettingsCallbacks(action, payload, chatId, messageId, userId) {
    if (action === "settings_menu") { await deleteMessage(chatId, messageId); await sendSettingsMessage(chatId); }
    else if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Please choose your preferred default download quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(userQuality) } });
    } else if (action === "set_default") {
        payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
        await answerCallbackQuery(callbackQuery.id, `✅ Default quality ${payload === "remove" ? "removed" : `set to ${payload.toUpperCase()}`}.`);
        const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Please choose your preferred default download quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(newUserQuality) } });
    } else if (action === "user_stats") {
        const downloads = (await kv.get(["users", userId, "downloads"])).value || 0;
        await editMessageText(`📊 **Your Stats**\n\nTotal Downloads: *${downloads}*`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    } else if (action === "back_to_settings") { await sendSettingsMessage(chatId, messageId, true); }
    else if (action === "help_menu") {
        const helpMessage = `📖 <b>Help & FAQ</b>\n\n...`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
}

async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 **Support Adiza Bot!**\n\nYour support helps cover server costs and allows me to keep adding new features.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ **User Settings**\n\nHere you can customize your experience and view your stats.";
    const inline_keyboard = [
        [{ text: "⚙️ Set Default Quality", callback_data: "settings_quality" }],
        [{ text: "📊 My Stats", callback_data: "user_stats" }],
        [{ text: "❓ Help & FAQ", callback_data: "help_menu" }]
    ];
    if (shouldEdit && messageIdToUpdate) {
        await editMessageText(settingsMessage, { chat_id: chatId, message_id: messageIdToUpdate, parse_mode: 'Markdown', reply_markup: { inline_keyboard }});
    } else {
        await sendTelegramMessage(chatId, settingsMessage, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }});
    }
}

function createQualitySettingsButtons(currentQuality) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatLabels = { 'mp3': 'MP3', '144': '144p', '240': '240p', '360': '360p', '480': '480p', '720': '720p', '1080': '1080p' };
    const formatIcons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => ({ text: `${currentQuality === f ? "✅ " : ""}${formatIcons[f]} ${formatLabels[f]}`, callback_data: `set_default|${f}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back to Settings", callback_data: "back_to_settings" }]);
    return rows;
}

function createInlineFormatButtons(videoId) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatLabels = { 'mp3': 'MP3', '144': '144p', '240': '240p', '360': '360p', '480': '480p', '720': '720p', '1080': '1080p' };
    const formatIcons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => ({ text: `${formatIcons[f]} ${formatLabels[f]}`, callback_data: `download|${f}:${videoId}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
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

async function editMessageText(text, extraParams = {}) {
  const params = { text, parse_mode: 'HTML', ...extraParams };
  return await apiRequest('editMessageText', params);
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
    formData.append('caption', caption);
    
    let endpoint = type === 'audio' ? 'sendAudio' : 'sendVideo';
    const file = new File([blob], fileName, { type: type === 'audio' ? 'audio/mpeg' : 'video/mp4' });
    formData.append(type, file);

    if (type === 'audio') {
        formData.append('title', title || 'Unknown Title');
        formData.append('performer', `Via @${BOT_USERNAME}`);
    }
    
    let inline_keyboard = [[{ text: "Share ↪️", switch_inline_query: "" }, { text: "🔮 More Bots 🔮", url: CHANNEL_URL }]];
    if (type === 'audio' && title) {
        const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(title)}`;
        inline_keyboard.unshift([{ text: "🎵 Find on Spotify", url: spotifyUrl }]);
    }
    formData.append('reply_markup', JSON.stringify({ inline_keyboard }));
    
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`;
    await fetch(url, { method: 'POST', body: formData });
}

function createFormatButtons(videoUrl) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatMap = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let rows = [], currentRow = [];
    formats.forEach(f => {
        const quality = f.toLowerCase().replace('p', '');
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
console.log("Starting Adiza Downloader Bot (v38 - Final with Error Check)...");
Deno.serve(handler);
