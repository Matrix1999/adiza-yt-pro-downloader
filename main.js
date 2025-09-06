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

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
    "CAACAgIAAxkBAAE6q6Fou5MX6nv0HE5duKOzHhvyR08osQACRgADUomRI_j-5eQK1QodNgQ", "CAACAgIAAxkBAAE6q59ou5MNTS_iZ5hTleMdiDQbVuh4rQACSQADUomRI4zdJVjkz_fvNgQ",
    "CAACAgIAAxkBAAE6q51ou5L3EZV6j-3b2pPqjIEN4ewQgAAC1QUAAj-VzAr0FV2u85b8KDYE"
];

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

// --- Logic Handlers (Final Corrected Version) ---
async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const user = message.from;
    const userId = user.id;

    if (userState.get(userId) === 'awaiting_feedback') {
        if (text === "/cancel") {
            userState.delete(userId);
            await sendTelegramMessage(chatId, "Feedback submission canceled.");
        } else {
            await handleFeedbackSubmission(message);
        }
        return;
    }

    const [command, ...args] = text.split(" ");
    const payload = args.join(" ");

    // --- Admin Commands ---
    if (userId === ADMIN_ID) {
        if (command === "/broadcast") { await handleBroadcast(message, payload); return; }
        if (command === "/grant_premium") { await grantPremiumAccess(message, payload); return; }
    }

    // --- User Commands ---
    switch (command) {
        case "/start":
            await handleStart(message, args[0]);
            break;
        case "/settings":
            await sendSettingsMessage(chatId);
            break;
        case "/donate":
            await sendDonationMessage(chatId);
            break;
        case "/refer":
            await sendReferralMessage(chatId, userId);
            break;
        case "/feedback":
            await requestFeedback(chatId, userId);
            break;
        case "/cancel":
            userState.delete(userId);
            await sendTelegramMessage(chatId, "Operation canceled.");
            break;
        case "/search":
            if (payload) {
                await handleSearch(chatId, payload, userId);
            } else {
                await sendTelegramMessage(chatId, "Please provide a search term. Usage: /search song name");
            }
            break;
        default:
            if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
                const userQuality = (await kv.get(["users", userId, "quality"])).value;
                if (userQuality) {
                    await startDownload(chatId, userId, text, userQuality);
                } else {
                    await sendTelegramMessage(chatId, "Please choose a format to download:", { reply_markup: { inline_keyboard: await createFormatButtons(text, userId) } });
                }
            } else {
                await sendTelegramMessage(chatId, "Sorry, I didn't understand that. Use /help to see available commands.");
            }
            break;
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
                    await sendTelegramMessage(parseInt(referrerId), `🎉 <b>+1 Premium Credit!</b>\n\nYou've successfully referred ${REFERRAL_GOAL} users and earned a credit for <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b> of 1080p access.`, {});
                }
                await kv.set(referrerKey, { ...referrer, referrals: newTotalReferrals, premium_credits: newCredits });
            }
        }
    }
    
    if (WELCOME_STICKER_IDS.length > 0) {
        const stickerCount = (await kv.get(["global", "stickerCounter"])).value || 0;
        await sendSticker(chatId, WELCOME_STICKER_IDS[stickerCount % WELCOME_STICKER_IDS.length]);
        await kv.set(["global", "stickerCounter"], stickerCount + 1);
    }
    await delay(4000);
    
    const userDb = (await kv.get(userKey)).value || {};
    const userStatus = userDb.is_permanent_premium ? "⭐ Premium User" : "👤 Standard User";
    const welcomeMessage = `
👋 Hello, <b>${user.first_name}</b>!

<b>User ID:</b> <code>${user.id}</code>
<b>Status:</b> ${userStatus}

Welcome to Adiza YouTube Downloader! 🌹
Use /help to see all commands.
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }],
        [{ text: "👑 OWNER 👑", url: OWNER_URL }],
        [{ text: "💖 Donate 💖", callback_data: "donate_now" }, { text: "⚙️ Settings", callback_data: "settings_menu" }]
    ];
    await sendPhoto(chatId, START_PHOTO_URL, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
}

async function handleSearch(chatId, query) {
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

// --- Commands & Core Features ---
async function sendReferralMessage(chatId, userId) {
    const referralLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    const user = (await kv.get(["users", userId])).value || { referrals: 0, premium_credits: 0 };
    const premiumInfo = (await kv.get(["premium_access", userId])).value || { expires_at: 0 };
    const referrals = user.referrals || 0;
    const credits = user.premium_credits || 0;
    const nextCreditProgress = referrals % REFERRAL_GOAL;

    let status = `Progress to next credit: ${nextCreditProgress}/${REFERRAL_GOAL}`;
    if (premiumInfo.expires_at > Date.now()) {
        const expiryDate = new Date(premiumInfo.expires_at).toLocaleString();
        status = `<b>Active Premium:</b> Expires on ${expiryDate}`;
    }

    let message = `
