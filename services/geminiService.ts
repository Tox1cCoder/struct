import {
  createPartFromUri,
  FileState,
  GoogleGenAI,
  Type,
} from "@google/genai";
import {
  CertifiedCoordinateData,
  ColumnReinforcementData,
  FoundationColumnData,
  FoundationPlanCoordinateData,
  FrameData,
  PriorityPipelineDiagnostics,
} from "../types";
import { parseBoundingBox, parsePage } from "../utils/boundingBox";
import {
  normalizeCertifiedCoordinateRows,
  normalizeFoundationPlanCoordinateRows,
  summarizeRawCoordinateRows,
} from "../utils/coordinateExtraction";
import { logError } from "../utils/errorHandling";
import {
  FOUNDATION_PRIORITY_API_VERSION,
  FOUNDATION_PRIORITY_POLL_INTERVAL_MS,
  createFoundationPriorityContents,
  createFoundationPriorityGenerationConfig,
  needsPriorityEscalation,
  selectPriorityPass,
} from "../utils/foundationPriorityGeminiConfig";
import {
  createPriorityDiagnostics,
  finishStage,
  markEscalated,
} from "../utils/foundationPriorityDiagnostics";

const SPATIAL_INSTRUCTION_PDF = `

**Spatial output (REQUIRED for verification):**
For each extracted item, also return:
- "page": the 1-indexed page number where the data appears in the PDF.
- "bbox": an object {"ymin": number, "xmin": number, "ymax": number, "xmax": number} giving normalized 0-1000 coordinates of the rectangle that tightly bounds the extracted data on that page. Use the standard top-left origin convention: ymin/xmin is the upper-left corner, ymax/xmax is the lower-right corner.

If you cannot localize an item confidently on a specific page, omit "bbox" rather than guessing. Always include "page" when you can identify the source page.
`;

const SPATIAL_INSTRUCTION_IMAGE = `

**Spatial output (REQUIRED for verification):**
For each extracted item, also return "bbox": an object {"ymin": number, "xmin": number, "ymax": number, "xmax": number} giving normalized 0-1000 coordinates of the rectangle that tightly bounds the extracted data within the image. Use top-left origin (ymin/xmin = upper-left, ymax/xmax = lower-right).

If you cannot localize an item confidently, omit "bbox" rather than guessing.
`;

const FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF = `

**Verification metadata (optional):**
For each extracted item, include "page" when you can identify the 1-indexed source page.
Include "bbox" only when you can confidently localize the extracted support/foundation item as normalized 0-1000 coordinates: {"ymin": number, "xmin": number, "ymax": number, "xmax": number}.
Do not let bbox estimation block row extraction. If the row values are clear but the exact box is not, return the row and omit "bbox".
`;

const bboxSchemaTyped = {
  type: Type.OBJECT,
  properties: {
    ymin: { type: Type.NUMBER, description: 'Top edge, 0-1000 normalized' },
    xmin: { type: Type.NUMBER, description: 'Left edge, 0-1000 normalized' },
    ymax: { type: Type.NUMBER, description: 'Bottom edge, 0-1000 normalized' },
    xmax: { type: Type.NUMBER, description: 'Right edge, 0-1000 normalized' },
  },
  required: ['ymin', 'xmin', 'ymax', 'xmax'],
};

const bboxSchemaJson = {
  type: 'object',
  properties: {
    ymin: { type: 'number', description: 'Top edge, 0-1000 normalized' },
    xmin: { type: 'number', description: 'Left edge, 0-1000 normalized' },
    ymax: { type: 'number', description: 'Bottom edge, 0-1000 normalized' },
    xmax: { type: 'number', description: 'Right edge, 0-1000 normalized' },
  },
  required: ['ymin', 'xmin', 'ymax', 'xmax'],
  additionalProperties: false,
};

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
    *   Look for the column header **"Ⅰゾーンの場合"** (Zone I Case).
        *   **Priority:** You must extract values from the "Ⅰゾーンの場合" column if it exists.
        *   **Fallback:** Only if "Ⅰゾーンの場合" is completely absent, use the values from "Ⅱゾーンの場合".
    *   Extract the value for **"基礎柱形主筋"** (Main Reinforcement) or "主筋" and map it to "主筋".
    *   Extract the value for **"帯筋"** (Hoop Reinforcement) or "HOOP" and map it to "帯筋".
    *   *Note:* If the table has rows for "Corner/Side" (側・隅柱用) and "Center" (中柱用), check if the values differ. If they are the same, extract the single value. If they differ, list the "Corner/Side" value. (In these specific documents, Zone I values usually match for both rows).

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

