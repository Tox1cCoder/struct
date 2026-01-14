import { GoogleGenAI, Type } from "@google/genai";
import { ColumnReinforcementData, FoundationColumnData, FrameData } from "../types";

// User provided prompt text for Column Reinforcement extraction
const REINFORCEMENT_SYSTEM_PROMPT = `
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

// Foundation-Column linking prompt
const FOUNDATION_COLUMN_SYSTEM_PROMPT = `
**Role:**
You are an expert Structural Engineering Assistant specializing in reading construction drawings, specifically Foundation Plans. Your task is to accurately extract the relationship between Foundations and Columns.

**Objective:**
Analyze the provided image/PDF of the foundation plan and generate a structured list mapping each **Foundation Type** to its corresponding **Column Type**.

**Extraction Rules:**

1.  **Identify Foundations:**
    *   Look for large square or rectangular outlines representing footings/pile caps.
    *   Labels typically start with **"F"** or **"FK"** (e.g., F11, F17B, FK1, F112A).
    *   **Text Cleaning:** Ignore elevation notes or extra details in parentheses following the label.
        *   *Example:* Convert \`F15A (SGL-***)\` to just \`F15A\`.
        *   *Example:* Convert \`F11C(SGL-1.495)\` to just \`F11C\`.

2.  **Identify Columns:**
    *   Look for smaller squares, rectangles, or shapes located **inside** or immediately attached to the Foundation outlines.
    *   Labels typically start with **"C"**, **"CP"**, or **"KZ"** (e.g., C1, C1A, CP1, C12).
    *   If a text label is visually associated with the column shape (usually placed right next to it or inside it), extract it.

3.  **Mapping Logic:**
    *   For each unique Foundation label, find the Column label located within it.
    *   If a Foundation contains multiple *different* column types, list them all separated by a comma (e.g., \`C2, C5\`).
    *   If a Foundation contains multiple *identical* columns, just list the column type once.

4.  **Data Processing:**
    *   Deduplicate the entries. Create a summary table of **Unique Foundation Types**.
    *   Sort the list alphanumerically by the Foundation label.

**IMPORTANT:** Output a valid JSON array based on the schema provided.
`;

export const extractDataFromPdf = async (base64Data: string, mimeType: string): Promise<ColumnReinforcementData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const finalPrompt = `
    ${REINFORCEMENT_SYSTEM_PROMPT}

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

    let rawData: any;
    try {
      rawData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw response text:", jsonText);
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // Ensure we have an array
    if (!Array.isArray(rawData)) {
      console.warn('Expected array from model, got:', typeof rawData);
      if (typeof rawData === 'object' && rawData !== null) {
        rawData = [rawData];
      } else {
        throw new Error(`Invalid response format - expected array, got ${typeof rawData}`);
      }
    }

    // Validate each item has required fields
    const validatedData = rawData.filter((item: any) => {
      if (!item.columnType || !item.columnDimensions) {
        console.warn('Skipping invalid column data:', item);
        return false;
      }
      return true;
    });

    if (validatedData.length === 0) {
      throw new Error('No valid column data found in response');
    }

    console.log(`Extracted ${validatedData.length} column(s) from document`);

    // Robust post-processing to clean up any remaining parentheses (half-width or full-width)
    // Regex: Match a space (optional) followed by ( or （, any content, then ) or ）
    const cleanValue = (val: string) => val?.replace(/\s*[\(（].*?[\)）]/g, '').trim() || '';

    return validatedData.map((item: ColumnReinforcementData) => ({
      ...item,
      mainReinforcement: cleanValue(item.mainReinforcement),
      hoopReinforcement: cleanValue(item.hoopReinforcement),
    }));

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export const extractFoundationColumnData = async (base64Data: string, mimeType: string): Promise<FoundationColumnData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

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
            text: FOUNDATION_COLUMN_SYSTEM_PROMPT
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
              foundation: {
                type: Type.STRING,
                description: "The foundation identifier (e.g., F11, F17B, FK1)"
              },
              columnType: {
                type: Type.STRING,
                description: "The column identifier inside the foundation (e.g., C1, C2, CP1)"
              }
            },
            required: ['foundation', 'columnType']
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No data returned from the model.");
    }

    const rawData = JSON.parse(jsonText) as FoundationColumnData[];

    // Post-processing: Clean foundation labels (remove SGL notes and parentheses)
    const cleanFoundation = (val: string) => val.replace(/\s*[\(（].*?[\)）]/g, '').trim();

    return rawData.map(item => ({
      ...item,
      foundation: cleanFoundation(item.foundation),
      columnType: item.columnType.trim(),
    }));

  } catch (error) {
    console.error("Foundation-Column Extraction Error:", error);
    throw error;
  }
};

// Frame extraction prompt (FW and FG types)
const FRAME_SYSTEM_PROMPT = `
You are a structural engineering data extraction specialist. Your task is to extract frame data from Japanese structural engineering CAD drawings.

