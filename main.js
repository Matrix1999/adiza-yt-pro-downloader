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
const REFERRAL_GOAL = 2; // Refer 2 users to get 1 credit
const PREMIUM_ACCESS_DURATION_DAYS = 7; // 1 credit = 7 days of access

// --- External Libraries ---
import YouTube from "https://esm.sh/youtube-search-api@1.2.1";

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- State Management ---
const activeDownloads = new Map();
const userState = new Map(); // For multi-step commands like /feedback

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

// --- Logic Handlers (with Referral, Premium, and Feedback Logic) ---
async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const user = message.from;
    const userId = user.id;

    if (userState.get(userId) === 'awaiting_feedback') {
        await handleFeedbackSubmission(message);
        return;
    }
    
    // --- Admin Commands ---
    if (userId === ADMIN_ID) {
        if (text.startsWith("/broadcast ")) { await handleBroadcast(message); return; }
        if (text.startsWith("/grant_premium ")) { await grantPremiumAccess(message); return; }
    }

    const [command, payload] = text.split(" ");
    
    // --- Main Command Router ---
    if (command === "/start") {
        await handleStart(message, payload);
    } else if (command === "/settings") {
        await sendSettingsMessage(chatId, userId);
    } else if (command === "/donate") {
        await sendDonationMessage(chatId);
    } else if (command === "/refer") {
        await sendReferralMessage(chatId, userId);
    } else if (command === "/feedback") {
        await requestFeedback(chatId, userId);
    } else if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        if (userQuality) {
            await startDownload(chatId, userId, text, userQuality);
        } else {
            await sendTelegramMessage(chatId, "Please choose a format to download:", { reply_markup: { inline_keyboard: await createFormatButtons(text, userId) } });
        }
    } else {
        // Handle as a direct search query
        await handleSearch(chatId, text, userId);
    }
}

