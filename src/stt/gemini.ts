import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductDraft } from '../bot/context';

dotenv.config();

// Parse keys from comma-separated string
const keys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(k => k.length > 0);
let currentKeyIndex = 0;

const getNextGenAI = () => {
    if (keys.length === 0) {
        console.error("No GEMINI_API_KEY provided in .env");
        // Fallback or throw? For safety, let's allow it to fail gracefully or use empty string (which will error downstream)
        return new GoogleGenerativeAI('');
    }
    const key = keys[currentKeyIndex];
    // console.log(`Rotating Gemini Key: Using index ${currentKeyIndex} (Total: ${keys.length})`);
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    return new GoogleGenerativeAI(key);
};

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
    - firma (string: "Firma" / Brand / Manufacturer. e.g. "Powergrip", "Gates")
    - code (string: "Kodi")
    - quantity (number, integer: "Soni". Return null if not specified)
    - cost_price (number: "Kelish narxi". Return null if not specified)
    - sale_price (number: "Sotish narxi". Return null if not specified)
    - currency (string: "UZS" or "USD")

    **Crucial Parsing Rules:**
    1. **Language**: High proficiency in Uzbek/Russian mixed speech (auto parts context).
    2. **Category**: Often refers to the Car Model (e.g., "Lacetti", "Damas", "Cobalt"). Map this to 'category'.
    3. **Firma**: Extract brand or manufacturer name (e.g., "Povergrip", "Vesmo").
    4. **Name**: Captures FULL product name. "Zupchatka remen" -> "Zupchatka remen", NOT just "Zupchatka".
    5. **Numbers & Decimals**: 
       - Support spoken decimals like "10 u 3" (10 point 3) or "10 butun 5" -> **10.3**, **10.5**.
       - "on u besh" -> 10.5
       - "milliy" or "ming" -> multiply by 1000 if context implies price.
       - **IMPORTANT**: If a number (quantity/price) is NOT mentioned, set it to null. Do NOT default to 0.
    6. **Currency**:
       - "dollar", "$", "u.e." -> "USD"
       - "sum", "so'm", "ming" -> "UZS"
       - Default to "UZS" if ambiguous and large number. "USD" if small number (< 1000) or decimal.
    7. **Spelling Normalization**:
       - "kollektor", "kallekter", "kollekter" -> **"kallektor"** (Always use this standard spelling).
       - "zupchatka" -> "Zupchatka" (Capitalize).
    
    Return a valid JSON array of objects.
    Example Output:
    [
        { "name": "Zupchatka remen", "category": "Lacetti", "firma": "Povergrip", "code": "5499", "quantity": 10, "cost_price": 10.3, "sale_price": null, "currency": "USD" },
        { "name": "Kallektor", "category": "Spark", "firma": "Vesmo", "code": "670", "quantity": null, "cost_price": 1.1, "sale_price": 1.7, "currency": "USD" }
    ]
    `;

    const genAI = getNextGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await model.generateContent([prompt, audioPart]);
    const response = await result.response;
    const text = response.text();

    // Clean up potential markdown formatting
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        console.log("Gemini Response:", cleanedText);
        const products = JSON.parse(cleanedText) as ProductDraft[];

        // Post-processing for strict spelling normalization
        // This functionality is added because the LLM sometimes prefers "correct" dictionary spelling
        // over the user's preferred "dialect/slang" spelling.
        return products.map(p => {
            if (p.name) {
                // Force "kallektor"
                p.name = p.name.replace(/kollektor/gi, 'kallektor')
                    .replace(/kollekter/gi, 'kallektor')
                    .replace(/kallekter/gi, 'kallektor');

                // Capitalize first letter
                p.name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
            }
            return p;
        });

    } catch (error) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to parse product data.");
    }
};
