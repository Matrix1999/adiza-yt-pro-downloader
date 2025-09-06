// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev";
const START_PHOTO_URL = "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg";
const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb5JJ438kyyGlFHTyZ0n";
const BOT_USERNAME = "adiza_ytdownloader_bot";
const MAX_FILE_SIZE_MB = 49;
const DONATE_URL = "https://paystack.com/pay/adiza-bot-donate";
const ADMIN_ID = 853645999;

// --- Direct API Config (from your inspection) ---
const DIRECT_API = {
    base: "https://media.savetube.me/api",
    cdn: "/random-cdn",
    info: "/v2/info",
    download: "/download",
    headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'referer': 'https://yt.savetube.me/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

// --- External Libraries ---
import YouTube from "https://esm.sh/youtube-search-api@1.2.1";

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", 
    "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE"
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        await kv.set(["users", userId], user);
        if (WELCOME_STICKER_IDS.length > 0) {
            const stickerCount = (await kv.get(["global", "stickerCounter"])).value || 0;
            await sendSticker(chatId, WELCOME_STICKER_IDS[stickerCount % WELCOME_STICKER_IDS.length]);
            await kv.set(["global", "stickerCounter"], stickerCount + 1);
        }
        await delay(4000);
        const userStatus = user.is_premium ? "⭐ Premium User" : "👤 Standard User";
        const welcomeMessage = `👋 Hello, <b>${user.first_name}</b>!\n\n<b>User ID:</b> <code>${user.id}</code>\n<b>Status:</b> ${userStatus}\n\nWelcome to Adiza YouTube Downloader! 🌹\nPaste a YouTube link or use the buttons below to get started.`;
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

    if (inline_message_id) {
        if (action === "download") {
            await answerCallbackQuery(callbackQuery.id);
            const [format, videoId] = payload.split(":");
            const videoUrl = `https://youtu.be/${videoId}`;
            await editMessageText("⏳ Processing... Please wait.", { inline_message_id });
            await startDownload(userId, userId, videoUrl, format, true, inline_message_id);
        } else if (action === "formats") {
             const videoId = payload;
             await answerCallbackQuery(callbackQuery.id);
             const formatButtons = createInlineFormatButtons(videoId);
             await editMessageText("Choose a format to download:", {inline_message_id, reply_markup: {inline_keyboard: formatButtons}});
        }
        return;
    }
    
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
        input_message_content: { message_text: `🎨𝗬𝗼𝘂 𝘀𝗲𝗹𝗲𝗰𝘁𝗲𝗱: ${video.title}` },
        reply_markup: { inline_keyboard: [[{ text: "👉 Choose Format", callback_data: `formats|${video.id}` }]] }
    }));
    await apiRequest('answerInlineQuery', { inline_query_id: inlineQuery.id, results: JSON.stringify(results), cache_time: 300 });
}

// --- Main Download Logic ---
async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    const statusMsg = !isInline ? await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`) : null;
    const downloadKey = isInline ? inlineMessageId : `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);

    try {
        if (!isInline) await editMessageText(`🔎 Analyzing link...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        
        let fileBlob;
        if (format === 'mp3') {
            // Use the direct savetube API for MP3 (based on your inspection)
            if (isInline) await editMessageText("✅ Request accepted! Fetching MP3 directly...", { inline_message_id: inlineMessageId });
            fileBlob = await getDirectMp3(videoUrl, controller.signal);
        } else {
            // Use your worker for videos
            if (isInline) await editMessageText("✅ Request accepted! I'm sending the file to you in our private chat.", { inline_message_id: inlineMessageId });
            const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
            const fileRes = await fetch(downloadUrl, { signal: controller.signal });
            if (!fileRes.ok) throw new Error(`Video download failed with status: ${fileRes.status}`);
            fileBlob = await fileRes.blob();
        }

        if (isInline) {
            await sendMedia(chatId, fileBlob, format === 'mp3' ? 'audio' : 'video', `📥 Adiza-YT Bot`, `${safeTitle}.${format === 'mp3' ? 'mp3' : 'mp4'}`, info.title);
        } else {
            await editMessageText(`✅ Uploading to you...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
            await sendMedia(chatId, fileBlob, format === 'mp3' ? 'audio' : 'video', `📥 Adiza-YT Bot`, `${safeTitle}.${format === 'mp3' ? 'mp3' : 'mp4'}`, info.title);
            await deleteMessage(chatId, statusMsg.result.message_id);
        }

        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Download handling error:", error);
            const errorMsg = "❌ Sorry, an error occurred during download.";
            if (isInline) {
                await editMessageText(errorMsg, { inline_message_id: inlineMessageId });
            } else {
                await editMessageText(errorMsg, { chat_id: chatId, message_id: statusMsg.result.message_id });
            }
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}