type ActiveGeminiPdfFile = {
  name: string;
  uri: string;
  mimeType: string;
};

const CERTIFIED_FOUNDATION_COORDINATE_PROMPT = `
You are reading one layer of a structural foundation drawing set: 認定柱脚資料.

Your job is to extract the certified support code assigned to each grid placement.
This PDF is one layer of the same design as 基礎伏図, so the placement key must identify the physical placement of each object.

For EACH axis, output a canonical locator token:
- If the object centerline is on a main grid line, use that line label, for example X1 or Y3.
- If the object lies between two main grid lines, use a between-line token, for example X1-X2 or Y1-Y2.
- If the drawing shows or implies a half-grid label like X1.5 or Y1.5, normalize it to X1-X2 or Y1-Y2.
- Never collapse an off-grid object to the nearest main axis.

Extraction rules:
1. Find each certified support code that starts with "C" or "P", such as C3009, C3010, C12, P1.
2. For each support code, identify its X-axis locator token and Y-axis locator token.
3. The object or its label may be visually offset from the main grid crossing. Use the object center or centerline projection to determine whether each axis is on-line or between-lines.
4. If the same support code appears in multiple placements, output one row for each placement.
5. Preserve the exact certified code as shown in this PDF. Do not shorten C3009 to C1 and do not convert P1 to C1.
6. Output one row per unique placement-code assignment.
7. Ignore foundation labels that start with F in this PDF, if any exist.
8. Remove whitespace and notes in parentheses from extracted values.
9. If an axis locator cannot be read confidently, omit that row instead of guessing.
${FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF}
Output a valid JSON array based on the provided schema.
`;

const CERTIFIED_FOUNDATION_COORDINATE_FALLBACK_PROMPT = `
You are reading 認定柱脚資料, which is one layer of the same drawing as 基礎伏図.

The previous extraction did not return usable rows. Re-read the PDF carefully and extract only rows where you can identify all three values:
- one certified support code beginning with C or P
- one X-axis locator token
- one Y-axis locator token

Canonical locator format:
- on X1 -> xAxis = X1
- between X1 and X2 -> xAxis = X1-X2
- on Y3 -> yAxis = Y3
- between Y1 and Y2 -> yAxis = Y1-Y2
- if the drawing implies X1.5 or Y1.5, normalize it to X1-X2 or Y1-Y2

Important reading rules:
1. Search for placements in any of these forms: separate X and Y labels, combined strings, half-grid labels, or table cells that imply one X and one Y placement.
2. If a row or callout contains a combined placement, split it into xAxis and yAxis using the canonical locator format above.
3. The object or its label may be offset from the grid crossing. Use the object center or projected centerline to decide whether each axis is on-line or between-lines.
4. Preserve the exact certified code such as C3009 or P1.
5. Do not guess. Omit rows that do not have a readable full placement.
6. Return every confident row you can find, even if there are only a few.

Example output:
[
  { "xAxis": "X1", "yAxis": "Y1", "columnType": "C3009", "page": 1, "bbox": { "ymin": 410, "xmin": 220, "ymax": 470, "xmax": 290 } },
  { "xAxis": "X4", "yAxis": "Y6-Y7", "columnType": "P1", "page": 2 }
]
${FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF}
Output a valid JSON array based on the provided schema.
`;

