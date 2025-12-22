import { GoogleGenAI, Type } from "@google/genai";
import { ColumnReinforcementData } from "../types";

// User provided prompt text
const SYSTEM_PROMPT = `
You are a data extraction assistant specializing in structural engineering documents.

**Goal:**
Extract the Main Reinforcement (主筋) and Hoop Reinforcement (帯筋) details for specific Column Types (e.g., C1, C2, C3, C4) from the provided PDF pages.

**Steps:**

1.  **Identify Column Types:**
    *   Scan each page for product specification sheets (typically titled with codes like "EB...").
    *   On these pages, look for a specific text label indicating the Column Type, often found inside a colored (red/pink) rectangular box near the bottom or middle of the page (e.g., "C1: 770x770" or "C3, C4: 660x660").
    *   **Note:** If multiple Column Types are listed on a single page (e.g., "C3, C4"), the extracted data applies to all of them.

2.  **Locate the Data Table:**
    *   Find the table titled **"基礎柱形設計例"** (Foundation Column Design Example) on the page.

3.  **Extract Data (Priority Rule):**
    *   Look for the column header **"Ⅱゾーンの場合"** (Zone II Case).
        *   **Priority:** You must extract values from the "Ⅱゾーンの場合" column if it exists.
        *   **Fallback:** Only if "Ⅱゾーンの場合" is completely absent, use the values from "Ⅰゾーンの場合".
    *   Extract the value for **"基礎柱形主筋"** (Main Reinforcement) and map it to "主筋".
    *   Extract the value for **"帯筋"** (Hoop Reinforcement) and map it to "帯筋".
    *   *Note:* If the table has rows for "Corner/Side" (側・隅柱用) and "Center" (中柱用), check if the values differ. If they are the same, extract the single value. If they differ, list the "Corner/Side" value. (In these specific documents, Zone II values usually match for both rows).

**Constraints:**
*   Ignore page headers/footers irrelevant to the specific reinforcement data.
*   Do not extract dimensions (e.g., 770x770) unless they are part of the rebar description.
*   Ensure all distinct Column Types found in the red boxes are listed in the table.
`;

export const extractDataFromPdf = async (base64Pdf: string): Promise<ColumnReinforcementData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Use the user's prompt but override the "Output Format" section by enforcing a JSON schema.
  const finalPrompt = `
    ${SYSTEM_PROMPT}

    **IMPORTANT OVERRIDE:**
    Ignore the "Output Format" instruction in the text above regarding Markdown. 
    Instead, strictly output a valid JSON array based on the schema provided.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf
            }
          },
          {
            text: finalPrompt
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              columnType: {
                type: Type.STRING,
                description: "The column identifier (e.g., C1, C2)"
              },
              mainReinforcement: {
                type: Type.STRING,
                description: "Extracted value for '主筋' (Main Bar)"
              },
              hoopReinforcement: {
                type: Type.STRING,
                description: "Extracted value for '帯筋' (Hoop Bar)"
              }
            },
            required: ['columnType', 'mainReinforcement', 'hoopReinforcement']
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No data returned from the model.");
    }

    return JSON.parse(jsonText) as ColumnReinforcementData[];
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
