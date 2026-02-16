import { GoogleGenAI, Type } from "@google/genai";
import { AIQuoteResponse } from "../types";

// Initialize Gemini client
const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

export const generateQuoteFromInput = async (input: { 
  text?: string, 
  imageBase64?: string, 
  mimeType?: string,
  customInstructions?: string
}): Promise<AIQuoteResponse | null> => {
  if (!apiKey) {
    console.error("API Key is missing");
    return null;
  }

  try {
    const model = 'gemini-3-flash-preview';
    
    let contents: any[] = [];
    
    // Add Image Part if exists
    if (input.imageBase64 && input.mimeType) {
       // Strip base64 prefix if present for the data field
       const base64Data = input.imageBase64.split(',')[1] || input.imageBase64;
       
       contents.push({
         inlineData: {
           mimeType: input.mimeType,
           data: base64Data
         }
       });
    }

    // Add Text Part with Custom Instructions
    const promptText = `
      You are a professional hotel booking assistant acting for a Chinese agent.
      Analyze the provided input (which can be text or an image of a chat/booking app).
      Extract the booking details to formulate a sales quote.
      
      User Additional Note: "${input.text || 'N/A'}"
      
      ${input.customInstructions ? `IMPORTANT Custom Instructions from Agent: ${input.customInstructions}` : ''}
      
      Requirements:
      1. Return the response in JSON format matching the schema.
      2. Ensure all string values in the JSON are in **Simplified Chinese**.
      3. The recommendation should be professional, persuasive, and sound like a helpful agent.
      4. If the input is an image, extract hotel name, dates, price, breakfast info, and cancellation policy.
      5. If information is missing, make reasonable assumptions based on standard business travel or ask for it in the recommendation field.
    `;
    
    contents.push({ text: promptText });

    const response = await ai.models.generateContent({
      model,
      contents: { parts: contents },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hotelName: { type: Type.STRING, description: "Name of the hotel" },
            location: { type: Type.STRING, description: "City or specific location" },
            dates: { type: Type.STRING, description: "Check-in and Check-out dates" },
            roomType: { type: Type.STRING, description: "Type of room requested" },
            estimatedPrice: { type: Type.STRING, description: "Estimated price range or specific price" },
            recommendation: { type: Type.STRING, description: "A brief professional sales pitch or recommendation" },
            breakfast: { type: Type.STRING, description: "Breakfast details (e.g. '含双早', '无早')" },
            cancellationPolicy: { type: Type.STRING, description: "Cancellation policy details" },
            otherInfo: { type: Type.STRING, description: "Any other important details mentioned (e.g. Executive Lounge access)" }
          },
          required: ["hotelName", "dates", "recommendation"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return null;
    
    return JSON.parse(jsonText) as AIQuoteResponse;

  } catch (error) {
    console.error("Error generating quote:", error);
    return null;
  }
};

export const analyzePriceTrend = async (hotelName: string, history: {date: string, price: number}[]): Promise<string> => {
    if (!apiKey) return "API Key missing. Cannot analyze trends.";

    try {
        const historyStr = history.map(h => `${h.date}: $${h.price}`).join('\n');
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze the following price history for ${hotelName} and give a short 1-sentence advice to a booking agent on whether to book now or wait. Return the advice in Simplified Chinese.\n\n${historyStr}`,
        });
        return response.text || "无法分析价格趋势。";
    } catch (e) {
        return "趋势分析失败。";
    }
}
