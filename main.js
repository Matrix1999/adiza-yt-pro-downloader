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
            
            await editMessageText("⏳ Processing... Please wait.", { inline_message_id });

            const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
            const headRes = await fetch(downloadUrl, { method: 'HEAD' });
            const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
            const fileSizeMB = contentLength / (1024 * 1024);

            if (fileSizeMB > MAX_FILE_SIZE_MB) {
                const messageText = `⚠️ <b>File Is Too Large!</b> (${fileSizeMB.toFixed(2)} MB)`;
                await editMessageText(messageText, { 
                    inline_message_id, 
                    reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } 
                });
            } else {
                await editMessageText("✅ Request accepted! I'm sending the file to you in our private chat.", { inline_message_id, reply_markup: {inline_keyboard: []} });
                await startDownload(userId, userId, videoUrl, format);
            }
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
        if (action === "settings_menu") {
            await answerCallbackQuery(callbackQuery.id);
            await deleteMessage(privateChatId, message.message_id); 
            await sendSettingsMessage(privateChatId);
            return;
        }
        if (action === "settings_quality") {
            const userQuality = (await kv.get(["users", userId, "quality"])).value;
            await editMessageText("Please choose your preferred default download quality:", { chat_id: privateChatId, message_id: message.message_id, reply_markup: { inline_keyboard: createQualitySettingsButtons(userQuality) } });
            return;
        }
        if (action === "set_default") {
            payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
            await answerCallbackQuery(callbackQuery.id, `✅ Default quality ${payload === "remove" ? "removed" : `set to ${payload.toUpperCase()}`}.`);
            const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
            await editMessageText("Please choose your preferred default download quality:", { chat_id: privateChatId, message_id: message.message_id, reply_markup: { inline_keyboard: createQualitySettingsButtons(newUserQuality) } });
            return;
        }
        if (action === "user_stats") {
            const downloads = (await kv.get(["users", userId, "downloads"])).value || 0;
            await editMessageText(`📊 **Your Stats**\n\nTotal Downloads: *${downloads}*`, { chat_id: privateChatId, message_id: message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
            return;
        }
        if (action === "back_to_settings") {
            await sendSettingsMessage(privateChatId, message.message_id, true);
            return;
        }
        if (action === "help_menu") {
            const helpMessage = `📖 <b>Help & FAQ</b>\n\n<b>Two Ways to Use This Bot:</b>\n\n1️⃣ <b>Direct Chat (For Precise Links)</b>\nSend a valid YouTube link directly to me. If you have a default quality set, your download will begin instantly. Otherwise, you'll be prompted to choose a format.\n\n2️⃣ <b>Inline Mode (For Quick Searches)</b>\nIn any chat, type <code>@${BOT_USERNAME}</code> followed by a search term (e.g., <i>new amapiano mix</i>). Select a video from the results to download it right there!\n\n⚙️ Use the <b>/settings</b> command to manage your default quality and check your usage stats.`;
            await editMessageText(helpMessage, { chat_id: privateChatId, message_id: message.message_id, reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
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
    let results = [];
    if (query) {
        const searchResults = await searchYoutube(query);
        results = searchResults.map(video => ({
            type: 'article',
            id: video.id,
            title: video.title,
            description: `Duration: ${video.length.simpleText}`,
            thumb_url: video.thumbnail.url,
            input_message_content: { message_text: `*You selected:* ${video.title}\n\nPress the button below to choose a download format.` },
            reply_markup: {
                inline_keyboard: [[{ text: "👉 Choose Format", callback_data: `formats|${video.id}` }]]
            }
        }));
    }

    await apiRequest('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: JSON.stringify(results),
        cache_time: 300 
    });
}

// --- Broadcast Handler ---
async function handleBroadcast(message) {
    if (!message.reply_to_message) {
        await sendTelegramMessage(message.chat.id, "⚠️ **Broadcast Error**\nPlease reply to the message (text, photo, or video) you want to broadcast and then type `/broadcast`.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) users.push(entry.key[1]);
    await sendTelegramMessage(message.chat.id, `🚀 **Starting Broadcast...**\nSending to ${users.length} users. This may take some time.`);
    let successCount = 0;
    for (const userId of users) {
        try {
            await apiRequest('copyMessage', { chat_id: userId, from_chat_id: message.chat.id, message_id: message.reply_to_message.message_id });
            successCount++;
        } catch (e) { console.error(`Failed to broadcast to user ${userId}:`, e.message); }
        await delay(100); 
    }
    await sendTelegramMessage(message.chat.id, `✅ **Broadcast Complete!**\nSuccessfully sent to ${successCount} out of ${users.length} users.`);
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
async function startDownload(chatId, userId, videoUrl, format) {
    const statusMsg = await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);
    const cancelBtn = { text: "❌ Cancel", callback_data: `cancel|${downloadKey}` };
    
    try {
        await editMessageText(`🔎 Analyzing link...`, { chat_id: chatId, message_id: statusMsg.result.message_id, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
        
        await editMessageText(`💾 Checking file size...`, { chat_id: chatId, message_id: statusMsg.result.message_id, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const headRes = await fetch(downloadUrl, { method: 'HEAD', signal: controller.signal });
        const contentLength = parseInt(headRes.headers.get('content-length') || "0", 10);
        const fileSizeMB = contentLength / (1024 * 1024);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
             await editMessageText(`⚠️ <b>File Is Too Large!</b> (${fileSizeMB.toFixed(2)} MB)\nPlease use the direct link to download.`, { chat_id: chatId, message_id: statusMsg.result.message_id, reply_markup: { inline_keyboard: [[{ text: `🔗 Download ${format.toUpperCase()} 🔮`, url: downloadUrl }]] } });
             return; 
        }

        await editMessageText(`🚀 Downloading to our server...`, { chat_id: chatId, message_id: statusMsg.result.message_id, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        const fileRes = await fetch(downloadUrl, { signal: controller.signal });
        const fileBlob = await fileRes.blob();
        await editMessageText(`✅ Uploading to you...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
        
        const fileType = format.toLowerCase() === 'mp3' ? 'audio' : 'video';
        const fileExtension = format.toLowerCase() === 'mp3' ? 'mp3' : 'mp4';
        const fileName = `${safeTitle}.${fileExtension}`;
        
        await sendMedia(chatId, fileBlob, fileType, `📥 Adiza-YT Bot`, fileName, info.title);
        await deleteMessage(chatId, statusMsg.result.message_id);
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Download handling error:", error);
            await editMessageText("❌ Sorry, an error occurred.", { chat_id: chatId, message_id: statusMsg.result.message_id });
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}

// --- Helper Functions ---
async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 **Support Adiza Bot!**\n\nYour support helps cover server costs and allows me to keep adding new features. Click the button below to make a secure donation.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ **User Settings**\n\nHere you can customize your experience and view your stats. Select an option below.";
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

// --- New Helper for Inline Format Buttons ---
function createInlineFormatButtons(videoId) {
    const formats = ['mp3', '360', '720'];
    const formatLabels = { 'mp3': 'MP3', '360': '360p', '720': '720p' };
    const formatIcons = { 'mp3': '🎵', '360': '📺', '720': '💎' };
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
    formData.append(type, blob, fileName);
    formData.append('caption', caption);
    let inline_keyboard = [[{ text: "Share ↪️", switch_inline_query: "" }, { text: "🔮 More Bots 🔮", url: CHANNEL_URL }]];
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
console.log("Starting final professional bot server (v30 - Definitive Final)...");
Deno.serve(handler);