const FOUNDATION_PLAN_COORDINATE_PROMPT = `
You are reading one layer of the same structural foundation drawing set: 基礎伏図.

Your job is to extract each foundation label together with its grid placement and any FC, C, or P code shown at that same support location.
This PDF is one layer of the same design as 認定柱脚資料, so the placement key must identify the same physical placement that can be matched across both PDFs.

For EACH axis, output a canonical locator token:
- If the support object centerline is on a main grid line, use that line label, for example X1 or Y3.
- If the support object lies between two main grid lines, use a between-line token, for example X1-X2 or Y1-Y2.
- If the drawing shows or implies a half-grid label like X1.5 or Y1.5, normalize it to X1-X2 or Y1-Y2.
- Never collapse an off-grid object to the nearest main axis.

Extraction rules:
1. Find each foundation label that starts with "F", such as F1, F11C, FK1, F659834.
2. A single foundation can contain multiple support objects or support codes. If that happens, output multiple rows with the same foundation label.
3. For each support object within a foundation, identify its X-axis locator token and Y-axis locator token.
4. The foundation, support object, or label may be visually offset from the main grid crossing. Use the support object center or centerline projection to determine whether each axis is on-line or between-lines.
5. Extract the code shown at that same support location into planColumnType:
   - If an FC code is shown, preserve the exact FC code.
   - If only a C or P code alias is shown, preserve it ONLY when the alias text is colored or the alias is surrounded by a colored highlight/background.
   - If a C or P alias is plain monochrome or not highlighted, do not trust it. In that case return an empty string for planColumnType.
   - If no code is visible, use an empty string.
6. If both FC and C/P are visible for the same support location, choose the FC code.
7. Preserve the exact foundation label as shown in the plan.
8. Remove whitespace and notes in parentheses from extracted values.
9. Also return isHighlighted:
   - true if the chosen visible alias is colored or has a colored background/highlight
   - false if the chosen visible alias is plain monochrome or if no alias is visible
10. Also return highlightColor with a simple color name like YELLOW, CYAN, BLUE, GREEN, PINK, RED, or empty string if none.
11. Output one row per unique support location. The same foundation label may appear multiple times.
12. If an axis locator cannot be read confidently, omit that row instead of guessing.
${FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF}
Output a valid JSON array based on the provided schema.
`;

