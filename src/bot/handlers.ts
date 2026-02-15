import { bot } from './bot';
import { downloadFile, convertOggToMp3 } from '../stt/voice';
import { transcribeAndParse } from '../stt/gemini';
import path from 'path';
import fs from 'fs';
import { ProductRepository } from '../db/productRepository';
import { generateProductReport } from '../excel/report';
import { InlineKeyboard, InputFile } from 'grammy';

bot.on('message:voice', async (ctx) => {
    const voice = ctx.message.voice;
    const file = await ctx.getFile();
    const filePath = file.file_path;

    // Get file URL
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;

    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const oggPath = path.join(tempDir, `${voice.file_id}.ogg`);
    const mp3Path = path.join(tempDir, `${voice.file_id}.mp3`);

    await ctx.reply("Processing voice message... ⏳");

    try {
        await downloadFile(fileUrl, oggPath);
        await convertOggToMp3(oggPath, mp3Path);

        const products = await transcribeAndParse(mp3Path);

        if (products.length === 0) {
            await ctx.reply("Could not extract any products. Please try again.");
            return;
        }

        // Save to session for confirmation
        ctx.session.productsToSave = products;

        // Construct message
        let message = "✅ Parsed Products:\n\n";
        products.forEach((p, i) => {
            message += `*Product ${i + 1}*\n`;
            message += `Name: ${p.name || '?'}\n`;
            message += `Category: ${p.category || '?'}\n`;
            message += `Code: ${p.code || '?'}\n`;
            message += `Qty: ${p.quantity || '?'}\n`;
            message += `Cost: ${p.cost_price || '?'} ${p.currency || 'UZS'}\n`;
            message += `Sale: ${p.sale_price || '?'} ${p.currency || 'UZS'}\n\n`;
        });

        // Inline Keyboard
        const keyboard = new InlineKeyboard()
            .text("✅ Save All", "save_all")
            .text("❌ Cancel", "cancel_all");

        await ctx.reply(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });

        // Clean up
        fs.unlinkSync(oggPath);
        fs.unlinkSync(mp3Path);

    } catch (error) {
        console.error("Error processing voice:", error);
        await ctx.reply("Error processing voice message.");
    }
});

bot.callbackQuery("save_all", async (ctx) => {
    if (!ctx.session.productsToSave || ctx.session.productsToSave.length === 0) {
        await ctx.answerCallbackQuery("No products to save.");
        await ctx.editMessageText("Session expired or empty.");
        return;
    }

    try {
        const userId = ctx.from.id;
        for (const p of ctx.session.productsToSave) {
            await ProductRepository.create({
                user_id: userId,
                name: p.name || 'Unknown',
                category: p.category,
                code: p.code,
                quantity: p.quantity || 0,
                cost_price: p.cost_price,
                sale_price: p.sale_price,
                currency: p.currency || 'UZS'
            });
        }

        await ctx.answerCallbackQuery("Saved successfully!");
        await ctx.editMessageText(`Saved ${ctx.session.productsToSave.length} products! ✅`);
        ctx.session.productsToSave = [];
    } catch (e) {
        console.error(e);
        await ctx.answerCallbackQuery("Error saving.");
    }
});

bot.callbackQuery("cancel_all", async (ctx) => {
    ctx.session.productsToSave = [];
    await ctx.answerCallbackQuery("Cancelled");
    await ctx.editMessageText("Operation cancelled. ❌");
});

bot.command('report', async (ctx) => {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    await ctx.reply("Generating report... ⏳");

    try {
        const products = await ProductRepository.getByUserId(userId);
        if (products.length === 0) {
            await ctx.reply("No products found.");
            return;
        }

        const filePath = await generateProductReport(products);
        await ctx.replyWithDocument(new InputFile(filePath));

        // Clean up
        // fs.unlinkSync(filePath); // Optional: keep for cache or delete
    } catch (e) {
        console.error(e);
        await ctx.reply("Failed to generate report.");
    }
});

