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
        if (update.inline_query) await handleInlineQuery(update.inline_query);
        else if (update.callback_query) await handleCallbackQuery(update.callback_query);
        else if (update.message) await handleMessage(update.message);
        return new Response("ok");
    } catch (e) {
        console.error("Main handler error:", e);
        return new Response("Error processing update", { status: 500 });
    }
}

// --- Helper: Delay Function ---
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
        await kv.set(["users", userId], user);
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
    const { data, message, from, inline_message_id } = callbackQuery;
    const userId = from.id;
    const [action, ...payloadParts] = data.split("|");
    const payload = payloadParts.join("|");

    if (inline_message_id) {
        if (action === "download") {
            await answerCallbackQuery(callbackQuery.id);
            const [format, videoId] = payload.split(":");
            const videoUrl = `https://youtu.be/${videoId}`;
            await editMessageText("✅ Request accepted! Sending file to our private chat.", { inline_message_id, reply_markup: {inline_keyboard: []} });
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
        if (action.startsWith("settings") || action.startsWith("back_to_") || action.startsWith("set_default") || action.startsWith("user_") || action.startsWith("help_")) {
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

// --- Main Download Logic (Using Confirmed Working Logic) ---
async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = isInline ? inlineMessageId : `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);
    const cancelBtn = { text: "❌ Cancel", callback_data: `cancel|${downloadKey}` };
    const editTarget = isInline ? { inline_message_id: inlineMessageId } : { chat_id: chatId, message_id: statusMsg.result.message_id };

    try {
        if (!isInline) await editMessageText(`🔎 Analyzing link...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });
        
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
        
        if (!isInline) await editMessageText(`🚀 Download in progresss...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });

        const fileRes = await fetch(downloadUrl, { signal: controller.signal });
        
        if (!fileRes.ok) {
            const errorText = await fileRes.text();
            console.error("Worker API Error:", errorText);
            throw new Error(`Download server failed: ${fileRes.status}. Check worker logs.`);
        }

        const fileBlob = await fileRes.blob();

        const fileSizeMB = fileBlob.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
             const messageText = `⚠️ <b>File Is Too Large!</b> (${fileSizeMB.toFixed(2)} MB)`;
             if (isInline) await sendTelegramMessage(chatId, messageText);
             else await editMessageText(messageText, { ...editTarget, reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } });
             return; 
        }

        if (!isInline) await editMessageText(`✅ Uploading to you...`, editTarget);
        
        const fileType = format.toLowerCase() === 'mp3' ? 'audio' : 'video';
        const fileName = `${safeTitle}.${fileType === 'audio' ? 'mp3' : 'mp4'}`;
        
        await sendMedia(chatId, fileBlob, fileType, `📥 Adiza-YT Bot`, fileName, info.title);
        if (!isInline) await deleteMessage(chatId, statusMsg.result.message_id);
        
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Download handling error:", error);
            const errorMessage = `❌ Sorry, an error occurred:\n\n<i>${error.message}</i>`;
            if (isInline) {
                await sendTelegramMessage(chatId, errorMessage);
            } else if (statusMsg) {
                await editMessageText(errorMessage, { chat_id: chatId, message_id: statusMsg.result.message_id });
            }
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}


// --- Other Handlers ---
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

async function handleBroadcast(message) {
    if (!message.reply_to_message) {
        await sendTelegramMessage(message.chat.id, "⚠️ Reply to a message to broadcast it.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) users.push(entry.key[1]);
    await sendTelegramMessage(message.chat.id, `🚀 Broadcasting to ${users.length} users...`);
    let successCount = 0;
    for (const userId of users) {
        try {
            await apiRequest('copyMessage', { chat_id: userId, from_chat_id: message.chat.id, message_id: message.reply_to_message.message_id });
            successCount++;
        } catch (e) { console.error(`Broadcast failed for user ${userId}:`, e.message); }
        await delay(100); 
    }
    await sendTelegramMessage(message.chat.id, `✅ Broadcast complete! Sent to ${successCount}/${users.length} users.`);
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

// --- Helper & UI Functions ---
async function handleSettingsCallbacks(action, payload, chatId, messageId, userId) {
    if (action === "settings_menu") { await deleteMessage(chatId, messageId); await sendSettingsMessage(chatId); }
    else if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Choose your default quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(userQuality) } });
    } else if (action === "set_default") {
        payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
        const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Default quality updated!", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: createQualitySettingsButtons(newUserQuality) } });
    } else if (action === "user_stats") {
        const downloads = (await kv.get(["users", userId, "downloads"])).value || 0;
        await editMessageText(`📊 <b>Your Stats</b>\n\nTotal Downloads: ${downloads}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "back_to_settings" }]] } });
    } else if (action === "back_to_settings") { await sendSettingsMessage(chatId, messageId, true); }
    else if (action === "help_menu") { 
        const helpMessage = `📖 <b>Help & FAQ</b>\n\n<b>Two Ways to Use This Bot:</b>\n\n1️⃣ <b>Direct Chat (For Precise Links)</b>\nSend a valid YouTube link directly to me. If you have a default quality set, your download will begin instantly. Otherwise, you'll be prompted to choose a format.\n\n2️⃣ <b>Inline Mode (For Quick Searches)</b>\nIn any chat, type <code>@${BOT_USERNAME}</code> followed by a search term (e.g., <i>new amapiano mix</i>). Select a video from the results to download it right there!\n\n⚙️ Use the <b>/settings</b> command to manage your default quality and check your usage stats.`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
}

