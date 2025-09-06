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

// --- Direct MP3 API Config (Based on your new inspection) ---
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
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }
};

// --- External Libraries ---
import YouTube from "https://esm.sh/youtube-search-api@1.2.1";

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
];

// --- State Management ---
const activeDownloads = new Map();

// --- Main Request Handler ---
async function handler(req) {
    if (req.method !== "POST") return new Response("Not Allowed", { status: 405 });
    try {
        const update = await req.json();
        if (update.inline_query) await handleInlineQuery(update.inline_query);
        else if (update.callback_query) await handleCallbackQuery(update.callback_query);
        else if (update.message) await handleMessage(update.message);
        return new Response("ok");
    } catch (e) {
        console.error("Main handler error:", e);
        return new Response("Error processing update", { status: 500 });
    }
}

// --- Logic Handlers (handleMessage, handleCallbackQuery, etc.) ---
async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const user = message.from;
    const userId = user.id;

    if (text === "/start") {
        await kv.set(["users", userId], user);
        const stickerCount = (await kv.get(["global", "stickerCounter"])).value || 0;
        await sendSticker(chatId, WELCOME_STICKER_IDS[stickerCount % WELCOME_STICKER_IDS.length]);
        await kv.set(["global", "stickerCounter"], stickerCount + 1);
        await delay(1000);

        const welcomeMessage = `👋 Hello, <b>${user.first_name}</b>!\n\nWelcome to Adiza YouTube Downloader! 🌹\nPaste a YouTube link or search inline to get started.`;
        const inline_keyboard = [
            [{ text: "🔮 Channel", url: CHANNEL_URL }, { text: "👑 Owner", url: OWNER_URL }],
            [{ text: "💖 Donate", callback_data: "donate_now" }, { text: "⚙️ Settings", callback_data: "settings_menu" }]
        ];
        await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage, { reply_markup: { inline_keyboard } });
    } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        if (userQuality) {
            await startDownload(chatId, userId, text, userQuality);
        } else {
            await sendTelegramMessage(chatId, "Please choose a format:", { reply_markup: { inline_keyboard: createFormatButtons(text) } });
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
            await editMessageText("✅ Request accepted! Sending the file to our private chat.", { inline_message_id });
            await startDownload(userId, userId, videoUrl, format, true, inline_message_id);
        } else if (action === "formats") {
             const videoId = payload;
             await answerCallbackQuery(callbackQuery.id);
             await editMessageText("Choose a format:", { inline_message_id, reply_markup: { inline_keyboard: createInlineFormatButtons(videoId) } });
        }
        return;
    }
    
    if (message) {
        const privateChatId = message.chat.id;
        if (action.startsWith("settings") || action.startsWith("back_to_")) {
             await handleSettingsCallbacks(action, payload, privateChatId, message.message_id, userId);
             await answerCallbackQuery(callbackQuery.id);
             return;
        }
        if (action === "donate_now") {
            await sendDonationMessage(privateChatId);
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
        input_message_content: { message_text: `🎨 Selected: ${video.title}` },
        reply_markup: { inline_keyboard: [[{ text: "👉 Choose Format", callback_data: `formats|${video.id}` }]] }
    }));
    await apiRequest('answerInlineQuery', { inline_query_id: inlineQuery.id, results: JSON.stringify(results), cache_time: 300 });
}