async function handleStart(message, referrerId) {
    const user = message.from;
    const userId = user.id;
    const chatId = message.chat.id;
    const userKey = ["users", userId];
    const fromNewUser = !(await kv.get(userKey)).value;

    if (fromNewUser) {
        await kv.set(userKey, { ...user, referrals: 0, premium_credits: 0, is_permanent_premium: false });
        if (referrerId && parseInt(referrerId) !== userId) {
            const referrerKey = ["users", parseInt(referrerId)];
            const referrer = (await kv.get(referrerKey)).value;
            if (referrer) {
                const newTotalReferrals = (referrer.referrals || 0) + 1;
                let newCredits = referrer.premium_credits || 0;
                
                if (newTotalReferrals % REFERRAL_GOAL === 0 && newTotalReferrals > 0) {
                    newCredits += 1;
                    await sendTelegramMessage(parseInt(referrerId), `🎉 <b>+1 Premium Credit!</b>\n\nYou've successfully referred ${REFERRAL_GOAL} users and earned a credit for <b>7 days</b> of 1080p access. Use it on your next 1080p download!`, {});
                }
                
                await kv.set(referrerKey, { ...referrer, referrals: newTotalReferrals, premium_credits: newCredits });
            }
        }
    }
    
    // Send welcome photo and message
    const welcomeMessage = `
👋 Hello, <b>${user.first_name}</b>!

Welcome to Adiza YouTube Downloader! 🌹
Simply send a song or video name to get started.
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
        [{ text: "👑 OWNER 👑", url: OWNER_URL }],
        [{ text: "💖 Donate 💖", callback_data: "donate_now" }, { text: "⚙️ Settings", callback_data: "settings_menu" }]
    ];
    await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
}

async function handleSearch(chatId, query, userId) {
    await sendTelegramMessage(chatId, `🔍 Searching for: <b>${query}</b>...`);
    const searchResults = await searchYoutube(query);

    if (!searchResults || searchResults.length === 0) {
        await sendTelegramMessage(chatId, `😕 Sorry, no results found for "<b>${query}</b>".`);
        return;
    }

    const resultButtons = searchResults.slice(0, 15).map(video => ([{
        text: `🎬 ${video.title}`,
        callback_data: `select_video|${video.id}`
    }]));

    await sendTelegramMessage(chatId, "👇 Here's what I found. Please choose one:", {
        reply_markup: { inline_keyboard: resultButtons }
    });
}

// --- New Commands & Logic ---
async function sendReferralMessage(chatId, userId) {
    const referralLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    const user = (await kv.get(["users", userId])).value || { referrals: 0, premium_credits: 0 };
    const referrals = user.referrals || 0;
    const credits = user.premium_credits || 0;
    const nextCreditProgress = referrals % REFERRAL_GOAL;

    let message = `
🤝 <b>Invite & Earn Premium Credits!</b>

Share your unique link. For every <b>${REFERRAL_GOAL} friends</b> who join, you'll earn <b>1 Premium Credit</b>.

Each credit unlocks <b>7 days</b> of 1080p downloads.

<b>Your Progress:</b>
- Total Referrals: ${referrals}
- Premium Credits Available: ${credits}
- Progress to next credit: ${nextCreditProgress}/${REFERRAL_GOAL}

Your personal link:
<code>${referralLink}</code>
    `;
    await sendTelegramMessage(chatId, message.trim(), {});
}

async function requestFeedback(chatId, userId) {
    userState.set(userId, 'awaiting_feedback');
    await sendTelegramMessage(chatId, "📝 Please send your feedback, suggestion, or bug report in a single message. It will be forwarded to the admin.");
}

async function handleFeedbackSubmission(message) {
    const userId = message.from.id;
    await apiRequest('forwardMessage', { chat_id: ADMIN_ID, from_chat_id: message.chat.id, message_id: message.message_id });
    await sendTelegramMessage(message.chat.id, "✅ Thank you! Your feedback has been sent.");
    userState.delete(userId);
}

async function grantPremiumAccess(message) {
    const targetId = parseInt(message.text.split(" ")[1]);
    if (isNaN(targetId)) {
        await sendTelegramMessage(message.chat.id, "Invalid User ID. Usage: /grant_premium USER_ID");
        return;
    }
    const userKey = ["users", targetId];
    const user = (await kv.get(userKey)).value;
    if (!user) {
        await sendTelegramMessage(message.chat.id, "User not found.");
        return;
    }
    await kv.set(userKey, { ...user, is_permanent_premium: true });
    await sendTelegramMessage(message.chat.id, `✅ User ${targetId} now has permanent premium.`);
    await sendTelegramMessage(targetId, "🎉 Congratulations! You have been granted lifetime <b>Premium Access</b> by the admin! You can now download in 1080p quality anytime.", {});
}

async function handleBroadcast(message) {
    const textToBroadcast = message.text.substring(message.text.indexOf(" ") + 1);
    if (!textToBroadcast || textToBroadcast === "/broadcast") {
        await sendTelegramMessage(message.chat.id, "⚠️ Please provide a message to broadcast.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) {
        users.push(entry.key[1]);
    }
    await sendTelegramMessage(message.chat.id, `🚀 Broadcasting to ${users.length} users...`);
    let successCount = 0;
    for (const userId of users) {
        try {
            await sendTelegramMessage(userId, textToBroadcast, {});
            successCount++;
        } catch (e) {
            console.error(`Broadcast failed for user ${userId}:`, e.message);
        }
        await delay(100);
    }
    await sendTelegramMessage(message.chat.id, `✅ Broadcast complete! Sent to ${successCount}/${users.length} users.`);
}


// --- Callback & Download Logic ---
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
             const formatButtons = await createInlineFormatButtons(videoId, userId);
             await editMessageText("Choose a format to download:", {inline_message_id, reply_markup: {inline_keyboard: formatButtons}});
        }
        return;
    }
    
    const privateChatId = message.chat.id;

    if (action === 'select_video') {
        const videoId = payload;
        const videoUrl = `https://youtu.be/${videoId}`;
        await deleteMessage(privateChatId, message.message_id); 
        await sendTelegramMessage(privateChatId, "✅ Video selected. Now, choose a format:", {
            reply_markup: { inline_keyboard: await createFormatButtons(videoUrl, userId) }
        });
        return;
    }
    
    if (action === "cancel") {
        const controller = activeDownloads.get(payload);
        if (controller) controller.abort();
        await editMessageText("❌ Download Canceled.", { chat_id: privateChatId, message_id: message.message_id });
        return;
    }
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