const FOUNDATION_PLAN_COORDINATE_FALLBACK_PROMPT = `
You are reading 基礎伏図, which is one layer of the same drawing as 認定柱脚資料.

The previous extraction did not return usable rows. Re-read the PDF carefully and extract only rows where you can identify:
- one foundation label beginning with F
- one support location within that foundation
- one X-axis locator token
- one Y-axis locator token
- an FC code if visible, otherwise a visible C or P code alias, otherwise an empty string
- whether that visible alias is highlighted/colored
- the highlight color name if present

Important reading rules:
1. Canonical locator format:
   - on X1 -> xAxis = X1
   - between X1 and X2 -> xAxis = X1-X2
   - on Y3 -> yAxis = Y3
   - between Y1 and Y2 -> yAxis = Y1-Y2
   - if the drawing implies X1.5 or Y1.5, normalize it to X1-X2 or Y1-Y2
2. Search for placements in any of these forms: separate X and Y labels, combined strings, half-grid labels, or table/callout combinations that clearly indicate one X and one Y placement.
3. If one foundation contains multiple support objects, return multiple rows with the same foundation label.
4. The foundation, support object, or label may be offset from the grid crossing. Use the support object center or projected centerline to decide whether each axis is on-line or between-lines.
5. Prefer colored aliases in 基礎伏図. If a C or P alias is plain monochrome and not highlighted, set planColumnType to an empty string and set isHighlighted to false.
6. If both FC and C/P appear for the same support location, choose FC.
7. Preserve the exact foundation label such as F1, FK1, F659834.
8. Do not guess. Omit rows that do not have a readable full placement.
9. Return every confident row you can find, even if there are only a few.

Example output:
[
  { "foundation": "F1", "xAxis": "X1", "yAxis": "Y1", "planColumnType": "FC1", "isHighlighted": true, "highlightColor": "YELLOW", "page": 1, "bbox": { "ymin": 220, "xmin": 410, "ymax": 280, "xmax": 480 } },
  { "foundation": "F1", "xAxis": "X1-X2", "yAxis": "Y2", "planColumnType": "", "isHighlighted": false, "highlightColor": "", "page": 1 }
]
${FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF}
Output a valid JSON array based on the provided schema.
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
    ${mimeType === 'application/pdf' ? SPATIAL_INSTRUCTION_PDF : SPATIAL_INSTRUCTION_IMAGE}
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
              },
              page: {
                type: Type.NUMBER,
                description: '1-indexed PDF page number where the data was found. Omit for single-image inputs.'
              },
              bbox: bboxSchemaTyped,
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

    return validatedData.map((item: any): ColumnReinforcementData => ({
      columnType: item.columnType,
      columnDimensions: item.columnDimensions,
      mainReinforcement: cleanValue(item.mainReinforcement),
      hoopReinforcement: cleanValue(item.hoopReinforcement),
      page: parsePage(item.page),
      bbox: parseBoundingBox(item.bbox),
    }));

  } catch (error) {
    logError("Gemini Extraction Error:", error);
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
    logError("Foundation-Column Extraction Error:", error);
    throw error;
  }
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const uploadPdfAndWaitUntilActive = async (ai: GoogleGenAI, file: File): Promise<ActiveGeminiPdfFile> => {
  const uploadedFile = await ai.files.upload({
    file,
    config: {
      mimeType: file.type || 'application/pdf',
      displayName: file.name,
    },
  });

  if (!uploadedFile.name) {
    throw new Error('Gemini Files API did not return a file name.');
  }

  const fileName = uploadedFile.name;
  let currentFile = uploadedFile;

  while (currentFile.state === FileState.PROCESSING) {
    await sleep(FOUNDATION_PRIORITY_POLL_INTERVAL_MS);
    currentFile = await ai.files.get({ name: fileName });
  }

  if (currentFile.state !== FileState.ACTIVE || !currentFile.uri || !currentFile.mimeType) {
    throw new Error(`Gemini file processing did not complete successfully. State: ${currentFile.state ?? 'UNKNOWN'}`);
  }

  return {
    name: fileName,
    uri: currentFile.uri,
    mimeType: currentFile.mimeType,
  };
};

const parseStructuredArrayResponse = (rawData: unknown): any[] => {
  let normalizedRawData = rawData;

  if (!Array.isArray(normalizedRawData)) {
    if (typeof normalizedRawData === 'object' && normalizedRawData !== null) {
      normalizedRawData = [normalizedRawData];
    } else {
      throw new Error(`Invalid response format - expected array, got ${typeof normalizedRawData}`);
    }
  }

  return normalizedRawData as any[];
};

const certifiedCoordinateResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      xAxis: {
        type: 'string',
        description: 'The canonical X-axis locator token such as X1, X2A, X10, or X1-X2 when the object lies between lines'
      },
      yAxis: {
        type: 'string',
        description: 'The canonical Y-axis locator token such as Y1, Y2A, Y10, or Y1-Y2 when the object lies between lines'
      },
      columnType: {
        type: 'string',
        description: 'The exact certified C or P code such as C3009, C3010, C12, P1'
      },
      page: {
        type: 'number',
        description: '1-indexed page number in the PDF where this support code appears.'
      },
      bbox: bboxSchemaJson,
    },
    required: ['xAxis', 'yAxis', 'columnType'],
    additionalProperties: false
  }
};

const foundationPlanCoordinateResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      foundation: {
        type: 'string',
        description: 'The exact foundation label such as F1, F11C, FK1, F659834. The same foundation may appear in multiple rows.'
      },
      xAxis: {
        type: 'string',
        description: 'The canonical X-axis locator token such as X1, X2A, X10, or X1-X2 when the support lies between lines'
      },
      yAxis: {
        type: 'string',
        description: 'The canonical Y-axis locator token such as Y1, Y2A, Y10, or Y1-Y2 when the support lies between lines'
      },
      planColumnType: {
        type: 'string',
        description: 'The exact FC code if visible at this support location, otherwise the visible C or P alias, otherwise an empty string'
      },
      isHighlighted: {
        type: 'boolean',
        description: 'True if the chosen visible alias is colored or has a colored background/highlight. False for plain monochrome aliases or when no alias is visible.'
      },
      highlightColor: {
        type: 'string',
        description: 'Simple highlight color name such as YELLOW, CYAN, BLUE, GREEN, PINK, RED, or empty string if none'
      },
      page: {
        type: 'number',
        description: '1-indexed page number in the PDF where this support location appears.'
      },
      bbox: bboxSchemaJson,
    },
    required: ['foundation', 'xAxis', 'yAxis', 'planColumnType', 'isHighlighted', 'highlightColor'],
    additionalProperties: false
  }
};

let cachedFoundationPriorityClient: GoogleGenAI | null = null;
const getFoundationPriorityClient = () => {
  if (cachedFoundationPriorityClient) return cachedFoundationPriorityClient;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }
  cachedFoundationPriorityClient = new GoogleGenAI({
    apiKey,
    apiVersion: FOUNDATION_PRIORITY_API_VERSION,
  });
  return cachedFoundationPriorityClient;
};

const withActivePdf = async <T>(
  ai: GoogleGenAI,
  file: File,
  work: (active: ActiveGeminiPdfFile, uploadMs: number) => Promise<T>,
): Promise<T> => {
  const uploadStart = Date.now();
  const active = await uploadPdfAndWaitUntilActive(ai, file);
  const uploadMs = Date.now() - uploadStart;
  try {
    return await work(active, uploadMs);
  } finally {
    try {
      await ai.files.delete({ name: active.name });
    } catch (error) {
      logError(`Unable to release uploaded Gemini file ${active.name}`, error);
    }
  }
};

const generateAgainstActivePdf = async (
  ai: GoogleGenAI,
  active: ActiveGeminiPdfFile,
  prompt: string,
  responseJsonSchema: object,
  pass: 'primary' | 'escalated',
) => {
  const passConfig = selectPriorityPass(pass);
  const filePart = createPartFromUri(active.uri, active.mimeType, passConfig.mediaResolution);
  const response = await ai.models.generateContent({
    model: passConfig.model,
    contents: createFoundationPriorityContents(filePart, prompt),
    config: createFoundationPriorityGenerationConfig(responseJsonSchema, passConfig.thinkingLevel),
  });
  const jsonText = response.text;
  if (!jsonText) {
    throw new Error('No data returned from the model.');
  }
  return parseStructuredArrayResponse(JSON.parse(jsonText));
};

interface PriorityExtractionResult<T> {
  data: T[];
  diagnostics: PriorityPipelineDiagnostics;
}

export const extractCertifiedCoordinateData = async (
  file: File,
): Promise<PriorityExtractionResult<CertifiedCoordinateData>> => {
  const ai = getFoundationPriorityClient();
  const totalStart = Date.now();
  let diagnostics = createPriorityDiagnostics(file.name, 'certified');

  const result = await withActivePdf(ai, file, async (active, uploadMs) => {
    diagnostics = finishStage(diagnostics, 'upload', uploadMs);

    const primaryStart = Date.now();
    const primaryRaw = await generateAgainstActivePdf(
      ai,
      active,
      CERTIFIED_FOUNDATION_COORDINATE_PROMPT,
      certifiedCoordinateResponseSchema,
      'primary',
    );
    diagnostics = finishStage(diagnostics, 'primaryGeneration', Date.now() - primaryStart);

    const primaryValidateStart = Date.now();
    let validated = normalizeCertifiedCoordinateRows(primaryRaw);
    diagnostics = finishStage(diagnostics, 'primaryValidation', Date.now() - primaryValidateStart);

    if (needsPriorityEscalation('certified', validated.length, validated.length)) {
      diagnostics = markEscalated(diagnostics, 'normalized-rows-empty');
      logError(
        `Certified coordinate extraction returned unusable rows for ${file.name}. Primary raw sample:`,
        summarizeRawCoordinateRows(primaryRaw),
      );

      const fallbackStart = Date.now();
      const fallbackRaw = await generateAgainstActivePdf(
        ai,
        active,
        CERTIFIED_FOUNDATION_COORDINATE_FALLBACK_PROMPT,
        certifiedCoordinateResponseSchema,
        'escalated',
      );
      diagnostics = finishStage(diagnostics, 'fallbackGeneration', Date.now() - fallbackStart);

      const fallbackValidateStart = Date.now();
      validated = normalizeCertifiedCoordinateRows(fallbackRaw);
      diagnostics = finishStage(diagnostics, 'fallbackValidation', Date.now() - fallbackValidateStart);

      if (validated.length === 0) {
        logError(
          `Certified coordinate extraction still returned unusable rows for ${file.name}. Fallback raw sample:`,
          summarizeRawCoordinateRows(fallbackRaw),
        );
        throw new Error('No valid certified coordinate data found in response. Gemini returned rows, but none contained a readable governing X/Y coordinate and certified C/P code.');
      }
    }

    return validated;
  });

  diagnostics = finishStage(diagnostics, 'total', Date.now() - totalStart);
  return { data: result, diagnostics };
};

export const extractFoundationPlanCoordinateData = async (
  file: File,
): Promise<PriorityExtractionResult<FoundationPlanCoordinateData>> => {
  const ai = getFoundationPriorityClient();
  const totalStart = Date.now();
  let diagnostics = createPriorityDiagnostics(file.name, 'plan');

  const result = await withActivePdf(ai, file, async (active, uploadMs) => {
    diagnostics = finishStage(diagnostics, 'upload', uploadMs);

    const primaryStart = Date.now();
    const primaryRaw = await generateAgainstActivePdf(
      ai,
      active,
      FOUNDATION_PLAN_COORDINATE_PROMPT,
      foundationPlanCoordinateResponseSchema,
      'primary',
    );
    diagnostics = finishStage(diagnostics, 'primaryGeneration', Date.now() - primaryStart);

    const primaryValidateStart = Date.now();
    let validated = normalizeFoundationPlanCoordinateRows(primaryRaw);
    diagnostics = finishStage(diagnostics, 'primaryValidation', Date.now() - primaryValidateStart);

    const resolvable = validated.filter((row) => row.xAxis && row.yAxis).length;
    if (needsPriorityEscalation('plan', validated.length, resolvable)) {
      diagnostics = markEscalated(
        diagnostics,
        validated.length === 0 ? 'normalized-rows-empty' : 'no-resolvable-locations',
      );
      logError(
        `Foundation plan extraction returned unusable rows for ${file.name}. Primary raw sample:`,
        summarizeRawCoordinateRows(primaryRaw),
      );

      const fallbackStart = Date.now();
      const fallbackRaw = await generateAgainstActivePdf(
        ai,
        active,
        FOUNDATION_PLAN_COORDINATE_FALLBACK_PROMPT,
        foundationPlanCoordinateResponseSchema,
        'escalated',
      );
      diagnostics = finishStage(diagnostics, 'fallbackGeneration', Date.now() - fallbackStart);

      const fallbackValidateStart = Date.now();
      validated = normalizeFoundationPlanCoordinateRows(fallbackRaw);
      diagnostics = finishStage(diagnostics, 'fallbackValidation', Date.now() - fallbackValidateStart);

      if (validated.length === 0) {
        logError(
          `Foundation plan extraction still returned unusable rows for ${file.name}. Fallback raw sample:`,
          summarizeRawCoordinateRows(fallbackRaw),
        );
        throw new Error('No valid foundation plan coordinate data found in response. Gemini returned rows, but none contained a readable foundation label with a governing X/Y coordinate.');
      }
    }

    return validated;
  });

  diagnostics = finishStage(diagnostics, 'total', Date.now() - totalStart);
  return { data: result, diagnostics };
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
${SPATIAL_INSTRUCTION_IMAGE}
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
              },
              bbox: bboxSchemaTyped,
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

    return validatedData.map((item: any): FrameData => ({
      frameName: item.frameName,
      b: item.b,
      h: item.h,
      topRebarD: cleanValue(item.topRebarD),
      topRebarValue: item.topRebarValue,
      bottomRebarD: cleanValue(item.bottomRebarD),
      bottomRebarValue: item.bottomRebarValue,
      stirrupD: item.stirrupD,
      stirrupValue: item.stirrupValue,
      bbox: parseBoundingBox(item.bbox),
    }));

  } catch (error) {
    logError("Frame Extraction Error:", error);
    throw error;
  }
};