🤝 <b>Invite & Earn Premium Credits!</b>
Share your unique link. For every <b>${REFERRAL_GOAL} friends</b> who join, you'll earn <b>1 Premium Credit</b>.
Each credit unlocks <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b> of 1080p downloads.
<b>Your Status:</b>
- Total Referrals: ${referrals}
- Premium Credits Available: ${credits}
- ${status}
Your personal link:
<code>${referralLink}</code>
    `;
    await sendTelegramMessage(chatId, message.trim(), {});
}

async function requestFeedback(chatId, userId) {
    userState.set(userId, 'awaiting_feedback');
    await sendTelegramMessage(chatId, "📝 Please send your feedback, suggestion, or bug report. Use /cancel to abort.");
}

async function handleFeedbackSubmission(message) {
    const userId = message.from.id;
    await apiRequest('forwardMessage', { chat_id: ADMIN_ID, from_chat_id: message.chat.id, message_id: message.message_id });
    await sendTelegramMessage(message.chat.id, "✅ Thank you! Your feedback has been sent.");
    userState.delete(userId);
}

async function grantPremiumAccess(message, payload) {
    const targetId = parseInt(payload);
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

async function handleBroadcast(message, payload) {
    if (!payload) {
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
            await sendTelegramMessage(userId, payload, {});
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

    if (action.startsWith("settings") || action === "back_to_settings" || action.startsWith("set_default") || action === "user_stats" || action === "help_menu") {
        await handleSettingsCallbacks(callbackQuery);
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
            await sendTelegramMessage(chatId, `⭐ <b>1080p is a Premium Feature!</b>\n\nTo unlock it, you need a <b>Premium Credit</b>. Refer <b>${REFERRAL_GOAL} friends</b> to earn one. Use /refer to see your link.`, {});
            return;
        }
    }
    
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
        
        if (!isInline) await editMessageText(`⏳ Download in progress...`, { ...editTarget, reply_markup: { inline_keyboard: [[cancelBtn]] } });

        const fileRes = await fetch(downloadUrl, { signal: controller.signal });
        if (!fileRes.ok) throw new Error(`Download server failed: ${fileRes.status}.`);

        const fileBlob = await fileRes.blob();
        if (fileBlob.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
             const messageText = `⚠️ <b>File Is Too Large!</b> (${(fileBlob.size / (1024 * 1024)).toFixed(2)} MB)`;
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

async function handleSettingsCallbacks(callbackQuery) {
    const { data, message, from } = callbackQuery;
    const userId = from.id;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const [action, payload] = data.split("|");

    if (action === "settings_menu") { await deleteMessage(chatId, messageId); await sendSettingsMessage(chatId); }
    else if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Choose your default quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: await createQualitySettingsButtons(userQuality, userId) } });
    } else if (action === "set_default") {
        const userKey = ["users", userId];
        const premiumAccessKey = ["premium_access", userId];
        const user = (await kv.get(userKey)).value || {};
        const premiumInfo = (await kv.get(premiumAccessKey)).value || { expires_at: 0 };
        const hasPremiumAccess = user.is_permanent_premium || userId === ADMIN_ID || premiumInfo.expires_at > Date.now();
        if(payload === '1080' && !hasPremiumAccess) {
             await answerCallbackQuery(callbackQuery.id, "⭐ Premium access is required to set 1080p as default.");
             return;
        }

        payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
        const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Default quality updated!", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: await createQualitySettingsButtons(newUserQuality, userId) } });
    } else if (action === "user_stats") {
        const downloads = (await kv.get(["users", userId, "downloads"])).value || 0;
        await editMessageText(`📊 <b>Your Stats</b>\n\nTotal Downloads: ${downloads || 0}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "back_to_settings" }]] } });
    } else if (action === "back_to_settings") { await sendSettingsMessage(chatId, messageId, true); }
    else if (action === "help_menu") { 
        const helpMessage = `📖 <b>Help & FAQ</b>

<b>How to Use This Bot:</b>
1️⃣ <b>Search for Music/Videos</b>
Use the <code>/search</code> command followed by a name (e.g., <code>/search shatta wale on god</code>).

2️⃣ <b>Pasting a Link</b>
Send a valid YouTube link directly to me.

3️⃣ <b>Inline Mode (In Any Chat)</b>
Type <code>@${BOT_USERNAME}</code> and a search term in any chat.

⭐ <b>Premium Access</b>
Download in 1080p quality by referring friends or donating. Use /refer to see your progress.

⚙️ <b>Other Commands</b>
/settings - Manage your preferences
/refer - Get your referral link
/feedback - Send a message to the admin
/cancel - Cancel the current operation`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
    await answerCallbackQuery(callbackQuery.id);
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ <b>User Settings</b>";
    const inline_keyboard = [
        [{ text: "⚙️ Default Quality", callback_data: "settings_quality" }],
        [{ text: "📊 My Stats", callback_data: "user_stats" }],
        [{ text: "❓ Help & FAQ", callback_data: "help_menu" }]
    ];
    if (shouldEdit) await editMessageText(settingsMessage, { chat_id: chatId, message_id: messageIdToUpdate, reply_markup: { inline_keyboard } });
    else await sendTelegramMessage(chatId, settingsMessage, { reply_markup: { inline_keyboard } });
}

async function sendDonationMessage(chatId) {
    await sendTelegramMessage(chatId, `💖 <b>Support Adiza Bot!</b>\n\nYour support helps cover server costs. After donating, please contact the admin to receive lifetime premium access.`, { reply_markup: { inline_keyboard: [[{ text: "💳 Donate with Paystack", url: DONATE_URL }]] } });
}

async function createQualitySettingsButtons(currentQuality, userId) {
    const userKey = ["users", userId];
    const premiumAccessKey = ["premium_access", userId];
    const user = (await kv.get(userKey)).value || {};
    const premiumInfo = (await kv.get(premiumAccessKey)).value || { expires_at: 0 };
    
    const hasPremiumAccess = user.is_permanent_premium || userId === ADMIN_ID || premiumInfo.expires_at > Date.now();

    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => {
        let text = `${currentQuality === f ? "✅ " : ""}${icons[f]} ${f.toUpperCase()}`;
        if (f === '1080' && !hasPremiumAccess) text = `⭐ ${text}`;
        return { text, callback_data: `set_default|${f}` };
    });
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back", callback_data: "back_to_settings" }]);
    return rows;
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
console.log("Starting Adiza Downloader Bot (v60 - Final Corrected Version)...");
Deno.serve(handler);
