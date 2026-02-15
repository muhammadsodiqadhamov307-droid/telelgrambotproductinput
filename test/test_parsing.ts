import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const runTest = async () => {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY missing");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const mockTranscribedText = "Product Bodyfix Universal Category Adhesive Code BF10 Quantity 12 Cost 25000 Sale 32000";

    // We can test text-to-json logic directly if we extract it from voice.ts/gemini.ts
    // But our gemini.ts transcribes AND parses in one go using audio.
    // So here we will test just the parsing prompt with text input 
    // to simulate what happens after STT (or if we used a text-only prompt).

    const prompt = `
    Extract structured data from this product description:
    "${mockTranscribedText}"
    
    Fields:
    - name (string)
    - category (string)
    - code (string, SKU)
    - quantity (number, integer)
    - cost_price (number)
    - sale_price (number)

    Return JSON array.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Parsed Output:");
        console.log(text);
    } catch (e) {
        console.error(e);
    }
};

runTest();