// Print View Command
bot.command('print', async (ctx) => {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    const products = await ProductRepository.getByUserId(userId);

    if (products.length === 0) {
        await ctx.reply("No products found.");
        return;
    }

    let message = "📦 *Product List*\n\n";
    let totalProfit = 0;

    products.forEach(p => {
        const profit = ((p.sale_price || 0) - (p.cost_price || 0)) * (p.quantity || 0);
        totalProfit += profit;
        message += `${p.code || '-'} — ${p.name} — ${p.quantity} qty — ${p.sale_price}\n`;
    });

    message += `\n*Total Profit*: ${totalProfit}`;

    // Telegram message length limit is 4096 chars. 
    // If too long, we might need to split. For now, assuming it fits or user filters.
    if (message.length > 4000) {
        message = message.substring(0, 4000) + "... (truncated)";
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
});

bot.hears("📄 Report Excel", async (ctx) => {
    // Re-use logic for report
    // We can't easily call the command handler directly without refactoring, so we can redirect or copy logic.
    // Ideally we extract the logic to a controller function.
    // For now, let's just trigger the report logic manually or refactor.
    // Let's refactor handlers slightly or just copy paste for speed as requested "Build it now".
    // Better: Helper function.
    await handleReport(ctx);
});

bot.hears("🖨 Print View", async (ctx) => {
    await handlePrint(ctx);
});

bot.hears("➕ Add Product (Voice)", async (ctx) => {
    await ctx.reply("Please record a voice message describing the product.");
});

async function handleReport(ctx: any) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    await ctx.reply("Generating report... ⏳");

    try {
        const products = await ProductRepository.getByUserId(userId);
        if (products.length === 0) {
            await ctx.reply("No products found.");
            return;
        }

        const filePath = await generateProductReport(products);
        await ctx.replyWithDocument(new InputFile(filePath));
    } catch (e) {
        console.error(e);
        await ctx.reply("Failed to generate report.");
    }
}

async function handlePrint(ctx: any) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    const products = await ProductRepository.getByUserId(userId);

    if (products.length === 0) {
        await ctx.reply("No products found.");
        return;
    }

    let message = "📦 *Product List*\n\n";
    let totalProfit = 0;

    products.forEach(p => {
        const profit = ((p.sale_price || 0) - (p.cost_price || 0)) * (p.quantity || 0);
        totalProfit += profit;
        message += `${p.code || '-'} — ${p.name} — ${p.quantity} qty — ${p.sale_price}\n`;
    });

    message += `\n*Total Profit*: ${totalProfit}`;

    if (message.length > 4000) {
        message = message.substring(0, 4000) + "... (truncated)";
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
}

bot.hears("🗑 Delete Last", async (ctx) => {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    try {
        const lastProduct = await ProductRepository.getLastProduct(userId);
        if (!lastProduct || !lastProduct.id) {
            await ctx.reply("No recent products found.");
            return;
        }
        await ProductRepository.delete(lastProduct.id);
        await ctx.reply(`Deleted: ${lastProduct.name} (${lastProduct.code || '-'}) 🗑`);
    } catch (e) {
        console.error(e);
        await ctx.reply("Failed to delete.");
    }
});

bot.hears("🔍 Search", async (ctx) => {
    ctx.session.step = 'searching';
    await ctx.reply("Enter product name or code to search:");
});

bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step === 'searching') {
        const query = ctx.message.text;
        if (!ctx.from) return;
        const userId = ctx.from.id;

        try {
            const results = await ProductRepository.search(userId, query);
            if (results.length === 0) {
                await ctx.reply("No products found.");
            } else {
                let message = `Found ${results.length} products:\n\n`;
                results.forEach(p => {
                    message += `${p.name} (${p.code || '-'}) - ${p.quantity} qty - ${p.sale_price}\n`;
                });
                await ctx.reply(message);
            }
        } catch (e) {
            console.error(e);
            await ctx.reply("Search failed.");
        }
        ctx.session.step = 'idle';
        return;
    }
    await next();
});
