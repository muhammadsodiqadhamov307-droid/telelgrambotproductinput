import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductDraft } from '../bot/context';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" });

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
    - name (string)
    - category (string)
    - code (string, SKU)
    - quantity (number, integer)
    - cost_price (number)
    - sale_price (number)

    **Crucial Parsing Rules:**
    1. **Language**: High proficiency in Uzbek is required. Handle dialects/mixed speech.
    2. **Numbers**: Parse "25 ming" as 25000, "2.5 million" as 2500000.
    3. **Currency**:
       - If price is in **So'm** (e.g., "ming", "so'm"), keep as is (e.g. 25000).
       - If price is in **Dollars** (e.g., "dollar", "$", "u.e."), **CONVERT to So'm** assuming rate 1 USD = 12800 UZS. 
         (Example: "10 dollar" -> 128000).
       - If ambiguous, default to So'm.
    
    Return a valid JSON array of objects.
    Example Output:
    [
        { "name": "Bodyfix", "category": "Yelim", "code": "BF10", "quantity": 12, "cost_price": 25000, "sale_price": 32000 }
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
