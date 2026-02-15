# Telegram Product Bot

A Telegram bot that captures product data from voice messages, parses it using Google Gemini AI, stores it in SQLite, and generates Excel reports.

## Features
- 🎙 **Voice to Text**: Send voice messages to add products.
- 🧠 **AI Parsing**: Automatically extracts Name, Category, SKU, Quantity, Price.
- 📊 **Excel Reports**: Download formatted .xlsx reports with profit calculations.
- 🖨 **Print View**: Get a quick text summary of your inventory.
- 🇺🇿 🇷🇺 🇺🇸 **Multi-language**: Supports Uzbek, Russian, and English.

## Setup

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
    *(Note: You need `ffmpeg` installed on your system)*
3.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in:
    - `BOT_TOKEN`: Your Telegram Bot Token (from @BotFather)
    - `GEMINI_API_KEY`: Your Google Gemini API Key
4.  **Run the bot**:
    ```bash
    npm start
    ```
    or for development:
    ```bash
    npm run dev
    ```

## Usage
1.  Start the bot with `/start`.
2.  Use the menu "➕ Add Product (Voice)" or just send a voice message.
3.  Speak naturally, e.g., "Product: Cement, Qty: 10, Price: 50000".
4.  Confirm the parsed data.
5.  Click "📄 Report Excel" to get your file.

## Deployment (VPS/Linux)
1.  Install Node.js (v18+) and FFmpeg.
    ```bash
    sudo apt update
    sudo apt install ffmpeg
    ```
2.  Copy project files.
3.  Install dependencies `npm install`.
4.  Build: `npm run build` (if you added a build script, otherwise `ts-node` works).
5.  Use PM2 to run:
    ```bash
    npm install -g pm2
    pm2 start src/index.ts --interpreter ./node_modules/.bin/ts-node --name product-bot
    ```
