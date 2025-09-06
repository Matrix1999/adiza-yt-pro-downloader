// --- Import Shared Functions & Constants ---
// Note: We need to import the functions and constants used by this module.
// It's best practice to create a 'helpers.js' and 'config.js' for this.
// For now, we will import them from where they would be in 'main.js' or a new 'helpers.js'
import { sendTelegramMessage, editMessageText, answerCallbackQuery, deleteMessage } from './helpers.js';
import { OWNER_URL } from './config.js';
import { checkPremium } from './main.js'; // Assuming checkPremium stays in main for now

// --- Premium Hub Handlers ---

export async function handlePremiumHubRequest(chatId, userId) {
    const isPremium = await checkPremium(userId);
    if (!isPremium) {
        await sendTelegramMessage(chatId, `
🔑🚫 <b>Access Denied</b> 🚫🔑

ᴛʜɪs <b>ᴘʀᴇᴍɪᴜᴍ ʜᴜʙ</b> ɪs ᴇxᴄʟᴜsɪᴠᴇʟʏ ғᴏʀ ᴏᴜʀ 💎ʟɪғᴇᴛɪᴍᴇ ᴘʀᴇᴍɪᴜᴍ ᴍᴇᴍʙᴇʀs💎 ᴡʜᴏ ʜᴀᴠᴇ sᴜᴘᴘᴏʀᴛᴇᴅ ᴛʜᴇ ʙᴏᴛ ᴛʜʀᴏᴜɢʜ ᴀ ᴅᴏɴᴀᴛɪᴏɴ💰.

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

export async function handlePremiumServiceCallback(callbackQuery) {
    const { data, message, from } = callbackQuery;
    const userId = from.id;
    const privateChatId = message.chat.id;

    const isPremium = await checkPremium(userId);
    if (!isPremium) {
        await answerCallbackQuery(callbackQuery.id, "🚫 Access Denied. This is for lifetime members only.", true);
        return;
    }

    const service = data.split("|")[1];
    let serviceMessage, serviceKeyboard;

    switch (service) {
        case "chatgpt_pro":
            serviceMessage = `
🧠 𝗖𝗵𝗮𝘁𝗚𝗣𝗧 𝗣𝗹𝘂𝘀 𝗔𝗰𝗰𝗲𝘀𝘀 🧠

ʏᴏᴜʀ sᴜʙsᴄʀɪᴘᴛɪᴏɴ ɪs ᴀᴄᴛɪᴠᴇ. ғᴏʟʟᴏᴡ ᴛʜᴇsᴇ sᴛᴇᴘs:

1. ᴄʟɪᴄᴋ ᴛʜᴇ ʟɪɴᴋ ᴛᴏ ᴠᴇʀɪғʏ ʏᴏᴜʀ ᴀᴄᴄᴇss.
2. ʙᴏᴏᴋᴍᴀʀᴋ ᴛʜᴇ ʟɪɴᴋ! ᴛʜɪs ɪs ʏᴏᴜʀ ᴋᴇʏ ғᴏʀ ᴛʜᴇ ɴᴇxᴛ 𝟹𝟼𝟻 ᴅᴀʏs.
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
}
