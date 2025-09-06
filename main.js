// --- Bot Configuration ---
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
// NEW: Switched to your personal Python yt-dlp API server
const YTDLP_API_BASE_URL = "http://falcon.godpapa.xyz:25565"; 
const TIKTOK_API_BASE_URL = "https://adiza-tiktokpro-downloader.matrixzat99.workers.dev"; // This remains for TikTok
const WELCOME_PHOTO_URLS = [
    "https://i.ibb.co/dZ7cvt5/233-59-373-4312-20250515-183222.jpg",
    "https://files.catbox.moe/hbbayg.jpg",
    "https://files.catbox.moe/jadrbj.jpg",
    "https://files.catbox.moe/7x9dwj.jpg",
    "https://files.catbox.moe/u7qhlg.jpg",
    "https://files.catbox.moe/pcla4l.jpg"
];
export const OWNER_URL = "https://t.me/Matrixxxxxxxxx";
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb5JJ438kyyGlFHTyZ0n";
const BOT_USERNAME = "adiza_ytdownloader_bot";
const DONATE_URL = "https://paystack.com/pay/adiza-bot-donate";
const ADMIN_ID = 853645999;
const REFERRAL_GOAL = 2;
const PREMIUM_ACCESS_DURATION_DAYS = 7;
const FETCH_TIMEOUT_MS = 90000; // Increased to 90 seconds for API calls
const MAX_FILE_SIZE_MB = 50; // File size limit for sending directly

// --- External Libraries ---
import YouTube from "https://esm.sh/youtube-search-api@1.2.1";

// --- Import Custom Modules ---
import { handlePremiumHubRequest, handlePremiumServiceCallback } from './premium_hub.js';

// --- Deno KV Database ---
const kv = await Deno.openKv();

// --- Array of Welcome Sticker File IDs ---
const WELCOME_STICKER_IDS = [
    "CAACAgIAAxkBAAE6q6Vou5NXUTp2vrra9Rxf0LPiUgcuXwACRzkAAl5WcUpWHeyfrD_F3jYE", "CAACAgIAAxkBAAE6q6Nou5NDyKtMXVG-sxOPQ_hZlvuaQAACCwEAAlKJkSNKMfbkP3tfNTYE",
    "CAACAgIAAxkBAAE6q6Fou5MX6nv0HE5duKOzHhvyR08osQACRgADUomRI_j-5eQK1QodNgQ", "CAACAgIAAxkBAAE6q59ou5MNTS_iZ5hTleMdiDQbVuh4rQACSQADUomRI4zdJVjkz_fvNgQ",
    "CAACAgIAAxkBAAE6q51ou5L3EZV6j-3b2pPqjIEN4ewQgAAC1QUAAj-VzAr0FV2u85b8KDYE"
];