async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 <b>Support Adiza Bot!</b>\n\nYour support helps cover server costs. Click below to make a secure donation.`, { reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ <b>User Settings</b>";
    const inline_keyboard = [[{ text: "⚙️ Default Quality", callback_data: "settings_quality" }], [{ text: "📊 My Stats", callback_data: "user_stats" }], [{ text: "❓ Help", callback_data: "help_menu" }]];
    if (shouldEdit) await editMessageText(settingsMessage, { chat_id: chatId, message_id: messageIdToUpdate, reply_markup: { inline_keyboard } });
    else await sendTelegramMessage(chatId, settingsMessage, { reply_markup: { inline_keyboard } });
}

function createQualitySettingsButtons(currentQuality) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => ({ text: `${currentQuality === f ? "✅ " : ""}${icons[f]} ${f.toUpperCase()}`, callback_data: `set_default|${f}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back", callback_data: "back_to_settings" }]);
    return rows;
}

function createInlineFormatButtons(videoId) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => ({ text: `${icons[f]} ${f.toUpperCase()}`, callback_data: `download|${f}:${videoId}` }));
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    return rows;
}

function createFormatButtons(videoUrl) {
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let rows = [], currentRow = [];
    formats.forEach(f => {
        currentRow.push({ text: `${icons[f]} ${f.toUpperCase()}`, callback_data: `${f}|${videoUrl}` });
        if (currentRow.length === 3) { rows.push(currentRow); currentRow = []; }
    });
    if (currentRow.length > 0) rows.push(currentRow);
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
async function sendMedia(chatId, blob, type, caption, fileName, title) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);
    const endpoint = type === 'audio' ? 'sendAudio' : 'sendVideo';
    const file = new File([blob], fileName, { type: type === 'audio' ? 'audio/mpeg' : 'video/mp4' });
    formData.append(type, file);
    if (type === 'audio') {
        formData.append('title', title || 'Unknown Title');
        formData.append('performer', `Via @${BOT_USERNAME}`);
    }
    const inline_keyboard = [[{ text: "Share ↪️", switch_inline_query: "" }, { text: "🔮 More Bots 🔮", url: CHANNEL_URL }]];
    if (type === 'audio' && title) {
        inline_keyboard.unshift([{ text: "🎵 Find on Spotify", url: `https://open.spotify.com/search/${encodeURIComponent(title)}` }]);
    }
    formData.append('reply_markup', JSON.stringify({ inline_keyboard }));
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, { method: 'POST', body: formData });
}

async function apiRequest(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  return res.json();
}
async function sendTelegramMessage(chatId, text, extra = {}) { return await apiRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }); }
async function sendPhoto(chatId, photo, caption, extra = {}) { return await apiRequest('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra }); }
async function sendSticker(chatId, sticker) { return await apiRequest('sendSticker', { chat_id: chatId, sticker }); }
async function editMessageText(text, extra = {}) { return await apiRequest('editMessageText', { text, parse_mode: 'HTML', ...extra }); }
async function deleteMessage(chatId, messageId) { return await apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId }); }
async function answerCallbackQuery(id, text) { return await apiRequest('answerCallbackQuery', { callback_query_id: id, text }); }

// --- Server Start ---
console.log("Starting Adiza Downloader Bot (v49 - Final Confirmed Logic)...");
Deno.serve(handler);
