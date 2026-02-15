import { bot } from './bot';
import { downloadFile, convertOggToMp3 } from '../stt/voice';
import { transcribeAndParse } from '../stt/gemini';
import path from 'path';
import fs from 'fs';
import { ProductRepository } from '../db/productRepository';
import { generateProductReport } from '../excel/report';
import { InlineKeyboard, InputFile } from 'grammy';
import { BotContext } from './context';
import { googleSheetsService } from '../services/googleSheets';

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

        const user = ctx.from;
        const userName = user.username ? `@${user.username}` : user.first_name;
        const savedToSheets = await googleSheetsService.appendProducts(ctx.session.productsToSave, userName);

        await ctx.answerCallbackQuery("Muvaffaqiyatli saqlandi!");

        let msg = `✅ ${ctx.session.productsToSave.length} ta mahsulot bazaga saqlandi!`;
        if (savedToSheets) {
            msg += `\n📊 Google Sheets ga ham yozildi.`;
        } else if (process.env.GOOGLE_SHEET_ID) {
            msg += `\n⚠️ Google Sheets ga yozishda xatolik (loglarni tekshiring).`;
        }

        await ctx.editMessageText(msg);
        ctx.session.productsToSave = [];
    } catch (e) {
        console.error(e);
        await ctx.answerCallbackQuery("Saqlashda xatolik.");
    }
});

bot.callbackQuery(["cancel_save", "cancel_all"], async (ctx) => {
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

    let totalCostUZS = 0;
    let totalSaleUZS = 0;
    let totalProfitUZS = 0;

    let totalCostUSD = 0;
    let totalSaleUSD = 0;
    let totalProfitUSD = 0;

    recent.forEach((p, i) => {
        const qty = p.quantity || 0;
        const cost = p.cost_price || 0;
        const sale = p.sale_price || 0;
        const currency = p.currency || 'UZS';

        const totalCostItem = qty * cost;
        const totalSaleItem = qty * sale;
        const profitItem = totalSaleItem - totalCostItem;

        if (currency === 'USD') {
            totalCostUSD += totalCostItem;
            totalSaleUSD += totalSaleItem;
            totalProfitUSD += profitItem;
        } else {
            totalCostUZS += totalCostItem;
            totalSaleUZS += totalSaleItem;
            totalProfitUZS += profitItem;
        }

        message += `${i + 1}. <b>${p.name}</b> (${p.category || '-'}, ${p.firma || '-'})\n`;
        message += `   Kod: ${p.code || '-'} | Soni: ${p.quantity || '-'}\n`;
        message += `   Kelish: ${cost} (Jami: ${totalCostItem}) | Sotish: ${sale} (${currency})\n\n`;
    });

    message += `<b>Jami (UZS):</b>\n`;
    message += `Kelish: ${totalCostUZS} | Sotish: ${totalSaleUZS} | Foyda: ${totalProfitUZS}\n\n`;

    if (totalCostUSD > 0 || totalSaleUSD > 0) {
        message += `<b>Jami (USD):</b>\n`;
        message += `Kelish: ${totalCostUSD} | Sotish: ${totalSaleUSD} | Foyda: ${totalProfitUSD}\n`;
    }

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
    // Handle Editing Value Input
    if (ctx.session.step === 'editing' && ctx.session.editingProductId && ctx.session.editingField) {
        const newValue = ctx.message.text;
        const productId = ctx.session.editingProductId;
        const field = ctx.session.editingField;

        try {
            // Validate number fields
            let finalValue: string | number = newValue;
            if (['quantity', 'cost_price', 'sale_price'].includes(field)) {
                const num = parseFloat(newValue);
                if (isNaN(num)) {
                    await ctx.reply("❌ Iltimos, raqam kiriting.");
                    return;
                }
                finalValue = num;
            }

            await ProductRepository.update(productId, { [field]: finalValue });
            await ctx.reply(`✅ Muvaffaqiyatli yangilandi!`);

            // Clear session
            ctx.session.step = 'idle';
            ctx.session.editingProductId = undefined;
            ctx.session.editingField = undefined;

        } catch (e) {
            console.error(e);
            await ctx.reply("❌ Yangilashda xatolik.");
        }
        return;
    }

    if (ctx.session.step === 'searching') {
        const query = ctx.message.text;
        if (!ctx.from) return;
        const userId = ctx.from.id;

        try {
            const results = await ProductRepository.search(userId, query);
            if (results.length === 0) {
                await ctx.reply("❌ Hech narsa topilmadi.");
            } else {
                await ctx.reply(`🔍 <b>Topilgan mahsulotlar:</b> ${results.length} ta`, { parse_mode: "HTML" });

                // Send messages with buttons for each product (limit to first 10 to avoid spam)
                const limitedResults = results.slice(0, 10);
                for (const p of limitedResults) {
                    const message = `<b>${p.name}</b>\n` +
                        `Firma: ${p.firma || '-'}\n` +
                        `Kod: ${p.code || '-'}\n` +
                        `Soni: ${p.quantity} | K: ${p.cost_price} | S: ${p.sale_price}`;

                    const keyboard = new InlineKeyboard()
                        .text("✏️ Tahrirlash", `edit_prod_${p.id}`)
                        .text("🗑 O'chirish", `del_prod_${p.id}`);

                    await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
                }

                if (results.length > 10) {
                    await ctx.reply("... va yana boshqalar. Aniqroq qidirishga harakat qiling.");
                }
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

// Delete Handler
bot.callbackQuery(/^del_prod_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    try {
        await ProductRepository.delete(id);
        await ctx.answerCallbackQuery("O'chirildi");
        await ctx.editMessageText("🗑 Mahsulot o'chirildi.");
    } catch (e) {
        console.error(e);
        await ctx.answerCallbackQuery("Xatolik");
    }
});

// Edit Init Handler
bot.callbackQuery(/^edit_prod_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    ctx.session.editingProductId = id;
    ctx.session.step = 'editing'; // We'll set step but wait for field selection

    // Show field selection menu
    const keyboard = new InlineKeyboard()
        .text("Nomi", `edit_field_name_${id}`).text("Mashina", `edit_field_category_${id}`).row()
        .text("Firma", `edit_field_firma_${id}`).text("Kodi", `edit_field_code_${id}`).row()
        .text("Soni", `edit_field_quantity_${id}`).text("Kelish", `edit_field_cost_price_${id}`).row()
        .text("Sotish", `edit_field_sale_price_${id}`);

    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
    await ctx.answerCallbackQuery("Tahrirlash uchun maydonni tanlang");
});

// Edit Field Handler
bot.callbackQuery(/^edit_field_(\w+)_(\d+)$/, async (ctx) => {
    const field = ctx.match[1];
    const id = parseInt(ctx.match[2]);

    ctx.session.editingProductId = id;
    ctx.session.editingField = field;
    ctx.session.step = 'editing';

    const fieldMap: any = {
        name: "Maxsulot nomi",
        category: "Mashina turi",
        firma: "Firma",
        code: "Kodi",
        quantity: "Soni",
        cost_price: "Kelish narxi",
        sale_price: "Sotish narxi"
    };

    const label = fieldMap[field] || field;

    await ctx.reply(`✍️ <b>${label}</b> uchun yangi qiymatni yozing:`, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});
