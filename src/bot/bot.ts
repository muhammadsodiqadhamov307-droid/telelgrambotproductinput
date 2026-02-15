import { Bot, session, Keyboard } from 'grammy';
import dotenv from 'dotenv';
import { BotContext, SessionData } from './context';
import { initDB } from '../db/db';

dotenv.config();

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is missing');
}

export const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

function initialSession(): SessionData {
    return { step: 'idle' };
}

bot.use(session({ initial: initialSession }));

const mainMenu = new Keyboard()
    .text("➕ Add Product (Voice)").row()
    .text("📄 Report Excel").text("🖨 Print View").row()
    .text("🗑 Delete Last").text("🔍 Search").resized();

bot.command("start", async (ctx) => {
    await ctx.reply(
        "Assalomu alaykum! 👋\n\n" +
        "Men mahsulotlarni kiritishga yordam beradigan botman.\n" +
        "Ovozli xabar yuboring va men uni Excelga tayyorlab beraman.\n\n" +
        "Buyruqlar:\n" +
        "/help - Yordam",
        {
            reply_markup: {
                keyboard: [
                    [{ text: "➕ Mahsulot qo'shish (Ovozli)" }],
                    [{ text: "📄 Excel Hisobot" }, { text: "🖨 Ko'rish" }],
                    [{ text: "🗑 Oxirgisini o'chirish" }, { text: "🔍 Qidirish" }]
                ],
                resize_keyboard: true
            }
        }
    );
});

bot.command("help", async (ctx) => {
    await ctx.reply(
        "Yordam:\n" +
        "1. 🎤 Ovozli xabar yuboring (Masalan: 'Lacetti zupchatka powergrip, kodi 5499, 10 dona, kelish 10.4 dollar, sotish 13 dollar').\n" +
        "2. 🤖 Men uni tahlil qilib, tasdiqlash uchun yuboraman.\n" +
        "3. ✅ 'Saqlash' tugmasini bosing.\n" +
        "4. 📄 'Excel Hisobot' orqali faylni yuklab oling."
    );
});

// Error handling
bot.catch((err) => {
    console.error('Error in bot:', err);
});

import './handlers';

export const startBot = async () => {
    await initDB();
    console.log('Bot starting...');
    bot.start();
};