// --- NEW: Direct MP3 Fetcher (Based on your inspection) ---
async function getDirectMp3(youtubeUrl, signal) {
    try {
        // Step 1: Get the CDN server (as seen in your first request)
        const cdnResponse = await fetch(`${DIRECT_API.base}${DIRECT_API.cdn}`, { 
            headers: DIRECT_API.headers, 
            signal 
        });
        if (!cdnResponse.ok) throw new Error(`CDN request failed: ${cdnResponse.status}`);
        const { cdn } = await cdnResponse.json();
        const cdnHost = `https://${cdn}`;

        // Step 2: Get video info and encryption key
        const youtubeId = getYoutubeId(youtubeUrl);
        if (!youtubeId) throw new Error("Invalid YouTube URL");
        
        const infoResponse = await fetch(`${cdnHost}${DIRECT_API.info}`, {
            method: 'POST',
            headers: DIRECT_API.headers,
            body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${youtubeId}` }),
            signal
        });
        if (!infoResponse.ok) throw new Error(`Info request failed: ${infoResponse.status}`);
        const infoData = await infoResponse.json();
        const decryptedInfo = await decryptApiData(infoData.data);

        // Step 3: Get download URL (as seen in your POST request)
        const downloadApiResponse = await fetch(`${cdnHost}${DIRECT_API.download}`, {
            method: 'POST',
            headers: DIRECT_API.headers,
            body: JSON.stringify({ 
                id: youtubeId, 
                downloadType: 'audio', 
                quality: '128', 
                key: decryptedInfo.key 
            }),
            signal
        });
        if (!downloadApiResponse.ok) throw new Error(`Download API failed: ${downloadApiResponse.status}`);
        const downloadData = await downloadApiResponse.json();

        // Step 4: Fetch the actual MP3 file
        const fileResponse = await fetch(downloadData.data.downloadUrl, { 
            headers: { 'Referer': 'https://yt.savetube.me/' }, 
            signal 
        });
        if (!fileResponse.ok) throw new Error(`File fetch failed: ${fileResponse.status}`);
        
        return fileResponse.blob();
    } catch (error) {
        console.error("Direct MP3 fetch error:", error);
        throw error;
    }
}

// --- Helper Functions ---
function getYoutubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|)([\w-]{11})/,
        /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

async function decryptApiData(encryptedBase64) {
    const key = hexToUint8Array('C5D58EF67A7584E4A29F6C35BBC4EB12');
    const data = atob(encryptedBase64);
    const iv = new Uint8Array(data.slice(0, 16).split('').map(c => c.charCodeAt(0)));
    const content = new Uint8Array(data.slice(16).split('').map(c => c.charCodeAt(0)));
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, content);
    return JSON.parse(new TextDecoder().decode(decrypted));
}

function hexToUint8Array(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
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

async function searchYoutube(query) {
    try {
        const response = await YouTube.GetListByKeyword(query, false, 15, [{type: 'video'}]);
        return response.items || [];
    } catch (error) {
        console.error("YouTube search error:", error);
        return [];
    }
}

// --- Telegram API Helpers ---
async function sendMedia(chatId, blob, type, caption, fileName, title) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);
    
    let endpoint = '';
    if (type === 'audio') {
        const audioFile = new File([blob], fileName, { type: "audio/mpeg" });
        formData.append('audio', audioFile);
        formData.append('title', title || 'Unknown Title');
        formData.append('performer', `Via @${BOT_USERNAME}`);
        endpoint = 'sendAudio';
    } else {
        const videoFile = new File([blob], fileName, { type: "video/mp4" });
        formData.append('video', videoFile);
        endpoint = 'sendVideo';
    }
    
    let inline_keyboard = [[{ text: "Share ↪️", switch_inline_query: "" }, { text: "🔮 More Bots 🔮", url: CHANNEL_URL }]];
    if (type === 'audio' && title) {
        inline_keyboard.unshift([{ text: "🎵 Find on Spotify", url: `https://open.spotify.com/search/${encodeURIComponent(title)}` }]);
    }
    formData.append('reply_markup', JSON.stringify({ inline_keyboard }));
    
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`;
    await fetch(url, { method: 'POST', body: formData });
}

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
    return await apiRequest('editMessageText', { text, parse_mode: 'HTML', ...extraParams });
}

async function deleteMessage(chatId, messageId) {
    return await apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function answerCallbackQuery(callbackQueryId, text) {
    return await apiRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

// --- Other Helper Functions ---
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

function createInlineFormatButtons(videoId) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const formatLabels = { 'mp3': 'MP3', '144': '144p', '240': '240p', '360': '360p', '480': '480p', '720': '720p', '1080': '1080p' };
    const formatIcons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => ({ text: `${formatIcons[f]} ${formatLabels[f]}`, callback_data: `download|${f}:${videoId}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    return rows;
}

async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 **Support Adiza Bot!**\n\nYour support helps cover server costs and allows me to keep adding new features. Click the button below to make a secure donation.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function handleBroadcast(message) {
    if (!message.reply_to_message) {
        await sendTelegramMessage(message.chat.id, "⚠️ Please reply to the message you want to broadcast.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) users.push(entry.key[1]);
    await sendTelegramMessage(message.chat.id, `🚀 Starting broadcast to ${users.length} users.`);
    let successCount = 0;
    for (const userId of users) {
        try {
            await apiRequest('copyMessage', { chat_id: userId, from_chat_id: message.chat.id, message_id: message.reply_to_message.message_id });
            successCount++;
        } catch (e) { console.error(`Failed to broadcast to user ${userId}:`, e.message); }
        await delay(100); 
    }
    await sendTelegramMessage(message.chat.id, `✅ Broadcast complete! Sent to ${successCount} of ${users.length} users.`);
}

async function handleSettingsCallbacks(action, payload, chatId, messageId, userId) {
    if (action === "settings_menu") {
        await deleteMessage(chatId, messageId); 
        await sendSettingsMessage(chatId);
    } else if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Please choose your preferred default download quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(userQuality) } });
    } else if (action === "set_default") {
        payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
        const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Please choose your preferred default download quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(newUserQuality) } });
    } else if (action === "user_stats") {
        const downloads = (await kv.get(["users", userId, "downloads"])).value || 0;
        await editMessageText(`📊 **Your Stats**\n\nTotal Downloads: *${downloads}*`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    } else if (action === "back_to_settings") {
        await sendSettingsMessage(chatId, messageId, true);
    } else if (action === "help_menu") {
        const helpMessage = `📖 <b>Help & FAQ</b>\n\n1️⃣ <b>Direct Chat:</b> Send a YouTube link. If you have a default quality set, download begins instantly.\n\n2️⃣ <b>Inline Mode:</b> Type <code>@${BOT_USERNAME}</code> & a search term in any chat.`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ **User Settings**\n\nCustomize your experience and view your stats.";
    const inline_keyboard = [
        [{ text: "⚙️ Set Default Quality", callback_data: "settings_quality" }],
        [{ text: "📊 My Stats", callback_data: "user_stats" }],
        [{ text: "❓ Help & FAQ", callback_data: "help_menu" }]
    ];
    const params = { parse_mode: 'Markdown', reply_markup: { inline_keyboard }};
    if (shouldEdit && messageIdToUpdate) {
        await editMessageText(settingsMessage, { chat_id: chatId, message_id: messageIdToUpdate, ...params });
    } else {
        await sendTelegramMessage(chatId, settingsMessage, params);
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

console.log("Starting bot server with direct MP3 API (based on network inspection)...");
Deno.serve(handler);
