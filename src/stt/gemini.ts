import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductDraft } from '../bot/context';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// User requested specific ID: gemini-2.5-flash-lite
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

export const transcribeAndParse = async (audioPath: string): Promise<ProductDraft[]> => {
    const audioData = fs.readFileSync(audioPath);
    const audioPart: Part = {
        inlineData: {
            data: Buffer.from(audioData).toString('base64'),
            mimeType: 'audio/mp3',
        },
    };

    const prompt = `
    You are a data entry assistant for a store in Uzbekistan. 
    Listen to the audio which contains product information in naturally spoken Uzbek, Russian, or English.
    
    Extract the following fields for each product mentioned:
    - name (string: "Maxsulot nomi")
    - category (string: "Mashina turi" / Car Type)
    - code (string: "Kodi")
    - quantity (number, integer: "Soni". Return null if not specified)
    - cost_price (number: "Kelish narxi". Return null if not specified)
    - sale_price (number: "Sotish narxi". Return null if not specified)
    - currency (string: "UZS" or "USD")

    **Crucial Parsing Rules:**
    1. **Language**: High proficiency in Uzbek/Russian mixed speech (auto parts context).
    2. **Category**: Often refers to the Car Model (e.g., "Lacetti", "Damas", "Cobalt"). Map this to 'category'.
    3. **Numbers**: 
       - Support DECIMALS. "10.4", "2.7" should be parsed exactly as numbers.
       - "25 ming" -> 25000.
       - **IMPORTANT**: If a number (quantity/price) is NOT mentioned, set it to null. Do NOT default to 0.
    4. **Currency**:
       - If price is small (e.g. 1.2, 10.5, 50) and no currency mentioned, it is likely **USD** if consistent with car parts logic, OR check for "dollar" context. But usually small numbers like 1-100 are dollars, large numbers like 10000+ are sums.
       - "dollar", "$", "u.e." -> "USD"
       - "sum", "so'm", "ming" -> "UZS"
       - Default to "UZS" if ambiguous and large number. Default "USD" if small number (< 1000).
    
    Return a valid JSON array of objects.
    Example Output:
    [
        { "name": "Zupchatka", "category": "Lacetti", "code": "5499", "quantity": 10, "cost_price": 10.4, "sale_price": null, "currency": "USD" },
        { "name": "Kallektor", "category": "Spark", "code": "670", "quantity": null, "cost_price": 1.1, "sale_price": 1.7, "currency": "USD" }
    ]
    `;

    const result = await model.generateContent([prompt, audioPart]);
    const response = await result.response;
    const text = response.text();

    // Clean up potential markdown formatting
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        console.log("Gemini Response:", cleanedText);
        return JSON.parse(cleanedText) as ProductDraft[];
    } catch (error) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to parse product data.");
    }
};
