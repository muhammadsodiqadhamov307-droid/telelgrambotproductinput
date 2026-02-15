import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductDraft } from '../bot/context';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export const transcribeAndParse = async (audioPath: string): Promise<ProductDraft[]> => {
    const audioData = fs.readFileSync(audioPath);
    const audioPart: Part = {
        inlineData: {
            data: Buffer.from(audioData).toString('base64'),
            mimeType: 'audio/mp3',
        },
    };

    const prompt = `
    You are a data entry assistant. Listen to the audio which contains product information.
    Extract the following fields for each product mentioned:
    - name (string)
    - category (string)
    - code (string, SKU)
    - quantity (number, integer)
    - cost_price (number)
    - sale_price (number)

    The audio might be in Uzbek, Russian, or English.
    Prices might be spoken like "25 ming" (25000), "2.5 million" (2500000). Convert them to standard numbers.
    Return a valid JSON array of objects. Do not wrap in markdown code blocks. Just the raw JSON.
    If a field is missing, omit it or set to null.
    
    Example Output:
    [
        { "name": "Bodyfix", "category": "Adhesive", "code": "BF10", "quantity": 12, "cost_price": 25000, "sale_price": 32000 }
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
