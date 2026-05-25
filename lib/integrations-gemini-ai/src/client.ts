import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[reviewbot] GEMINI_API_KEY is not set. AI analysis will fail at runtime. " +
    "Get a key at https://aistudio.google.com/app/apikey"
  );
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY ?? "missing-key",
});