async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    const userKey = ["users", userId];
    const premiumAccessKey = ["premium_access", userId];
    let user = (await kv.get(userKey)).value || {};
    const premiumInfo = (await kv.get(premiumAccessKey)).value || { expires_at: 0 };

    const isPermanentPremium = user.is_permanent_premium || userId === ADMIN_ID;
    const hasActiveTempPremium = premiumInfo.expires_at > Date.now();
    
    if (format === '1080' && !isPermanentPremium && !hasActiveTempPremium) {
        const credits = user.premium_credits || 0;
        if (credits > 0) {
            const newExpiry = Date.now() + (PREMIUM_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000);
            await kv.set(premiumAccessKey, { expires_at: newExpiry });
            user.premium_credits = credits - 1;
            await kv.set(userKey, user);
            await sendTelegramMessage(chatId, `✅ 1 Premium Credit spent! You now have access to 1080p downloads for the next <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b>.`, {});
        } else {
            await sendTelegramMessage(chatId, `⭐ <b>1080p is a Premium Feature!</b>\n\nTo unlock it, you need a <b>Premium Credit</b>. Refer <b>${REFERRAL_GOAL} friends</b> to earn one. Use /refer to get your link.`, {});
            return;
        }
    }
    
    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing ${format.toUpperCase()}...`);
    const downloadKey = isInline ? inlineMessageId : `${chatId}:${statusMsg.result.message_id}`;
    const controller = new AbortController();
    activeDownloads.set(downloadKey, controller);
    const editTarget = isInline ? { inline_message_id: inlineMessageId } : { chat_id: chatId, message_id: statusMsg.result.message_id };

    try {
        if (!isInline) await editMessageText(`🔎 Analyzing link...`, editTarget);
        
        const info = await getVideoInfo(videoUrl);
        const safeTitle = info.title ? info.title.replace(/[^\w\s.-]/g, '_') : `video_${Date.now()}`;
        const downloadUrl = `${YOUR_API_BASE_URL}/?url=${encodeURIComponent(videoUrl)}&format=${format}`;
        
        if (!isInline) await editMessageText(`⏳ Download in progress...`, editTarget);

        const fileRes = await fetch(downloadUrl, { signal: controller.signal });
        if (!fileRes.ok) throw new Error(`Download server failed: ${fileRes.status}.`);

        const fileBlob = await fileRes.blob();
        if (fileBlob.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
             await editMessageText(`⚠️ <b>File Is Too Large!</b>`, { ...editTarget, reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } });
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
            if (isInline) await sendTelegramMessage(chatId, errorMessage);
            else if (statusMsg) await editMessageText(errorMessage, { chat_id: chatId, message_id: statusMsg.result.message_id });
        }
    } finally {
        activeDownloads.delete(downloadKey);
    }
}


// --- Other Handlers & UI Functions ---
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

async function searchYoutube(query) {
    try {
        const response = await YouTube.GetListByKeyword(query, false, 15, [{type: 'video'}]);
        return response.items || [];
    } catch (error) {
        console.error("YouTube search error:", error);
        return [];
    }
}

async function handleSettingsCallbacks(action, payload, chatId, messageId, userId) {
    // This function needs to be defined to handle settings callbacks
}

async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 <b>Support Adiza Bot!</b>\n\nYour support helps cover server costs. Click below to make a secure donation.`, { reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function sendSettingsMessage(chatId, userId) {
    // This function needs to be defined to show the settings menu
}

async function createFormatButtons(videoUrl, userId) {
    const userKey = ["users", userId];
    const premiumAccessKey = ["premium_access", userId];
    const user = (await kv.get(userKey)).value || {};
    const premiumInfo = (await kv.get(premiumAccessKey)).value || { expires_at: 0 };
    
    const isPermanentPremium = user.is_permanent_premium || userId === ADMIN_ID;
    const hasActiveTempPremium = premiumInfo.expires_at > Date.now();
    const hasPremiumAccess = isPermanentPremium || hasActiveTempPremium;
    const credits = user.premium_credits || 0;

    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳️', '1080': '💎' };
    
    let rows = [], currentRow = [];
    formats.forEach(f => {
        let buttonText = `${icons[f]} ${f.toUpperCase()}`;
        if (f === '1080' && !hasPremiumAccess) {
             buttonText = `⭐ ${buttonText} (${credits} credits)`;
        }
        currentRow.push({ text: buttonText, callback_data: `${f}|${videoUrl}` });
        if(currentRow.length === 3) {
            rows.push(currentRow);
            currentRow = [];
        }
    });
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}

async function createInlineFormatButtons(videoId, userId) {
    // Same logic as createFormatButtons, but for inline mode
    return createFormatButtons(`https://youtu.be/${videoId}`, userId);
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
console.log("Starting Adiza Downloader Bot (v55 - Credit System Final)...");
Deno.serve(handler);
