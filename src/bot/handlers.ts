import { bot } from './bot';
import { downloadFile, convertOggToMp3 } from '../stt/voice';
import { transcribeAndParse } from '../stt/gemini';
import path from 'path';
import fs from 'fs';
import { ProductRepository } from '../db/productRepository';
import { generateProductReport } from '../excel/report';
import { InlineKeyboard, InputFile } from 'grammy';
import { BotContext } from './context';

bot.on('message:voice', async (ctx) => {
    const voice = ctx.message.voice;
    const file = await ctx.getFile();
    const filePath = file.file_path;
    const fileId = voice.file_id;

    // Manual file URL construction as fallback/standard
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;

    await ctx.reply("🔊 Ovozli xabar qabul qilindi. Tahlil qilinmoqda... ⏳");

    try {
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const oggPath = path.join(tempDir, `${fileId}.ogg`);
        const mp3Path = path.join(tempDir, `${fileId}.mp3`);

        await downloadFile(fileUrl, oggPath);
        await convertOggToMp3(oggPath, mp3Path);

        const products = await transcribeAndParse(mp3Path);

        // Clean up files
        fs.unlinkSync(oggPath);
        fs.unlinkSync(mp3Path);

        if (!products || products.length === 0) {
            await ctx.reply("⚠️ Mahsulot ma'lumotlarini aniqlab bo'lmadi. Qaytadan urinib ko'ring yoki aniqroq gapiring.");
            return;
        }

        // Save to session for confirmation
        ctx.session.productsToSave = products;

        const validProducts = ctx.session.productsToSave;
        let message = `📝 <b>Tasdiqlash</b> (${validProducts.length} ta mahsulot):\n\n`;

        validProducts.forEach((p, i) => {
            message += `<b>${i + 1}. ${p.name || 'Nomsiz'}</b>\n`;
            message += `Mashina: ${p.category || '-'}\n`;
            message += `Firma: ${p.firma || '-'}\n`;
            message += `Kod: ${p.code || '-'}\n`;
            message += `Soni: ${p.quantity || '-'}\n`;
            message += `Kelish: ${p.cost_price || '-'} ${p.currency || 'UZS'}\n`;
            message += `Sotish: ${p.sale_price || '-'} ${p.currency || 'UZS'}\n\n`;
        });

        // Inline Keyboard
        const keyboard = new InlineKeyboard()
            .text("✅ Saqlash", "confirm_save")
            .text("❌ Bekor qilish", "cancel_save");

        await ctx.reply(message, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });

    } catch (error) {
        console.error("Error processing voice:", error);
        await ctx.reply("❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
});

bot.callbackQuery("confirm_save", async (ctx) => {
    if (!ctx.session.productsToSave || ctx.session.productsToSave.length === 0) {
        await ctx.answerCallbackQuery("Saqlash uchun mahsulot yo'q.");
        await ctx.editMessageText("⏳ Sessiya muddati tugagan yoki bo'sh.");
        return;
    }

    try {
        const userId = ctx.from.id;
        for (const p of ctx.session.productsToSave) {
            await ProductRepository.create({
                user_id: userId,
                name: p.name || 'Nomsiz',
                category: p.category,
                firma: p.firma,
                code: p.code,
                quantity: p.quantity || 0,
                cost_price: p.cost_price,
                sale_price: p.sale_price,
                currency: p.currency || 'UZS'
            });
        }

        await ctx.answerCallbackQuery("Muvaffaqiyatli saqlandi!");
        await ctx.editMessageText(`✅ ${ctx.session.productsToSave.length} ta mahsulot saqlandi!`);
        ctx.session.productsToSave = [];
    } catch (e) {
        console.error(e);
        await ctx.answerCallbackQuery("Saqlashda xatolik.");
    }
});

bot.callbackQuery("cancel_save", async (ctx) => {
    ctx.session.productsToSave = [];
    await ctx.answerCallbackQuery("Bekor qilindi");
    await ctx.editMessageText("❌ Operatsiya bekor qilindi.");
});

bot.command('report', async (ctx) => {
    await handleReport(ctx as any);
});

bot.command('print', async (ctx) => {
    await handlePrint(ctx as any);
});

// --- Menu Handlers ---

bot.hears("📄 Excel Hisobot", async (ctx) => {
    await handleReport(ctx);
});

bot.hears("🖨 Ko'rish", async (ctx) => {
    await handlePrint(ctx);
});

bot.hears("➕ Mahsulot qo'shish (Ovozli)", async (ctx) => {
    await ctx.reply("🎤 Iltimos, mahsulotlar haqida ovozli xabar yuboring.");
});

bot.hears("🗑 Oxirgisini o'chirish", async (ctx) => {
    await handleDeleteLast(ctx);
});

bot.hears("🔍 Qidirish", async (ctx) => {
    ctx.session.step = 'searching';
    await ctx.reply("🔍 Qidirayotgan mahsulot nomini yoki kodini yozing:");
});


async function handleReport(ctx: BotContext) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    const products = await ProductRepository.getByUserId(userId);

    if (products.length === 0) {
        await ctx.reply("❌ Hozircha mahsulot yo'q.");
        return;
    }

    await ctx.reply("⏳ Excel fayl tayyorlanmoqda...");
    const filePath = await generateProductReport(products);

    await ctx.replyWithDocument(new InputFile(filePath));
}