**There are TWO types of frames:**

## Type 1: FW (Foundation Wall / 布基礎)
These images show a cross-section of a foundation wall with the following characteristics:
- The frame name (e.g., "FW1", "FW2") appears at the TOP of the image, usually in a title row
- Dimension values are shown on the drawing:
  - The BOTTOM horizontal dimension (e.g., "300") = B (Width)
  - The LEFT VERTICAL dimension showing the wall height (e.g., "350", "1,200以下") = H (Height)
  - Look for the dimension near the green/cyan square outline showing the wall depth
- Reinforcement info appears as labels like:
  - "ﾖｺ: D13@200 (ダブル)" - Horizontal reinforcement → This is 上端筋 (top)
  - "ﾀﾃ: D13@200 (ダブル)" - Vertical reinforcement → This is 下端筋 (bottom)
- Extract: Split "D13@200" into D="D13" and value="200"

## Type 2: FG (Foundation Girder / 地中梁 or フーチング)
These images show a table format with:
- Row "符号" (Symbol) contains the frame name (e.g., "FG1", "FG1A")
- Row "位 置" shows location info (e.g., "X4,X14,Y1,Y5通り" or "Y7通り") - these are different locations for the SAME frame
- Row "B×D" contains dimensions directly (e.g., "500x500") → Split into B="500" and H="500"
- Row "上端筋" (Top reinforcement) contains values like "4-D25" or "6-D25"
- Row "下端筋" (Bottom reinforcement) contains values like "4-D25" or "6-D25"
- Row "St." (Stirrup reinforcement) contains values like "□-D13@100" or "-D13@100"
- Extract: Split "4-D25" into D="D25" and value="4"
- Extract St.: Split "□-D13@100" into D="D13" and value="100" (ignore the □ symbol)

**IMPORTANT: When FG has multiple columns (multiple 位置), the values are typically the SAME. Extract ONLY ONE entry per frame name (符号) using values from the FIRST (leftmost) column. Do NOT create separate entries for each column.**

**EXTRACTION RULES:**

1. **Determine the frame type:**
   - If you see "FW" in the name OR the image shows a wall cross-section diagram → Type FW
   - If you see "FG" in the name OR the image shows a table with 符号, B×D, 上端筋, 下端筋 → Type FG

2. **For FW type:**
   - frameName: The "FW..." label at the top
   - b: The bottom width dimension (e.g., "300")
   - h: The left vertical height dimension (e.g., "350")
   - topRebarD: From ﾖｺ, the rebar size (e.g., "D13" from "D13@200")
   - topRebarValue: From ﾖｺ, the spacing (e.g., "200" from "D13@200")
   - bottomRebarD: From ﾀﾃ, the rebar size (e.g., "D13" from "D13@200")
   - bottomRebarValue: From ﾀﾃ, the spacing (e.g., "200" from "D13@200")
   - stirrupD: Leave BLANK (empty string "") - FW doesn't have St. field
   - stirrupValue: Leave BLANK (empty string "") - FW doesn't have St. field

