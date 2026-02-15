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
    You are a smart data entry assistant for an auto parts store in Uzbekistan. 
    User will speak naturally, often mixing Uzbek, Russian, and English.
    
    **YOUR GOAL**: extract product details even if the user does NOT say keywords like "Maxsulot nomi" or "Firma". You must INFER which word is what based on context.

    **Fields to Extract:**
    - name (string): The core product name (e.g., "Zupchatka remen", "Kallektor prokladka").
    - category (string): Car Model (e.g., "Spark", "Cobalt", "Lacetti", "Damas", "Nexia").
    - firma (string): Brand/Manufacturer (e.g., "Powergrip", "Gates", "Vesmo", "GMB", "Valeo").
        - *Hint*: If a word looks like a brand name, map it here.
    - code (string): Part Number / Code (e.g., "5499", "670").
        - *Hint*: Usually a standalone number or alphanumeric code, distinct from quantity/price.
    - quantity (number): The count/amount (e.g., "10 ta", "100 dona", "50").
        - *Hint*: Integer numbers are usually quantity.
    - cost_price (number): "Kelish narxi" / Cost (e.g., "5 dollar", "10.5").
    - sale_price (number): "Sotish narxi" / Sale Price.
    - currency (string): "USD" (Always default to "USD").

    **Inference Rules (How to understand the user):**
    1. **Structure is Flexible**: Users might say "Spark kallektor 10 ta" OR "10 ta kallektor Spark uchun". You must figure it out.
    2. **Identify the Car Model**: Words like "Spark", "Cobalt", "Gentra", "Nexia" are almost ALWAYS the **Category**.
    3. **Identify the Brand**: Words like "Gates", "Powergrip", "Vesmo" are the **Firma**.
    4. **Separate Name from Price**:
       - "Kallektor prokladka 5 dollar" -> Name: "Kallektor prokladka", Cost: 5.
       - The Name usually stops when you hear a Number, a Car Model, or a Brand.
    5. **Numbers**:
       - "10 ta", "50 shtuk" -> Quantity: 10, 50.
       - "5.5", "10 dollar", "narxi 20" -> Price.
       - If you see two numbers (e.g., "10 ta 5 dollar"), the Integer "10" is likely Quantity, "5" is Price.
       - **Spoken Decimals**: "10 u 5" -> 10.5.
    6. **Spelling Normalization**:
       - Always normalize "kollektor", "kollekter" -> **"kallektor"**.
       - "zupchatka" -> "**Zupchatka**".

    Return a valid JSON array of objects.

    **Examples:**
    Input: "Spark kallektor prokladka 10 ta 5 dollardan"
    Output: [{"name": "Kallektor prokladka", "category": "Spark", "quantity": 10, "cost_price": 5, "currency": "USD"}]

    Input: "Powergrip remen 50 ta"
    Output: [{"name": "Remen", "firma": "Powergrip", "quantity": 50, "currency": "USD"}]

    Input: "Kobalt amortizator oldi"
    Output: [{"name": "Amortizator oldi", "category": "Cobalt", "currency": "USD"}]
    `;

    const genAI = getNextGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    let result;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            result = await model.generateContent([prompt, audioPart]);
            break;
        } catch (error: any) {
            attempts++;
            console.error(`Gemini API Error (Attempt ${attempts}/${maxAttempts}):`, error.message);

            if (attempts >= maxAttempts) throw error;

            // Retry on 503 (Service Unavailable) or 500+ errors
            if (error.message?.includes('503') || error.status === 503) {
                const delay = 1500 * attempts;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }

    if (!result) {
        throw new Error("Failed to retrieve response from Gemini API after multiple attempts.");
    }

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
            // Force Currency to USD
            p.currency = 'USD';

            return p;
        });

    } catch (error) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to parse product data.");
    }
};