async function handlePrint(ctx: BotContext) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    const products = await ProductRepository.getByUserId(userId);

    if (products.length === 0) {
        await ctx.reply("❌ Hozircha mahsulot yo'q.");
        return;
    }

    let message = "📋 <b>Oxirgi mahsulotlar:</b>\n\n";
    // Show last 10
    const recent = products.slice(0, 10);

    recent.forEach((p, i) => {
        message += `${i + 1}. <b>${p.name}</b> (${p.category || '-'}, ${p.firma || '-'})\n`;
        message += `   Kod: ${p.code || '-'} | Soni: ${p.quantity || '-'}\n`;
        message += `   Kelish: ${p.cost_price || '-'} | Sotish: ${p.sale_price || '-'} (${p.currency || 'UZS'})\n\n`;
    });

    await ctx.reply(message, { parse_mode: "HTML" });
}

async function handleDeleteLast(ctx: BotContext) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    try {
        const lastProduct = await ProductRepository.getLastProduct(userId);

        if (!lastProduct || !lastProduct.id) {
            await ctx.reply("❌ O'chirish uchun mahsulot yo'q.");
            return;
        }

        await ProductRepository.delete(lastProduct.id);
        await ctx.reply(`✅ Oxirgi mahsulot o'chirildi: <b>${lastProduct.name}</b>`, { parse_mode: "HTML" });
    } catch (e) {
        console.error(e);
        await ctx.reply("❌ O'chirishda xatolik.");
    }
}

// Search Logic
bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step === 'searching') {
        const query = ctx.message.text;
        if (!ctx.from) return;
        const userId = ctx.from.id;

        try {
            const results = await ProductRepository.search(userId, query);
            if (results.length === 0) {
                await ctx.reply("❌ Hech narsa topilmadi.");
            } else {
                let message = `🔍 <b>Topilgan mahsulotlar</b> (${results.length} ta):\n\n`;
                results.forEach(p => {
                    message += `<b>${p.name}</b> (${p.code || '-'} | ${p.firma || '-'})\n`;
                    message += `Soni: ${p.quantity} | K: ${p.cost_price} | S: ${p.sale_price}\n\n`;
                });
                // Truncate if too long (simple check)
                if (message.length > 4000) message = message.substring(0, 4000) + "...";

                await ctx.reply(message, { parse_mode: "HTML" });
            }
        } catch (e) {
            console.error(e);
            await ctx.reply("❌ Qidirishda xatolik.");
        }
        ctx.session.step = 'idle';
        return;
    }
    await next();
});