3. **For FG type:**
   - frameName: Value from 符号 row (e.g., "FG1") - extract ONCE per unique 符号
   - b: First value from B×D from the FIRST column (e.g., "500" from "500x500")
   - h: Second value from B×D from the FIRST column (e.g., "500" from "500x500")
   - topRebarD: From 上端筋 FIRST column, the rebar size (e.g., "D25" from "4-D25")
   - topRebarValue: From 上端筋 FIRST column, the count (e.g., "4" from "4-D25")
   - bottomRebarD: From 下端筋 FIRST column, the rebar size (e.g., "D25" from "4-D25")
   - bottomRebarValue: From 下端筋 FIRST column, the count (e.g., "4" from "4-D25")
   - stirrupD: From St. FIRST column, the rebar size (e.g., "D13" from "□-D13@100")
   - stirrupValue: From St. FIRST column, the spacing value (e.g., "100" from "□-D13@100")

4. **For each unique frame name (符号), output ONLY ONE entry. Multiple columns with different 位置 but same 符号 should be treated as ONE frame.**

5. **Remove any material specifications in parentheses like (SD345) or (SD295).**

**Output a valid JSON array based on the schema provided.**
`;

export const extractFrameData = async (base64Data: string, mimeType: string): Promise<FrameData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

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
            text: FRAME_SYSTEM_PROMPT
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
              frameName: {
                type: Type.STRING,
                description: "The frame identifier (e.g., FW1, FG1, FG1A)"
              },
              b: {
                type: Type.STRING,
                description: "Width dimension B (e.g., '300', '500')"
              },
              h: {
                type: Type.STRING,
                description: "Height dimension H (e.g., '350', '500')"
              },
              topRebarD: {
                type: Type.STRING,
                description: "上端筋 rebar size (e.g., 'D13', 'D25')"
              },
              topRebarValue: {
                type: Type.STRING,
                description: "上端筋 value - spacing for FW (e.g., '200') or count for FG (e.g., '4')"
              },
              bottomRebarD: {
                type: Type.STRING,
                description: "下端筋 rebar size (e.g., 'D13', 'D25')"
              },
              bottomRebarValue: {
                type: Type.STRING,
                description: "下端筋 value - spacing for FW (e.g., '200') or count for FG (e.g., '4')"
              },
              stirrupD: {
                type: Type.STRING,
                description: "St. rebar size (e.g., 'D13') - FG only, empty string for FW"
              },
              stirrupValue: {
                type: Type.STRING,
                description: "St. spacing value (e.g., '100') - FG only, empty string for FW"
              }
            },
            required: ['frameName', 'b', 'h', 'topRebarD', 'topRebarValue', 'bottomRebarD', 'bottomRebarValue', 'stirrupD', 'stirrupValue']
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No data returned from the model.");
    }

    let rawData: any;
    try {
      rawData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw response text:", jsonText);
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // Ensure we have an array (handle both array and single object)
    if (!Array.isArray(rawData)) {
      console.warn('Expected array from model, got:', typeof rawData);
      // If it's a single object, wrap it in an array
      if (typeof rawData === 'object' && rawData !== null) {
        rawData = [rawData];
      } else {
        throw new Error(`Invalid response format - expected array, got ${typeof rawData}`);
      }
    }

    // Validate each item has required fields
    const validatedData = rawData.filter((item: any) => {
      if (!item.frameName || !item.b || !item.h) {
        console.warn('Skipping invalid frame data:', item);
        return false;
      }
      return true;
    });

    if (validatedData.length === 0) {
      throw new Error('No valid frame data found in response');
    }

    console.log(`Extracted ${validatedData.length} frame(s) from image`);

    // Post-processing: Clean any remaining parentheses content
    const cleanValue = (val: string) => val?.replace(/\s*[\(（].*?[\)）]/g, '').trim() || '';

    return validatedData.map((item: FrameData) => ({
      ...item,
      topRebarD: cleanValue(item.topRebarD),
      bottomRebarD: cleanValue(item.bottomRebarD),
    }));

  } catch (error) {
    console.error("Frame Extraction Error:", error);
    throw error;
  }
};