// --- State Management ---
const userState = new Map();

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
        case "/start": await handleStart(message, args[0]); break;
        case "/settings": await sendSettingsMessage(chatId); break;
        case "/donate": await sendDonationMessage(chatId); break;
        case "/refer": await sendReferralMessage(chatId, userId); break;
        case "/premium_member": await sendPremiumMemberMessage(chatId); break;
        case "/premium_hub": await handlePremiumHubRequest(chatId, userId); break;
        case "/feedback": await requestFeedback(chatId, userId); break;
        case "/cancel": userState.delete(userId); await sendTelegramMessage(chatId, "Operation canceled."); break;
        case "/search": 
            if (payload) { await handleSearch(chatId, payload); } 
            else { await sendTelegramMessage(chatId, "Please provide a search term. Usage: /search song name"); }
            break;
        default:
            if (text.includes("youtube.com/") || text.includes("youtu.be/")) {
                await sendTelegramMessage(chatId, "Please choose a format to download:", { reply_markup: { inline_keyboard: await createFormatButtons(text, userId) } });
            } else if (text.includes("tiktok.com/")) {
                await handleTikTokLink(chatId, userId, text);
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
                    await sendTelegramMessage(parseInt(referrerId), `🎉 <b>+1 Premium Credit!</b>\n\nYou've successfully referred ${REFERRAL_GOAL} users and earned a credit.`, {});
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
sᴇɴᴅ ᴀ ʏᴏᴜᴛᴜʙᴇ ᴏʀ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋ, ᴏʀ ᴜsᴇ /settings ᴛᴏ sᴇᴇ ᴀʟʟ ᴏᴜʀ ᴄᴏᴍᴍᴀɴᴅs.
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

async function handleTikTokLink(chatId, userId, url) {
    await sendTelegramMessage(chatId, "🔮 TikTok link detected! Choose your download format:", {
        reply_markup: { inline_keyboard: await createTikTokFormatButtons(url, userId) }
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
    
    const inline_keyboard = [[{ text: "📲 Share Your Link", switch_inline_query: `Join me on this awesome bot! ${referralLink}` }]];
    await sendTelegramMessage(chatId, message.trim(), { reply_markup: { inline_keyboard }});
}

async function sendPremiumMemberMessage(chatId) {
    const premiumMessage = `
💎 <b>ʟɪғᴇᴛɪᴍᴇ ᴘʀᴇᴍɪᴜᴍ ᴍᴇᴍʙᴇʀ!</b> 💎
Support the bot's development with a one-time donation to get <b>lifetime premium access</b>.

✨ <b>Benefits:</b>
- 🎬 Unlimited 1080p YT downloads.
- 🚀 Unlimited HD TikTok downloads. 
- ⚡ Priority access to new features. 
- 🍿 Access to the Premium Hub.

To get started, simply make a donation of not less than 4$ through our secure Paystack link. After donating, please contact the admin with a screenshot of your receipt.
    `;
    const inline_keyboard = [
        [{ text: "💳 Donate Now for Lifetime Access", url: DONATE_URL }],
        [{ text: "👑 Contact Admin After Donating", url: OWNER_URL }]
    ];
    await sendTelegramMessage(chatId, premiumMessage.trim(), { reply_markup: { inline_keyboard }});
}

async function requestFeedback(chatId, userId) {
    userState.set(userId, 'awaiting_feedback');
    await sendTelegramMessage(chatId, "📝 Please send your feedback. Use /cancel to abort.");
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
        await sendTelegramMessage(message.chat.id, "Invalid User ID.");
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
    await sendTelegramMessage(targetId, "🎉 Congratulations! You have been granted lifetime <b>Premium Access</b>!", {});
}

async function handleBroadcast(message, payload) {
    if (!payload) {
        await sendTelegramMessage(message.chat.id, "⚠️ Please provide a message to broadcast.");
        return;
    }
    const users = [];
    for await (const entry of kv.list({ prefix: ["users"] })) { users.push(entry.key[1]); }
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
    const videoUrl = payloadParts.join("|");
    
    // --- Inline Mode Handler ---
    if (inline_message_id) {
        if (action === "formats") {
             const videoId = payloadParts[0];
             await answerCallbackQuery(callbackQuery.id);
             const formatButtons = await createInlineFormatButtons(videoId, userId);
             await editMessageText("Choose a format to download:", {inline_message_id, reply_markup: {inline_keyboard: formatButtons}});
        } else {
            // This handles the format selection from an inline message
            await answerCallbackQuery(callbackQuery.id);
            const [format, videoId] = action.split(":");
            await editMessageText("✅ Request accepted! Sending file to our private chat.", { inline_message_id, reply_markup: {inline_keyboard: []} });
            await startDownload(userId, userId, `https://youtu.be/${videoId}`, format, true, inline_message_id);
        }
        return;
    }
    
    const privateChatId = message.chat.id;

    // --- Regular Chat Handler ---
    if (action.startsWith("settings") || action === "back_to_settings" || action.startsWith("set_default") || action === "user_stats" || action === "help_menu" || action === "get_premium") {
        await handleSettingsCallbacks(callbackQuery);
        await answerCallbackQuery(callbackQuery.id);
        return;
    }

    switch (action) {
        case "premium_hub":
            await deleteMessage(privateChatId, message.message_id).catch(e => console.error(e));
            await handlePremiumHubRequest(privateChatId, userId);
            break;
        case "premium_service":
            await handlePremiumServiceCallback(callbackQuery);
            break;
        case 'select_video':
            const videoId = payloadParts[0];
            await deleteMessage(privateChatId, message.message_id); 
            await sendTelegramMessage(privateChatId, "✅ Video selected. Now, choose a format:", {
                reply_markup: { inline_keyboard: await createFormatButtons(`https://youtu.be/${videoId}`, userId) }
            });
            break;
        case "donate_now":
            await sendDonationMessage(privateChatId);
            break;
        case "tiktok":
            const [ttAction, ttUrl] = payloadParts.join("|").split("~");
            await deleteMessage(privateChatId, message.message_id);
            await startTikTokDownload(privateChatId, userId, ttUrl, ttAction);
            break;
        default:
            // This handles all format buttons (mp3, 720, 1080, etc.)
            await deleteMessage(privateChatId, message.message_id);
            await startDownload(privateChatId, userId, videoUrl, action);
            break;
    }
    await answerCallbackQuery(callbackQuery.id);
}


// --- Premium System Helpers ---
export async function checkPremium(userId) {
    if (userId === ADMIN_ID) return true;
    const userKey = ["users", userId];
    const user = (await kv.get(userKey)).value || {};
    if (user.is_permanent_premium) return true;
    const premiumAccessKey = ["premium_access", userId];
    const premiumInfo = (await kv.get(premiumAccessKey)).value || {};
    return premiumInfo.expires_at && premiumInfo.expires_at > Date.now();
}

async function spendCredit(chatId, userId) {
    const userKey = ["users", userId];
    const user = (await kv.get(userKey)).value;
    if (!user || (user.premium_credits || 0) === 0) return false;

    const premiumAccessKey = ["premium_access", userId];
    const premiumInfo = (await kv.get(premiumAccessKey)).value || { expires_at: 0 };
    
    const now = Date.now();
    const startTime = premiumInfo.expires_at > now ? premiumInfo.expires_at : now;
    const newExpiry = startTime + (PREMIUM_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await kv.set(premiumAccessKey, { expires_at: newExpiry });
    user.premium_credits -= 1;
    await kv.set(userKey, user);
    
    const expiryDate = new Date(newExpiry).toLocaleString();
    await sendTelegramMessage(chatId, `✅ <b>1 Premium Credit spent!</b>\n\nYou now have premium access until: ${expiryDate}`, {});
    return true;
}

// --- Helper: Get File Size ---
async function getFileSize(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    try {
        const response = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok && response.headers.has("content-length")) {
            const sizeInBytes = Number(response.headers.get("content-length"));
            return sizeInBytes / (1024 * 1024);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name !== 'AbortError') console.error("Could not get file size:", error.message);
    }
    return null;
}

// --- YouTube Download Function with File Size Check ---
async function startDownload(chatId, userId, videoUrl, format, isInline = false, inlineMessageId = null) {
    let isUserPremium = await checkPremium(userId);

    if (format === '1080' && !isUserPremium) {
        const creditSpent = await spendCredit(chatId, userId);
        if (!creditSpent) {
            await sendTelegramMessage(chatId, `⭐ <b>1080p is a Premium Feature!</b>\n\nUse /refer or /donate to unlock it.`, {});
            return;
        }
    }

    const statusMsg = isInline ? null : await sendTelegramMessage(chatId, `⏳ Processing YouTube ${format.toUpperCase()}...`);
    const editTarget = isInline ? { inline_message_id: inlineMessageId } : { chat_id: chatId, message_id: statusMsg.result.message_id };

    try {
        const isAudio = format === 'mp3';
        const endpoint = isAudio ? 'ytmp3' : 'ytmp4fhd'; 
        const apiRequestUrl = `${YTDLP_API_BASE_URL}/download/${endpoint}?url=${encodeURIComponent(videoUrl)}`;
        
        console.log(`Calling API-Endpoint: ${apiRequestUrl}`);
        
        const apiResponse = await fetch(apiRequestUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!apiResponse.ok) throw new Error(`Your API server responded with status: ${apiResponse.status}`);
        
        const data = await apiResponse.json();
        if (!data.success || !data.result || !data.result.download_url) throw new Error(data.message || "API did not return a valid download URL.");
        
        const finalDownloadUrl = data.result.download_url;

        // --- OLD LOGIC RESTORED: File size check for ALL formats ---
        if (!isInline) await editMessageText(`🔎 Checking file size...`, editTarget);
        const fileSizeMB = await getFileSize(finalDownloadUrl);

        if (fileSizeMB && fileSizeMB > MAX_FILE_SIZE_MB) {
            const messageText = `⚠️ <b>File is Too Large!</b> (${fileSizeMB.toFixed(2)} MB)\n\nPlease use the link below to download it externally.`;
            if (isInline) {
                 await sendTelegramMessage(chatId, `🔗 <b>External Link:</b> ${finalDownloadUrl}`);
            } else {
                 await editMessageText(messageText, { ...editTarget, reply_markup: { inline_keyboard: [[{ text: `🔗 Download Externally`, url: finalDownloadUrl }]] } });
            }
            return; // Exit after sending the link
        }
        
        // If file is small enough, proceed with download
        if (!isInline) await editMessageText(`✅ Download in progress...`, editTarget);
        
        const finalFileResponse = await fetch(finalDownloadUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!finalFileResponse.ok) throw new Error(`Failed to download from the cached link: ${finalDownloadUrl}`);

        const fileBlob = await finalFileResponse.blob();
        const fileType = isAudio ? 'audio' : 'video';
        const safeTitle = (data.result.title || 'media').replace(/[^\w\s.-]/gi, '_');
        const fileName = `${safeTitle}.${fileType === 'audio' ? 'mp3' : 'mp4'}`;
        
        if (!isInline) await editMessageText(`✅ Uploading to you...`, editTarget);

        await sendMedia(chatId, fileBlob, fileType, `📥 Downloaded via @${BOT_USERNAME}`, fileName, data.result.title);
        if (!isInline && statusMsg) await deleteMessage(chatId, statusMsg.result.message_id);
        
        await kv.atomic().sum(["users", userId, "downloads"], 1n).commit();

    } catch (error) {
        console.error("Download logic error:", error);
        const errorMessage = error.name === 'TimeoutError' 
            ? `❌ **Request Timed Out!** Your server took too long.`
            : `❌ **An Error Occurred!**\n\n<i>${error.message}</i>`;
        
        if (statusMsg && !isInline) {
            await editMessageText(errorMessage, editTarget);
        } else if (isInline) {
            await sendTelegramMessage(chatId, errorMessage);
        }
    }
}

// --- TikTok Download Function (Unchanged) ---
async function startTikTokDownload(chatId, userId, url, format) {
    // This part remains unchanged as it uses a different API
    let isUserPremium = await checkPremium(userId);
    if (format === 'video_hd' && !isUserPremium) {
        if(!(await spendCredit(chatId, userId))) {
             await sendTelegramMessage(chatId, `⭐ <b>HD Video is a Premium Feature!</b>\n\nUse /refer or /donate.`, {});
            return;
        }
    }
    const statusMsg = await sendTelegramMessage(chatId, `⏳ Processing TikTok link...`);
    try {
        const apiUrl = `${TIKTOK_API_BASE_URL}?url=${encodeURIComponent(url)}`;
        const apiRes = await fetch(apiUrl);
        if (!apiRes.ok) throw new Error("TikTok API failed.");
        const data = await apiRes.json();
        if (!data.success || !data.download) throw new Error("Could not get TikTok info from API.");
        const downloadUrl = data.download[format];
        if (!downloadUrl) throw new Error(`Format "${format}" not available.`);
        await editMessageText(`⏳ Download in progress...`, { chat_id: chatId, message_id: statusMsg.result.message_id });
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error("Could not download media file from CDN.");
        const fileBlob = await fileRes.blob();
        await deleteMessage(chatId, statusMsg.result.message_id);
        const fileType = format.startsWith('video') ? 'video' : 'audio';
        const fileName = `tiktok_${fileType}.${fileType === 'video' ? 'mp4' : 'mp3'}`;
        await sendMedia(chatId, fileBlob, fileType, `📥 Downloaded via @${BOT_USERNAME}`, fileName, data.tiktok_info.title);
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
    else if (action === "get_premium") { await deleteMessage(chatId, messageId); await sendPremiumMemberMessage(chatId); }
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
1️⃣ <b>Search for Music/Videos</b>: Use <code>/search</code>.
2️⃣ <b>Pasting a Link</b>: Send a YouTube or TikTok link.
3️⃣ <b>Inline Mode</b>: Type <code>@${BOT_USERNAME}</code> and a search term.

⭐ <b>How to Get Premium Access:</b>
- <b>Temporary:</b> Use /refer.
- <b>Lifetime:</b> Use /premium_member.

⚙️ <b>Other Commands</b>
/settings, /refer, /feedback, /cancel`;
        await editMessageText(helpMessage, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "back_to_settings" }]] } });
    }
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

// FULL FORMAT LIST RESTORED
async function createQualitySettingsButtons(currentQuality, userId) {
    const hasPremium = await checkPremium(userId);
    const formats = ['mp3', '144', '240', '360', '480', '720', '1080'];
    const icons = { 'mp3': '🎵', '144': '📼', '240': '⚡', '360': '🔮', '480': '📺', '720': '🗳️', '1080': '💎' };
    
    let buttons = formats.map(f => {
        let text = `${currentQuality === f ? "✅ " : ""}${icons[f]} ${f.toUpperCase()}`;
        if (f === '1080' && !hasPremium) text = `⭐ ${text}`;
        return { text, callback_data: `set_default|${f}` };
    });
    
    let rows = [];
    while (buttons.length > 0) rows.push(buttons.splice(0, 3)); // 3 buttons per row
    rows.push([{ text: "❌ Remove Default", callback_data: "set_default|remove" }, { text: "🔙 Back", callback_data: "back_to_settings" }]);
    return rows;
}

// FULL FORMAT LIST RESTORED
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
        if(currentRow.length === 3) { // 3 buttons per row
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

// FULL FORMAT LIST RESTORED
async function createInlineFormatButtons(videoId, userId) {
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
        currentRow.push({ text: buttonText, callback_data: `${f}:${videoId}` });
        if(currentRow.length === 3) {
            rows.push(currentRow);
            currentRow = [];
        }
    });
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}

// --- Telegram API Helpers ---
export async function sendMedia(chatId, blob, type, caption, fileName, title) {
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

export async function apiRequest(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  return res.json();
}
export async function sendTelegramMessage(chatId, text, extra = {}) { return await apiRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }); }
export async function sendPhoto(chatId, photo, caption, extra = {}) { return await apiRequest('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra }); }
export async function sendSticker(chatId, sticker) { return await apiRequest('sendSticker', { chat_id: chatId, sticker }); }
export async function editMessageText(text, extra = {}) { return await apiRequest('editMessageText', { text, parse_mode: 'HTML', ...extra }); }
export async function deleteMessage(chatId, messageId) { return await apiRequest('deleteMessage', { chat_id: chatId, message_id: messageId }); }
export async function answerCallbackQuery(id, text, showAlert = false) { return await apiRequest('answerCallbackQuery', { callback_query_id: id, text, show_alert: showAlert }); }

// --- Server Start ---
console.log("Starting Adiza Bot (v81 - FINAL)...");
Deno.serve(handler);
