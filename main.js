// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const YOUR_API_BASE_URL = "https://adiza-yt-pro-downloader.matrixzat99.workers.dev";
const TIKTOK_API_BASE_URL = "https://adiza-tiktokpro-downloader.matrixzat99.workers.dev";
const WELCOME_PHOTO_URLS = [
    "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg",
    "https://files.catbox.moe/hbbayg.jpg",
    "https://files.catbox.moe/jadrbj.jpg",
    "https://files.catbox.moe/7x9dwj.jpg",
    "https://files.catbox.moe/u7qhlg.jpg",
    "https://files.catbox.moe/pcla4l.jpg"
];
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
        if (command === "/broadcast") {
            await handleBroadcast(message, payload);
            return;
        }
        if (command === "/grant_premium") {
            await grantPremiumAccess(message, payload);
            return;
        }
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
        case "/premium_member":
            await sendPremiumMemberMessage(chatId);
            break;
        case "/premium_hub":
            await handlePremiumHubRequest(chatId, userId);
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
                await handleSearch(chatId, payload);
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
            } else if (text.includes("tiktok.com/")) { // TikTok link detection
                await handleTikTokLink(chatId, userId, text);
            }
            else {
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
                    await sendTelegramMessage(parseInt(referrerId), `🎉 <b>+1 Premium Credit!</b>\n\nYou've successfully referred ${REFERRAL_GOAL} users and earned a credit for <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b> of premium access.`, {});
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
    await delay(2000);
    
    const userStatus = await checkPremium(userId) ? "⭐ Premium User" : "👤 Standard User";
    
    const photoCount = (await kv.get(["global", "photoCounter"])).value || 0;
    const currentPhotoUrl = WELCOME_PHOTO_URLS[photoCount % WELCOME_PHOTO_URLS.length];
    await kv.set(["global", "photoCounter"], photoCount + 1);

    const welcomeMessage = `
👋 ʜᴇʟʟᴏ, <b>${user.first_name}</b>!

<b>User ID:</b> <code>${user.id}</code>
<b>Status:</b> ${userStatus}

ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴀᴅɪᴢᴀ ʏᴏᴜᴛᴜʙᴇ & ᴛɪᴋᴛᴏᴋ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ ʙᴏᴛ!🌹
sᴇɴᴅ ᴀ ʏᴏᴜᴛᴜʙᴇ ᴏʀ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋ, ᴏʀ ᴜsᴇ /settings ᴛᴏ sᴇᴇ ᴀʟʟ ᴏᴜʀ ᴄᴏᴍᴍᴀɴᴅs & ᴘʀᴇᴍɪᴜᴍ ғᴇᴀᴛᴜʀᴇs.
    `;
    const inline_keyboard = [
        [{ text: "🔮 Channel 🔮", url: CHANNEL_URL }, { text: "👑 OWNER 👑", url: OWNER_URL }],
        [{ text: "💖 Donate 💖", callback_data: "donate_now" }, { text: "⚙️ Settings", callback_data: "settings_menu" }],
        [{ text: "💎 Premium Hub", callback_data: "premium_hub" }]
    ];
    await sendPhoto(chatId, currentPhotoUrl, welcomeMessage.trim(), { reply_markup: { inline_keyboard } });
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

// --- TikTok Link Handler ---
async function handleTikTokLink(chatId, userId, url) {
    await sendTelegramMessage(chatId, "🔮 TikTok link detected! Choose your download format:", {
        reply_markup: {
            inline_keyboard: await createTikTokFormatButtons(url, userId)
        }
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

    let status = `Progress to next credit: ${nextCreditProgress}/${REFERRAL_GOAL} 🔄`;
    if (premiumInfo.expires_at > Date.now()) {
        const expiryDate = new Date(premiumInfo.expires_at).toLocaleString();
        status = `<b>Active Premium:</b> Expires on ${expiryDate} ⏳`;
    }

    let message = `
🎉  <b>Invite Friends & Earn Premium!</b>

Share your unique link. For every <b>${REFERRAL_GOAL} friends</b> who join, you'll get <b>1 Premium Credit</b>.

Each credit unlocks <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b> of unlimited 1080p & HD downloads.

📊  <b>Your Status</b>
    - Total Referrals: ${referrals}
    - Premium Credits: ${credits} ⭐
    - ${status}

👇 Tap the button below or copy this link:
<code>${referralLink}</code>
    `;
    
    const inline_keyboard = [
        [{ text: "📲 Share Your Link", switch_inline_query: `Join me on this awesome bot! ${referralLink}` }]
    ];
    
    await sendTelegramMessage(chatId, message.trim(), { reply_markup: { inline_keyboard }});
}

async function sendPremiumMemberMessage(chatId) {
    const premiumMessage = `
💎 <b>ʟɪғᴇᴛɪᴍᴇ ᴘʀᴇᴍɪᴜᴍ ᴍᴇᴍʙᴇʀ!</b> 💎

sᴜᴘᴘᴏʀᴛ ᴛʜᴇ ʙᴏᴛ's ᴅᴇᴠᴇʟᴏᴘᴍᴇɴᴛ ᴀɴᴅ sᴇʀᴠᴇʀ ᴄᴏsᴛs ᴡɪᴛʜ ᴀ ᴏɴᴇ-ᴛɪᴍᴇ ᴅᴏɴᴀᴛɪᴏɴ ᴏғ ʏᴏᴜʀ ᴄʜᴏɪᴄᴇ ᴛᴏ ɢᴇᴛ <b>ʟɪғᴇᴛɪᴍᴇ ᴘʀᴇᴍɪᴜᴍ ᴀᴄᴄᴇss</b> ᴛᴏ ᴀʟʟ ᴏᴜʀ sᴇʀᴠɪᴄᴇs—ʙᴏᴛʜ ᴄᴜʀʀᴇɴᴛ & ᴀʟʟ ғᴜᴛᴜʀᴇ ᴜᴘᴅᴀᴛᴇs!

✨ <b>ʏᴏᴜʀ ᴘʀᴇᴍɪᴜᴍ ʙᴇɴᴇғɪᴛs:</b>

- 🎬 ᴜɴʟɪᴍɪᴛᴇᴅ 𝟷𝟶𝟾𝟶ᴘ ʏᴛ ᴅᴏᴡɴʟᴏᴀᴅs.
- 🚀 ᴜɴʟɪᴍɪᴛᴇᴅ ʜᴅ ᴛɪᴋᴛᴏᴋ ᴅᴏᴡɴʟᴏᴀᴅs. 
- ⚡ ᴘʀɪᴏʀɪᴛʏ ᴀᴄᴄᴇss ᴛᴏ ɴᴇᴡ ғᴇᴀᴛᴜʀᴇs. 
- 🍿 ɴᴇᴛғʟɪx 𝟺ᴋ ʟᴏɢɪɴs
- 🎨 ᴄᴀɴᴠᴀ ᴘʀᴏ ᴀᴄᴄᴏᴜɴᴛs
- 👑 sʜᴏᴡᴍᴀx ʟᴏɢɪɴs
- 🥏 ᴘʀɪᴍᴇ ᴠɪᴅᴇᴏ ʟᴏɢɪɴs 
- 💎ᴀɴᴅ ᴍᴀɴʏ ᴍᴏʀᴇ.... 

⌛ᴛᴏ ɢᴇᴛ sᴛᴀʀᴛᴇᴅ, sɪᴍᴘʟʏ ᴍᴀᴋᴇ ᴀ ᴅᴏɴᴀᴛɪᴏɴ ᴏғ ɴᴏᴛ ʟᴇss ᴛʜᴀɴ 𝟺$ ᴛʜʀᴏᴜɢʜ ᴏᴜʀ sᴇᴄᴜʀᴇ ᴘᴀʏsᴛᴀᴄᴋ ʟɪɴᴋ. ᴀғᴛᴇʀ ᴅᴏɴᴀᴛɪɴɢ, ᴘʟᴇᴀsᴇ ᴄᴏɴᴛᴀᴄᴛ ᴛʜᴇ ᴀᴅᴍɪɴ ᴡɪᴛʜ ᴀ sᴄʀᴇᴇɴsʜᴏᴛ ᴏғ ʏᴏᴜʀ ʀᴇᴄᴇɪᴘᴛ ᴛᴏ ᴀᴄᴛɪᴠᴀᴛᴇ ʏᴏᴜʀ ʟɪғᴇᴛɪᴍᴇ ᴀᴄᴄᴇss.

ᴛʜᴀɴᴋ ᴜ ғᴏʀ ʏᴏᴜʀ ɪɴᴄʀᴇᴅɪʙʟᴇ sᴜᴘᴘᴏʀᴛ!❤️
    `;
    const inline_keyboard = [
        [{ text: "💳 Donate Now for Lifetime Access", url: DONATE_URL }],
        [{ text: "👑 Contact Admin After Donating", url: OWNER_URL }]
    ];
    await sendTelegramMessage(chatId, premiumMessage.trim(), { reply_markup: { inline_keyboard }});
}

async function handlePremiumHubRequest(chatId, userId) {
    const isPremium = await checkPremium(userId);
    if (!isPremium) {
        await sendTelegramMessage(chatId, `
🔑🚫 <b>Access Denied</b> 🚫🔑

ᴛʜɪs <b>Pᴘʀᴇᴍɪᴜᴍ ʜᴜʙ</b> ɪs ᴇxᴄʟᴜsɪᴠᴇʟʏ ғᴏʀ ᴏᴜʀ 💎ʟɪғᴇᴛɪᴍᴇ ᴘʀᴇᴍɪᴜᴍ ᴍᴇᴍʙᴇʀs💎 ᴡʜᴏ ʜᴀᴠᴇ sᴜᴘᴘᴏʀᴛᴇᴅ ᴛʜᴇ ʙᴏᴛ ᴛʜʀᴏᴜɢʜ ᴀ ᴅᴏɴᴀᴛɪᴏɴ💰.

🐬ᴛᴏ ᴜɴʟᴏᴄᴋ ᴛʜɪs sᴇᴄᴛɪᴏɴ ᴀɴᴅ ᴀʟʟ ғᴜᴛᴜʀᴇ ᴘʀᴇᴍɪᴜᴍ sᴇʀᴠɪᴄᴇs, ᴘʟᴇᴀsᴇ ᴄᴏɴsɪᴅᴇʀ ʙᴇᴄᴏᴍɪɴɢ ᴀ ʟɪғᴇᴛɪᴍᴇ ᴍᴇᴍʙᴇʀ.

ᴜsᴇ ᴛʜᴇ /premium_member ᴄᴏᴍᴍᴀɴᴅ ᴛᴏ ʟᴇᴀʀɴ ᴍᴏʀᴇ.
        `);
        return;
    }

    const premiumHubMessage = `
⌛💎 𝗣𝗥𝗘𝗠𝗜𝗨𝗠 𝗣𝗢𝗥𝗧𝗔𝗟 💎⌛ 

⚡ᴛʜɪs ɪs ʏᴏᴜʀ ᴄᴇɴᴛʀᴀʟ ᴢᴏɴᴇ ғᴏʀ ᴀʟʟ ᴇxᴄʟᴜsɪᴠᴇ ᴘʀᴇᴍɪᴜᴍ ᴄᴏɴᴛᴇɴᴛ. ᴀs ᴀ ʟɪғᴇᴛɪᴍᴇ ᴍᴇᴍʙᴇʀ, ʏᴏᴜ ʜᴀᴠᴇ ᴀᴄᴄᴇss to ᴇᴠᴇʀʏᴛʜɪɴɢ ʟɪsᴛᴇᴅ ʙᴇʟᴏᴡ. ᴡᴇ'ʟʟ ʙᴇ ᴀᴅᴅɪɴɢ ᴍᴏʀᴇ sᴇʀᴠɪᴄᴇs sᴏᴏɴ!⚡

🔑sᴇʟᴇᴄᴛ ᴀɴ ᴏᴘᴛɪᴏɴ ᴛᴏ ɢᴇᴛ ʏᴏᴜʀ ᴀᴄᴄᴇss ᴅᴇᴛᴀɪʟs
    `;
    const inline_keyboard = [
        [{ text: "🧠 ChatGPT-Pro", callback_data: "premium_service|chatgpt_pro" }, { text: "🎨 Canva Pro", callback_data: "premium_service|canva_pro" }],
        [{ text: "🍿 Netflix 4K", callback_data: "premium_service|netflix" }, { text: "💎 Prime Video", callback_data: "premium_service|prime_video" }],
        [{ text: "👩‍🎓 Perplexity Pro", callback_data: "premium_service|perplexity_pro" }]
    ];
    await sendTelegramMessage(chatId, premiumHubMessage.trim(), { reply_markup: { inline_keyboard } });
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
    await sendTelegramMessage(targetId, "🎉 Congratulations! You have been granted lifetime <b>Premium Access</b> by the admin! You can now download in 1080p/HD quality anytime.", {});
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
        } catch (e) { console.error(`Broadcast failed for user ${userId}:`, e.message); }
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

    if (action === "premium_hub") {
        await deleteMessage(privateChatId, message.message_id).catch(e => console.error(e));
        await handlePremiumHubRequest(privateChatId, userId);
        await answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    if (action === "premium_service") {
        // Double-check premium status before showing details
        const isPremium = await checkPremium(userId);
        if (!isPremium) {
            await answerCallbackQuery(callbackQuery.id, "🚫 Access Denied. This is for lifetime members only.", true);
            return;
        }

        const service = payload;
        let serviceMessage, serviceKeyboard;

        switch(service) {
            case "chatgpt_pro":
                serviceMessage = `
🧠 𝗖𝗵𝗮𝘁𝗚𝗣𝗧 𝗣𝗹𝘂𝘀 𝗔𝗰𝗰𝗲𝘀𝘀 🧠

ʏᴏᴜʀ sᴜʙsᴄʀɪᴘᴛɪᴏɴ ɪs ᴀᴄᴛɪᴠᴇ. ғᴏʟʟᴏᴡ ᴛʜᴇsᴇ sᴛᴇᴘs:

1. ᴄʟɪᴄᴋ ᴛʜᴇ ʟɪɴᴋ ᴛᴏ ᴠᴇʀɪғʏ ʏᴏᴜʀ ᴀᴄᴄᴇss.

2. ʙᴏᴏᴋᴍᴀʀᴋ ᴛʜᴇ ʟɪɴᴋ! ᴛʜɪs ɪs ʏᴏᴜʀ ᴋᴇʏ ғᴏʀ ᴛʜᴇ ɴᴇxᴛ 𝟹𝟼𝟻 ᴅᴀʏs
.
3. ɪғ ʏᴏᴜ ʜᴀᴠᴇ ɪssᴜᴇs, ʀᴇᴏᴘᴇɴ ᴛʜᴇ ʟɪɴᴋ ᴛᴏ ʀᴇғʀᴇsʜ.

<b>‼️ɪᴍᴘᴏʀᴛᴀɴᴛ:</b> ᴜsᴇ ᴀ <b>ᴜsᴀ ᴠᴘɴ</b> ғᴏʀ ʟᴏɢɪɴ.
                `;
                serviceKeyboard = [
                    [{ text: "🔑 Get Access Link", url: "https://www.oxaam.com/serviceaccess.php?activation_key=GW69ETWJYL6Y668" }],
                    [{ text: "🔙 Back to Hub", callback_data: "premium_hub" }]
                ];
                break;

            case "netflix":
                serviceMessage = `
╔═════ ≪ 🔮 ≫ ═════╗
   ❤️‍🔥🍿 <b>N E T F L I X</b> 🍿❤️‍🔥
╚═════ ≪ •❈• ≫ ═════╝
💎✨ <b>P R E M I U M</b> ✨💎

📧 <b>Email:</b> <code>adizaqueen399@gmail.com</code>

🔐 <b>Password:</b> <code>Ghana@2025</code>

✨ <b>Features</b> ✨

📺 4K UHD 🌟
⬇️ Downloads 💾
🌐 Access All Content 🌍
📱 6 Devices Same Time ⌚
                `;
                serviceKeyboard = [[{ text: "🔙 Back to Hub", callback_data: "premium_hub" }]];
                break;

            case "perplexity_pro":
                serviceMessage = `
👩‍🎓 <b>Perplexity Pro Access</b> 👩‍🎓

Here are your login details.

📧 <b>Email:</b> <code>Matrixzat99@gmail.com</code>

<b>Login Instructions:</b>

1. Use the email above to log in.
2. The service will ask for a verification code.
3. Please DM the admin to receive your code.
                `;
                serviceKeyboard = [
                    [{ text: "👨‍💻 DM Admin for Code", url: OWNER_URL }],
                    [{ text: "🔙 Back to Hub", callback_data: "premium_hub" }]
                ];
                break;

            case "canva_pro":
                serviceMessage = `
🎨✨ <b>Canva Pro Account</b> ✨🎨

Your Canva Pro account is ready!

📧 <b>Email:</b> <code>adizaqueen399@gmail.com</code>

<b>Verification:</b>

If Canva asks for a verification code during login, please contact the admin to receive it.
                `;
                serviceKeyboard = [
                    [{ text: "👨‍💻 DM Admin for Code", url: OWNER_URL }],
                    [{ text: "🔙 Back to Hub", callback_data: "premium_hub" }]
                ];
                break;

            case "prime_video":
                serviceMessage = `
╔═════ ≪ •❈• ≫ ═════╗
  🎬🔮 <b>PRIME VIDEO</b> 🔮🎬
╚═════ ≪ •❈• ≫ ═════╝

💎✨ <b>P R E M I U M</b> ✨💎

✨ <b>Features</b> ✨

📺 High Quality Streaming 🌟
⬇️ Downloads 💾
🌐 Prime Video Library 🌍
📱 Multiple Device Support ⌚

<i>Prime Video offers a vast collection of movies, TV shows, and Amazon Originals...</i>
                `;
                serviceKeyboard = [
                    [{ text: "🔮 Download App (APK)", url: "https://www.mediafire.com/file/41l5o85ifyjdohi/Prime_Video_VIP.apk/file" }],
                    [{ text: "🔙 Back to Hub", callback_data: "premium_hub" }]
                ];
                break;
        }

        await editMessageText(serviceMessage, { 
            chat_id: privateChatId, 
            message_id: message.message_id,
            reply_markup: { inline_keyboard: serviceKeyboard }
        });
        await answerCallbackQuery(callbackQuery.id);
        return;
    }

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

    if (action.startsWith("settings") || action === "back_to_settings" || action.startsWith("set_default") || action === "user_stats" || action === "help_menu" || action === "get_premium") {
        await handleSettingsCallbacks(callbackQuery);
        return;
    }

    if (action === "donate_now") {
        await sendDonationMessage(privateChatId);
        await answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // --- TikTok Format Selection ---
    if (action === "tiktok") {
        const [ttAction, ttUrl] = payload.split("~"); // Use ~ as a separator
        await deleteMessage(privateChatId, message.message_id);
        await startTikTokDownload(privateChatId, userId, ttUrl, ttAction);
        return;
    }
    
    // --- YouTube Format Selection (Default) ---
    const [format, videoUrl] = data.split("|");
    await deleteMessage(privateChatId, message.message_id);
    await startDownload(privateChatId, userId, videoUrl, format);
}


// --- Premium System Helpers ---
async function checkPremium(userId) {
    if (userId === ADMIN_ID) return true;
    const userKey = ["users", userId];
    const user = (await kv.get(userKey)).value || {};
    return user.is_permanent_premium;
}

async function spendCredit(chatId, userId) {
    const userKey = ["users", userId];
    let user = (await kv.get(userKey)).value || {};
    const credits = user.premium_credits || 0;

    if (credits > 0) {
        const premiumAccessKey = ["premium_access", userId];
        const newExpiry = Date.now() + (PREMIUM_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000);
        await kv.set(premiumAccessKey, { expires_at: newExpiry });
        user.premium_credits = credits - 1;
        await kv.set(userKey, user);
        await sendTelegramMessage(chatId, `✅ 1 Premium Credit spent! You now have access to premium features for the next <b>${PREMIUM_ACCESS_DURATION_DAYS} days</b>.`, {});
        return true;
    }
    return false;
}

async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    const isUserPremium = await checkPremium(userId);
    
    if (format === '1080' && !isUserPremium) {
        if(!(await spendCredit(chatId, userId))) {
            await sendTelegramMessage(chatId, `⭐ <b>1080p is a Premium Feature!</b>\n\nTo unlock it, refer friends or donate. Use /refer to see your progress.`, {});
            return;
        }
    }
    
    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing YouTube ${format.toUpperCase()}...`);
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
        
        await sendMedia(chatId, fileBlob, fileType, `📥 Downloaded via @${BOT_USERNAME}`, fileName, info.title);
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

async function startTikTokDownload(chatId, userId, url, format) {
    const isUserPremium = await checkPremium(userId);
    
    if (format === 'video_hd' && !isUserPremium) {
        if(!(await spendCredit(chatId, userId))) {
             await sendTelegramMessage(chatId, `⭐ <b>HD Video is a Premium Feature!</b>\n\nTo unlock it, refer friends or donate. Use /refer to see your progress.`, {});
            return;
        }
    }

    const statusMsg = await sendTelegramMessage(chatId, `⏳ Processing TikTok link...`);
    
    try {
        const apiUrl = `${TIKTOK_API_BASE_URL}?url=${encodeURIComponent(url)}`;
        const apiRes = await fetch(apiUrl);
        if (!apiRes.ok) throw new Error("TikTok API failed.");
        
        const data = await apiRes.json();
        if (!data.success || !data.download) throw new Error("Could not retrieve download links from TikTok API.");

        const downloadUrl = data.download[format];
        if (!downloadUrl) throw new Error(`Format "${format}" not available for this TikTok.`);
        
        await editMessageText(`⏳ Download in progress...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
        
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error("Could not download media file from CDN.");
        
        const fileBlob = await fileRes.blob();
        if (fileBlob.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
             await editMessageText(`⚠️ <b>File Is Too Large!</b> (${(fileBlob.size / (1024 * 1024)).toFixed(2)} MB)`, { chat_id: chatId, message_id: statusMsg.result.message_id, reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: downloadUrl }]] } });
             return; 
        }

        await deleteMessage(chatId, statusMsg.result.message_id);

        if (format.startsWith('video')) {
            await sendMedia(chatId, fileBlob, 'video', `📥 Downloaded via @${BOT_USERNAME}`, 'tiktok_video.mp4', data.tiktok_info.title);
        } else {
            await sendMedia(chatId, fileBlob, 'audio', `📥 Downloaded via @${BOT_USERNAME}`, 'tiktok_audio.mp3', data.tiktok_info.title);
        }
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        console.error("TikTok Download Error:", error);
        await editMessageText(`❌ Error downloading TikTok: ${error.message}`, { chat_id: chatId, message_id: statusMsg.result.message_id });
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
    else if (action === "get_premium") {
        await deleteMessage(chatId, messageId);
        await sendPremiumMemberMessage(chatId);
    }
    else if (action === "settings_quality") {
        const userQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Choose your default quality:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: await createQualitySettingsButtons(userQuality, userId) } });
    } else if (action === "set_default") {
        const hasPremium = await checkPremium(userId);
        if(payload === '1080' && !hasPremium) {
             await answerCallbackQuery(callbackQuery.id, "⭐ Premium access is required to set 1080p as default.");
             return;
        }

        payload === "remove" ? await kv.delete(["users", userId, "quality"]) : await kv.set(["users", userId, "quality"], payload);
        const newUserQuality = (await kv.get(["users", userId, "quality"])).value;
        await editMessageText("Default quality updated!", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: await createQualitySettingsButtons(newUserQuality, userId) } });
    } else if (action === "user_stats") {
        const downloads = (await kv.get(["users", userId, "downloads"])).value || 0n;
        await editMessageText(`📊 <b>Your Stats</b>\n\nTotal Downloads: ${downloads.toString()}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "back_to_settings" }]] } });
    } else if (action === "back_to_settings") { await sendSettingsMessage(chatId, messageId, true); }
    else if (action === "help_menu") { 
        const helpMessage = `📖 <b>Help & FAQ</b>

<b>How to Use This Bot:</b>
1️⃣ <b>Search for Music/Videos</b>
Use the <code>/search</code> command followed by a name (e.g., <code>/search shatta wale on god</code>).

2️⃣ <b>Pasting a Link</b>
Send a valid YouTube or TikTok link directly to me.

3️⃣ <b>Inline Mode (In Any Chat)</b>
Type <code>@${BOT_USERNAME}</code> and a search term in any chat.

⭐ <b>How to Get Premium Access:</b>
There are two ways to get premium features:

- <b>Temporary Access:</b> 
Use /refer to invite friends. For every ${REFERRAL_GOAL} referrals, you get a credit for ${PREMIUM_ACCESS_DURATION_DAYS} days of premium.
- <b>Lifetime Access:</b> 
Use /premium_member or /donate to make a one-time donation for permanent premium access. This also includes access to the /premium_hub for exclusive content.

⚙️ <b>Other Commands</b>

/settings - Manage your preferences
/refer - Get your referral link
/feedback - Send a bug reports to admin
/cancel - Cancel the current operation`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
    await answerCallbackQuery(callbackQuery.id);
}

async function sendSettingsMessage(chatId, messageIdToUpdate = null, shouldEdit = false) {
    const settingsMessage = "⚙️ <b>User Settings</b>";
    const inline_keyboard = [
        [{ text: "💎 Get Premium", callback_data: "get_premium" }],
        [{ text: "⚙️ Default Quality", callback_data: "settings_quality" }],
        [{ text: "📊 My Stats", callback_data: "user_stats" }],
        [{ text: "❓ Help & FAQ", callback_data: "help_menu" }]
    ];
    if (shouldEdit) await editMessageText(settingsMessage, { chat_id: chatId, message_id: messageIdToUpdate, reply_markup: { inline_keyboard } });
    else await sendTelegramMessage(chatId, settingsMessage, { reply_markup: { inline_keyboard } });
}

async function sendDonationMessage(chatId) {
    await sendPremiumMemberMessage(chatId);
}

async function createQualitySettingsButtons(currentQuality, userId) {
    const hasPremium = await checkPremium(userId);
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳', '1080': '💎' };
    let buttons = formats.map(f => {
        let text = `${currentQuality === f ? "✅ " : ""}${icons[f]} ${f.toUpperCase()}`;
        if (f === '1080' && !hasPremium) text = `⭐ ${text}`;
        return { text, callback_data: `set_default|${f}` };
    });
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3));
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back", callback_data: "back_to_settings" }]);
    return rows;
}

async function createFormatButtons(videoUrl, userId) {
    const hasPremium = await checkPremium(userId);
    const user = (await kv.get(["users", userId])).value || {};
    const credits = user.premium_credits || 0;
    
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳️', '1080': '💎' };
    
    let rows = [], currentRow = [];
    formats.forEach(f => {
        let buttonText = `${icons[f]} ${f.toUpperCase()}`;
        if (f === '1080' && !hasPremium) {
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

async function createTikTokFormatButtons(url, userId) {
    const hasPremium = await checkPremium(userId);
    const user = (await kv.get(["users", userId])).value || {};
    const credits = user.premium_credits || 0;

    const buttons = [
        { text: `🎬 HD Video ${!hasPremium ? `(⭐ ${credits} credits)` : ''}`, callback_data: `tiktok|video_hd~${url}` },
        { text: "📺 SD Video", callback_data: `tiktok|video_sd~${url}` },
        { text: "🎵 MP3 Audio", callback_data: `tiktok|music~${url}` }
    ];

    return [buttons];
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
async function answerCallbackQuery(id, text, showAlert = false) { return await apiRequest('answerCallbackQuery', { callback_query_id: id, text, show_alert: showAlert }); }


// --- Server Start ---
console.log("Starting Adiza All-In-One Downloader (v67 - Final Premium Hub)...");
Deno.serve(handler);