// --- Main Download Logic with Hybrid Approach ---
async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = isInline ? inlineMessageId : `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);

    try {
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        
        let fileBlob;
        
        // --- HYBRID LOGIC ---
        if (format === 'mp3') {
            // Use the direct savetube API for MP3
            if (!isInline) await editMessageText("🎧 Fetching MP3 via direct API...", { chat_id: chatId, message_id: statusMsg.result.message_id });
            fileBlob = await getDirectMp3(videoUrl, controller.signal);
        } else {
            // Use your worker for all videos (MP4)
            if (!isInline) await editMessageText(`📹 Fetching ${format}p via your worker...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
            const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
            const fileRes = await fetch(downloadUrl, { signal: controller.signal });
            if (!fileRes.ok) throw new Error(`Video worker failed with status: ${fileRes.status}`);
            fileBlob = await fileRes.blob();
        }

        if (isInline) {
            await sendMedia(chatId, fileBlob, format === 'mp3' ? 'audio' : 'video', `📥 @${BOT_USERNAME}`, safeTitle, info.title);
        } else {
            await editMessageText(`✅ Uploading to you...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
            await sendMedia(chatId, fileBlob, format === 'mp3' ? 'audio' : 'video', `📥 @${BOT_USERNAME}`, safeTitle, info.title);
            await deleteMessage(chatId, statusMsg.result.message_id);
        }

        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        console.error("Download handling error:", error);
        const errorMsg = `❌ Download failed: ${error.message}`;
        if (isInline) {
            await sendTelegramMessage(chatId, errorMsg);
        } else if (statusMsg) {
            await editMessageText(errorMsg, { chat_id: chatId, message_id: statusMsg.result.message_id });
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}

// --- NEW: Direct MP3 Fetcher (Based on your screenshots) ---
async function getDirectMp3(youtubeUrl, signal) {
    try {
        // Step 1: Get the CDN server hostname
        const cdnResponse = await fetch(`${DIRECT_API.base}${DIRECT_API.cdn}`, { headers: DIRECT_API.headers, signal });
        if (!cdnResponse.ok) throw new Error(`CDN request failed: ${cdnResponse.status}`);
        const { cdn } = await cdnResponse.json();
        const cdnHost = `https://${cdn}`; // This will be like "https://cdn402.savetube.su"

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

        // Step 3: Get download URL
        const downloadApiResponse = await fetch(`${cdnHost}${DIRECT_API.download}`, {
            method: 'POST',
            headers: DIRECT_API.headers,
            body: JSON.stringify({ id: youtubeId, downloadType: 'audio', quality: '128', key: decryptedInfo.key }),
            signal
        });
        if (!downloadApiResponse.ok) throw new Error(`Download API call failed: ${downloadApiResponse.status}`);
        const downloadData = await downloadApiResponse.json();

        // Step 4: Fetch the actual MP3 file
        const fileResponse = await fetch(downloadData.data.downloadUrl, { 
            headers: { 'Referer': 'https://yt.savetube.me/' }, 
            signal 
        });
        if (!fileResponse.ok) throw new Error(`Final file fetch failed: ${fileResponse.status}`);
        
        return fileResponse.blob();
    } catch (error) {
        console.error("Direct MP3 fetch error:", error);
        throw error; // Re-throw the error to be caught by startDownload
    }
}

// --- Helper Functions (getYoutubeId, decrypt, etc.) ---
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
        if (!response.ok) return { title: "video" };
        const data = await response.json();
        return { title: data.title };
    } catch (e) {
        console.error("oEmbed fetch failed:", e);
        return { title: "video" };
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Telegram API Helpers ---
async function sendMedia(chatId, blob, type, caption, safeFileName, title) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);

    let endpoint, file;
    
    if (type === 'audio') {
        endpoint = 'sendAudio';
        file = new File([blob], `${safeFileName}.mp3`, { type: "audio/mpeg" });
        formData.append('audio', file);
        formData.append('title', title || 'Unknown Title');
        formData.append('performer', `Via @${BOT_USERNAME}`);
    } else {
        endpoint = 'sendVideo';
        file = new File([blob], `${safeFileName}.mp4`, { type: "video/mp4" });
        formData.append('video', file);
    }
    
    const inline_keyboard = [[{ text: "Share ↪️", switch_inline_query: "" }, { text: "🔮 More Bots", url: CHANNEL_URL }]];
    if (type === 'audio' && title) {
        inline_keyboard.unshift([{ text: "🎵 Find on Spotify", url: `https://open.spotify.com/search/${encodeURIComponent(title)}` }]);
    }
    formData.append('reply_markup', JSON.stringify({ inline_keyboard }));
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, { method: 'POST', body: formData });
}

async function apiRequest(method, params = {}) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
    return res.json();
}

async function sendTelegramMessage(chatId, text, extra = {}) { return apiRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }); }
async function sendPhoto(chatId, photo, caption, extra = {}) { return apiRequest('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra }); }
async function sendSticker(chatId, sticker) { return apiRequest('sendSticker', { chat_id: chatId, sticker }); }
async function editMessageText(text, extra = {}) { return apiRequest('editMessageText', { text, parse_mode: 'HTML', ...extra }); }
async function deleteMessage(chatId, messageId) { return apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId }); }
async function answerCallbackQuery(id, text) { return apiRequest('answerCallbackQuery', { callback_query_id: id, text }); }

// --- UI and Settings Functions ---
async function handleSettingsCallbacks(action, payload, chatId, messageId, userId) {
    if (action === "settings_menu") { await deleteMessage(chatId, messageId); await sendSettingsMessage(chatId); }
    // Add other settings logic here if needed
}
async function sendSettingsMessage(chatId) { /* Add settings UI here */ }
async function sendDonationMessage(chatId) { /* Add donation UI here */ }
function createFormatButtons(videoUrl) {
    const formats = ['mp3', '360', '720', '1080'];
    let rows = [], currentRow = [];
    formats.forEach(f => {
        currentRow.push({ text: `📥 ${f.toUpperCase()}`, callback_data: `${f}|${videoUrl}` });
        if (currentRow.length === 2) { rows.push(currentRow); currentRow = []; }
    });
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}
function createInlineFormatButtons(videoId) {
    const formats = ['mp3', '360', '720', '1080'];
    const buttons = formats.map(f => ({ text: `📥 ${f.toUpperCase()}`, callback_data: `download|${f}:${videoId}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 2));
    return rows;
}

// --- Server Start ---
console.log("Starting Hybrid Downloader Bot Server...");
Deno.serve(handler);
