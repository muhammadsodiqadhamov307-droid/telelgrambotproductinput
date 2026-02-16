import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductDraft } from '../bot/context';

dotenv.config();


// Use single API key (user has upgraded to paid tier)
const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
    console.error("No GEMINI_API_KEY provided in .env");
}

const genAI = new GoogleGenerativeAI(apiKey);

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
        - **CRITICAL**: Write the product name EXACTLY as the user says it. Do NOT translate, change, or "correct" the name.
        - **PRESERVE ALL WORDS**: "Nufta glavniy" -> "Nufta glavniy" (keep BOTH words). Do NOT drop any words.
        - **ONLY apply these specific fixes**: "kollektor"/"kollekter" -> "kallektor", "robochiy"/"rabochey" -> "rabochiy".
    - category (string): Car Model (e.g., "Spark", "Cobalt", "Lacetti", "Damas", "Nexia", "Best").
    - firma (string): Brand/Manufacturer (e.g., "Powergrip", "Gates", "Vesmo", "GMB", "Valeo").
        - **CRITICAL**: Car model names (Nexia, Cobalt, Spark, Lacetti, Damas, Gentra, Matiz, Tico, Malibu) can NEVER be the firma. They are ONLY category.
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
    2. **Identify the Car Model**: Words like "Spark", "Cobalt", "Gentra", "Nexia", "Malibu", "Best" are almost ALWAYS the **Category**.
       - **SPECIAL RULE**: "Best" is a valid Car unique to us. If user says "Best", the Car Model is "Best".
       - **Include Numbers AND Decimals**: If you hear "Malibu bir", "Nexia 2", "Nexia ikki", the number is PART OF THE CAR MODEL. Output: "Malibu 1", "Nexia 2".
       - **Include Engine Sizes**: "Spark 1.25", "Nexia 1.5" -> Output: "Spark 1.25", "Nexia 1.5" (decimal is part of car model, NOT a price).
       - **Include Trim/Variant Names**: "Nexia Sons", "Cobalt R3" -> Output: "Nexia Sons", "Cobalt R3" (variant names are part of car model).
       - **NEVER put car models in firma field**: Nexia is a car, NOT a brand.
    3. **Capture FULL Product Names**:
       - Include ALL descriptive words: "Nufta rabochiy silindr" -> name: "Nufta rabochiy silindr" (keep "Nufta").
       - **EXCLUDE car model names from product name**: "Lacetti kallektor" -> name: "Kallektor", category: "Lacetti" (NOT "Lacetti kallektor").
       - Don't drop prefixes or adjectives that describe the product.
    4. **Identify the Brand**: Words like "Gates", "Powergrip", "Vesmo" are the **Firma**.
    4. **Separate Name from Price**:
       - "Kallektor prokladka 5 dollar" -> Name: "Kallektor prokladka", Cost: 5.
       - The Name usually stops when you hear a Number, a Car Model, or a Brand.
    5. **Numbers, Decimals & Precisions (CRITICAL)**:
       - **Decimals**: "o'n u to'rt", "10 u 4", "10 butun 4" -> **10.4** (NOT 14).
       - **Action**: You MUST convert "u" or "butun" to a DOT.
       - **Small Floats**: Numbers like 1.1, 0.5, 10.7 are ALMOST ALWAYS PRICES.
    6. **Quantity vs Price**:
       - **DEFAULT QUANTITY IS NULL**: If the user does NOT say a quantity ("10 ta", "2 shtuk"), do **NOT** assume 1. Return null.
       - **Ambiguity**: "10 ta 5000" -> Qty: 10, Price: 5000.
    7. **Spelling Normalization (MANDATORY)**:
       - **Cars**: "Neksya", "Neksiya" -> **"Nexia"**. "Kobalt" -> **"Cobalt"**. "Lasetti", "Lacetty" -> **"Lacetti"**. "Jentra" -> **"Gentra"**. "Tiko" -> **"Tico"**.
       - **Products**: "kollektor", "kollekter" -> **"kallektor"**. "zupchatka" -> "**Zupchatka"**. "robochiy", "rabochey" -> **"rabochiy"**. "kal'so", "kalso" -> **"Kalso"**.

    Return a valid JSON array of objects.

    **Examples:**
    Input: "Malibu bir kallektor"
    Output: [{"name": "Kallektor", "category": "Malibu 1", "currency": "USD"}]

    Input: "Neksya sons kal'so"
    Output: [{"name": "Kalso", "category": "Nexia Sons", "quantity": null, "currency": "USD"}]

    Input: "Kobalt amortizator 10 u 4 dollar"
    Output: [{"name": "Amortizator", "category": "Cobalt", "cost_price": 10.4, "currency": "USD"}]
    `;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: "DirectOutput-Override: Thinking mode disabled. Pure output engaged. Provide direct JSON responses without internal monologues."
    });

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
            console.error(`Error status: ${error.status}`);

            if (attempts >= maxAttempts) throw error;

            // Retry on 429 (Rate Limit) with longer delay
            if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
                const delay = 20000 * attempts; // 20s, 40s, 60s
                console.log(`Rate limit hit. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Retry on 503 (Service Unavailable) or 500+ errors
            if (error.message?.includes('503') || error.status === 503) {
                const delay = 1500 * attempts;
                console.log(`Service unavailable. Retrying in ${delay}ms...`);
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

                // Force "rabochiy"
                p.name = p.name.replace(/robochiy/gi, 'rabochiy')
                    .replace(/rabochey/gi, 'rabochiy');

                // Force "Kalso"
                p.name = p.name.replace(/kal'so/gi, 'Kalso')
                    .replace(/kalso/gi, 'Kalso');

                // Capitalize first letter
                p.name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
            }

            if (p.category) {
                let cat = p.category; // Keep original structure (Don't lowercase yet to preserve formatting if needed)

                // Smart Normalization: Fix car name spelling BUT preserve the rest (numbers, variants)
                // We use regex replace to change ONLY the car name part.

                cat = cat.replace(/neksya|neksiya/gi, 'Nexia');
                cat = cat.replace(/kobalt/gi, 'Cobalt');
                cat = cat.replace(/lasetti|lacetty/gi, 'Lacetti');
                cat = cat.replace(/jentra/gi, 'Gentra');
                cat = cat.replace(/tiko/gi, 'Tico');

                // Ensure proper capitalization for known brands if the prompt missed it
                cat = cat.replace(/\bspark\b/gi, 'Spark');
                cat = cat.replace(/\bdamas\b/gi, 'Damas');
                cat = cat.replace(/\bmatiz\b/gi, 'Matiz');

                p.category = cat;
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
