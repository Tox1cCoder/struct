import { GoogleGenAI, Type } from "@google/genai";
import { ColumnReinforcementData } from "../types";

// User provided prompt text
const SYSTEM_PROMPT = `
You are a data extraction assistant specializing in structural engineering documents.

**Goal:**
Extract the Column Dimensions (柱形 or B×D), Main Reinforcement (主筋), and Hoop Reinforcement (帯筋) details for specific Column Types (e.g., C1, C2, FC1) from the provided document (PDF or image).

**Steps:**

1.  **Identify Column Types:**
    *   Scan each page or image for product specification sheets (typically titled with codes like "EB...").
    *   On these pages, look for a specific text label indicating the Column Type, often found inside a colored (red/pink) rectangular box near the bottom or middle of the page (e.g., "C1: 770x770" or "C3, C4: 660x660"), or in a table with columns like "符号" or "Column Type".
    *   **Note:** If multiple Column Types are listed on a single page (e.g., "C3, C4"), the extracted data applies to all of them.

2.  **Locate the Data Table:**
    *   Find the table titled **"基礎柱形設計例"** (Foundation Column Design Example) on the page, or look for tables with headers like "符号", "断面", "B×D", "主筋", "帯筋", "HOOP".

3.  **Extract Data (Priority Rule):**
    *   **Column Dimensions:** Look for fields labeled "柱形(mm)", "柱形断面", "B×D", or similar dimension specifications. Extract the dimensions (e.g., "1,400×1,400" or "770×770"). If dimensions contain text in parentheses like "柱形(mm)", ignore the parentheses content and extract only the dimension values.
    *   Look for the column header **"Ⅱゾーンの場合"** (Zone II Case).
        *   **Priority:** You must extract values from the "Ⅱゾーンの場合" column if it exists.
        *   **Fallback:** Only if "Ⅱゾーンの場合" is completely absent, use the values from "Ⅰゾーンの場合".
    *   Extract the value for **"基礎柱形主筋"** (Main Reinforcement) or "主筋" and map it to "主筋".
    *   Extract the value for **"帯筋"** (Hoop Reinforcement) or "HOOP" and map it to "帯筋".
    *   *Note:* If the table has rows for "Corner/Side" (側・隅柱用) and "Center" (中柱用), check if the values differ. If they are the same, extract the single value. If they differ, list the "Corner/Side" value. (In these specific documents, Zone II values usually match for both rows).

**Constraints:**
*   Ignore page headers/footers irrelevant to the specific reinforcement data.
*   Do not extract dimensions (e.g., 770x770) unless they are part of the rebar description.
*   Ensure all distinct Column Types found in the red boxes or symbol columns are listed in the table.
`;

export const extractDataFromPdf = async (base64Data: string, mimeType: string): Promise<ColumnReinforcementData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const finalPrompt = `
    ${SYSTEM_PROMPT}

    **Refinement Instructions:**
    *   When extracting reinforcement values (e.g., "24-D25 (SD345)"), **REMOVE** the material information in parentheses.
    *   Example: "24-D25 (SD345)" should become "24-D25".
    *   Example: "D13@100 (SD295)" should become "D13@100".

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
              mimeType: mimeType,
              data: base64Data
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
                description: "The column identifier (e.g., C1, C2, FC1)"
              },
              columnDimensions: {
                type: Type.STRING,
                description: "The column dimensions from '柱形(mm)', 'B×D', or similar field (e.g., '1,400×1,400'). Extract only the numeric dimensions, ignore text in parentheses."
              },
              mainReinforcement: {
                type: Type.STRING,
                description: "Extracted value for '主筋' (Main Bar). Omit material grade like (SD345)."
              },
              hoopReinforcement: {
                type: Type.STRING,
                description: "Extracted value for '帯筋' (Hoop Bar). Omit material grade like (SD295)."
              }
            },
            required: ['columnType', 'columnDimensions', 'mainReinforcement', 'hoopReinforcement']
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No data returned from the model.");
    }

    const rawData = JSON.parse(jsonText) as ColumnReinforcementData[];

    // Robust post-processing to clean up any remaining parentheses (half-width or full-width)
    // Regex: Match a space (optional) followed by ( or （, any content, then ) or ）
    const cleanValue = (val: string) => val.replace(/\s*[\(（].*?[\)）]/g, '').trim();

    return rawData.map(item => ({
      ...item,
      mainReinforcement: cleanValue(item.mainReinforcement),
      hoopReinforcement: cleanValue(item.hoopReinforcement),
    }));

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
