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

bot.command('start', (ctx) => ctx.reply('Welcome! Use the menu below or send a voice message.', { reply_markup: mainMenu }));
bot.command('help', (ctx) => ctx.reply('Send a voice message like "Product: Apple, Qty: 10, Price: 50".'));
bot.command('help', (ctx) => ctx.reply('Send a voice message like "Product: Apple, Qty: 10, Price: 50".'));

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
