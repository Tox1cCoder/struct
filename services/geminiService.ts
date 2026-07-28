import {
  createPartFromUri,
  FileState,
  GoogleGenAI,
  PartMediaResolutionLevel,
  Type,
  type PartUnion,
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
import { normalizeFrameData } from "../utils/frameData";
import { FRAME_IMAGE_MODEL, selectColumnRequestPolicy } from './geminiRequestPolicy';
import {
  normalizeCertifiedCoordinateRows,
  normalizeFoundationPlanCoordinateRows,
  summarizeRawCoordinateRows,
} from "../utils/coordinateExtraction";
import { logError } from "../utils/errorHandling";
import {
  evaluateFoundationPlanCoverage,
  mergePriorityPlanRows,
} from '../utils/foundationPriorityCoverage';
import { renderPdfAnchorCrop } from '../utils/pdfAnchorCrop';
import {
  extractPriorityPdfAnchors,
  PdfAnchorInventory,
  serializePriorityAnchorManifest,
} from '../utils/pdfTextAnchors';
import {
  FOUNDATION_PRIORITY_API_VERSION,
  FOUNDATION_PRIORITY_POLL_INTERVAL_MS,
  createFoundationPriorityContents,
  createFoundationPriorityGenerationConfig,
  needsPriorityEscalation,
  selectPriorityPass,
} from "../utils/foundationPriorityGeminiConfig";
import {
  addPriorityWarning,
  createPriorityDiagnostics,
  finishStage,
  incrementPriorityCropCount,
  markEscalated,
  recordPriorityAnchors,
  recordPriorityCoverage,
  recordPriorityRequest,
  recordPriorityUsage,
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
export const REINFORCEMENT_SYSTEM_PROMPT = `
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
    *   **Column selection (which zone):** Look for the column header **"Ⅰゾーンの場合"** (Zone I Case).
        *   **Priority:** You MUST read values from the "Ⅰゾーンの場合" column whenever it exists. Apply this to EVERY value you take from the "基礎柱形設計例" table — 柱形, 基礎柱形主筋, and 帯筋 — not just the reinforcement.
        *   **Fallback:** Only if "Ⅰゾーンの場合" is completely absent, use the values from "Ⅱゾーンの場合".
    *   **Row selection (which row):** If the table has separate rows for "Corner/Side" (側・隅柱用) and "Center" (中柱用), always extract the **"側・隅柱用"** (Corner/Side) row. If only one row exists, use that row. Do not assume the rows are identical — read the 側・隅柱用 row explicitly.
    *   **Column Dimensions:** Look for fields labeled "柱形(mm)", "柱形断面", "B×D", or similar dimension specifications. If the dimension appears in the "基礎柱形設計例" table, take it from the selected Ⅰゾーン / 側・隅柱用 cell. Extract the dimensions (e.g., "1,400×1,400" or "770×770"). If dimensions contain text in parentheses like "柱形(mm)", ignore the parentheses content and extract only the dimension values.
    *   Extract the value for **"基礎柱形主筋"** (Main Reinforcement) or "主筋" from the selected Ⅰゾーン / 側・隅柱用 cell and map it to "主筋".
    *   Extract the value for **"帯筋"** (Hoop Reinforcement) or "HOOP" from the selected Ⅰゾーン / 側・隅柱用 cell and map it to "帯筋".

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

/**
 * A PDF ready to be attached to a request, either as inline bytes or as a
 * reference to a file already uploaded through the Files API.
 */
type PriorityPdfSource =
  | { kind: 'inline'; base64: string; mimeType: string; file: File; anchors: PdfAnchorInventory }
  | { kind: 'uploaded'; active: ActiveGeminiPdfFile; file: File; anchors: PdfAnchorInventory };

export const CERTIFIED_FOUNDATION_COORDINATE_PROMPT = `
You are reading one layer of a structural foundation drawing set: 認定柱脚資料.

Your job is to extract the certified support code assigned to each grid placement.
This PDF is one layer of the same design as 基礎伏図, so the placement key must identify the physical placement of each object.

Output objects must use these exact JSON keys: xAxis, yAxis, columnType, page, bbox.
Do not use snake_case keys such as x_axis/y_axis, and do not use "type" instead of columnType.

For EACH axis, output a canonical locator token:
- If the object centerline is on a main grid line, use that line label, for example X1 or Y3.
- If the object lies between two main grid lines, use a between-line token, for example X1-X2 or Y1-Y2.
- If the drawing shows or implies a half-grid label like X1.5 or Y1.5, normalize it to X1-X2 or Y1-Y2.
- Never collapse an off-grid object to the nearest main axis.

Extraction rules:
1. Find each certified support code that starts with "C" or "P", or has a numeric prefix before C/P, such as C3009, C3010, C12, P1, 1C2, 1C11.
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
- one certified support code beginning with C or P, or a numeric-prefixed C/P code such as 1C2 or 1C11
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
4. Preserve the exact certified code such as C3009, P1, 1C2, or 1C11.
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

export const FOUNDATION_PLAN_COORDINATE_PROMPT = `
You are reading one layer of the same structural foundation drawing set: 基礎伏図.

Your job is to extract each foundation label together with its grid placement and any FC, C, P, or numeric-prefixed C/P code shown at that same support location.
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
   - If only a visible C or P code alias is shown, including numeric-prefixed aliases like 1C2, preserve that exact alias in planColumnType.
   - Do not erase plain C/P aliases or numeric-prefixed C/P aliases. Use isHighlighted and highlightColor to report whether the alias was colored/highlighted.
   - If no code is visible, use an empty string.
6. If both FC and C/P are visible for the same support location, choose the FC code.
7. Preserve the exact foundation label as shown in the plan.
8. Remove whitespace and notes in parentheses from extracted values.
9. Also return isHighlighted:
   - true if the chosen visible alias is colored or has a colored background/highlight
   - false if the chosen visible alias is plain monochrome or if no alias is visible
10. Also return highlightColor with a simple color name like YELLOW, CYAN, BLUE, GREEN, PINK, RED, or empty string if none.
11. Output one row per unique support location only when the foundation or support location is visibly present in the drawing. The same foundation label may appear multiple times.
12. Do not create inferred rows for grid intersections where the foundation/support symbol is not visibly present.
13. If an axis locator cannot be read confidently, omit that row instead of returning empty xAxis or yAxis. A final mapping cannot be resolved without both axes.
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
- an FC code if visible, otherwise a visible C or P code alias such as C1, P1, or 1C2, otherwise an empty string
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
5. Preserve any visible C or P alias, including numeric-prefixed aliases like 1C2, in planColumnType. Set isHighlighted to true only when the alias is colored/highlighted; otherwise set isHighlighted to false.
6. If both FC and C/P appear for the same support location, choose FC.
7. Preserve the exact foundation label such as F1, FK1, F659834.
8. Do not guess axis locators. Omit rows that do not have a readable full placement.
9. Do not create inferred rows for grid intersections where the foundation/support symbol is not visibly present.
10. Return every confident row you can find, even if there are only a few.

Example output:
[
  { "foundation": "F1", "xAxis": "X1", "yAxis": "Y1", "planColumnType": "FC1", "isHighlighted": true, "highlightColor": "YELLOW", "page": 1, "bbox": { "ymin": 220, "xmin": 410, "ymax": 280, "xmax": 480 } },
  { "foundation": "F1", "xAxis": "X1-X2", "yAxis": "Y2", "planColumnType": "C1", "isHighlighted": false, "highlightColor": "", "page": 1 }
]
${FOUNDATION_PRIORITY_SPATIAL_INSTRUCTION_PDF}
Output a valid JSON array based on the provided schema.
`;

export const FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT = `
You are reading 基礎伏図 after coordinate-based extraction did not produce usable foundation-to-column codes.

Your job is to extract a direct foundation-to-column mapping from visible labels in the plan.
Do not require xAxis or yAxis for this fallback. Return rows when a foundation label and a visible FC, C, P, or numeric-prefixed C/P code are visually associated with the same footing/support.

Extraction rules:
1. Find foundation labels beginning with F, such as F1, F1A, F10, FK1.
2. Find the visible code associated with that foundation/support:
   - Prefer an FC code over any C, P, or numeric-prefixed C/P code at the same support.
   - If no FC is visible, preserve the visible C or P code, including numeric-prefixed labels like 1C2.
3. Do not return rows with an empty planColumnType.
4. Do not infer a code from grid position alone. Use only visible text/callout association.
5. If one foundation has multiple distinct visible associated codes, return one row per distinct code.
6. Preserve exact foundation and code labels, removing only whitespace and parenthesized elevation notes.
7. Return isHighlighted and highlightColor when the associated code is colored/highlighted; otherwise use false and an empty string.

Output objects must use these exact JSON keys: foundation, planColumnType, isHighlighted, highlightColor, page, bbox.
Output a valid JSON array based on the provided schema.
`;

export const extractDataFromPdf = async (base64Data: string, mimeType: string): Promise<ColumnReinforcementData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const requestPolicy = selectColumnRequestPolicy(mimeType);
  const finalPrompt = `
    ${REINFORCEMENT_SYSTEM_PROMPT}

    **Refinement Instructions:**
    *   When extracting reinforcement values (e.g., "24-D25 (SD345)"), **REMOVE** the material information in parentheses.
    *   Example: "24-D25 (SD345)" should become "24-D25".
    *   Example: "D13@100 (SD295)" should become "D13@100".

    **OUTPUT FORMAT:**
    Strictly output a valid JSON array based on the schema provided. Do not wrap it in Markdown fences or add commentary.
    ${mimeType === 'application/pdf' ? SPATIAL_INSTRUCTION_PDF : SPATIAL_INSTRUCTION_IMAGE}
  `;

  try {
    const response = await ai.models.generateContent({
      model: requestPolicy.model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            },
            ...(requestPolicy.mediaResolution
              ? { mediaResolution: { level: requestPolicy.mediaResolution } }
              : {}),
          },
          {
            text: finalPrompt
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        ...(requestPolicy.thinkingLevel
          ? { thinkingConfig: { thinkingLevel: requestPolicy.thinkingLevel } }
          : {}),
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

    let rawData: any;
    try {
      rawData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw response text:", jsonText);
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    if (!Array.isArray(rawData)) {
      if (typeof rawData === 'object' && rawData !== null) {
        rawData = [rawData];
      } else {
        throw new Error(`Invalid response format - expected array, got ${typeof rawData}`);
      }
    }

    // Post-processing: Clean foundation labels (remove SGL notes and parentheses)
    const cleanFoundation = (val: string) => val.replace(/\s*[\(（].*?[\)）]/g, '').trim();

    return rawData
      .filter((item: any): item is FoundationColumnData => {
        if (typeof item?.foundation !== 'string' || typeof item?.columnType !== 'string') {
          console.warn('Skipping invalid foundation-column data:', item);
          return false;
        }
        return true;
      })
      .map((item: FoundationColumnData) => ({
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
        description: 'The exact certified C, P, or numeric-prefixed C/P code such as C3009, C3010, C12, P1, 1C2, 1C11'
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
        description: 'The exact FC code if visible at this support location, otherwise the visible C, P, or numeric-prefixed C/P alias, otherwise an empty string'
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

const foundationPlanDirectMappingResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      foundation: {
        type: 'string',
        description: 'The exact foundation label such as F1, F1A, F10, FK1.'
      },
      planColumnType: {
        type: 'string',
        description: 'The exact visible FC, C, P, or numeric-prefixed C/P code associated with this foundation. Do not return empty strings.'
      },
      isHighlighted: {
        type: 'boolean',
        description: 'True if the associated code is colored or has a colored background/highlight. False otherwise.'
      },
      highlightColor: {
        type: 'string',
        description: 'Simple highlight color name such as YELLOW, CYAN, BLUE, GREEN, PINK, RED, or empty string if none'
      },
      page: {
        type: 'number',
        description: '1-indexed page number in the PDF where this mapping appears.'
      },
      bbox: bboxSchemaJson,
    },
    required: ['foundation', 'planColumnType', 'isHighlighted', 'highlightColor'],
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

/**
 * Largest PDF we attach inline. The Gemini API caps a whole request at 20 MB and
 * base64 inflates bytes by 4/3, so this leaves room for the prompt and schema.
 */
const MAX_INLINE_PDF_BYTES = 12 * 1024 * 1024;

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(`Could not read ${file.name} as base64.`));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(file);
  });

/**
 * Attach the PDF to the request and run `work`.
 *
 * Inline bytes are the default: the Files API resumable-upload endpoint is
 * routinely unreachable from a browser behind TLS-inspecting proxies or
 * antivirus, which surfaces as an opaque `TypeError: Failed to fetch` — while
 * the plain generateContent call to the same host works. Only files too large
 * to inline fall back to uploading, which is also the only case that needs it.
 */
const withPriorityPdf = async <T>(
  ai: GoogleGenAI,
  file: File,
  work: (source: PriorityPdfSource, prepareMs: number, preprocessMs: number) => Promise<T>,
): Promise<T> => {
  const prepareStart = Date.now();
  const anchorPromise = (async () => {
    const started = Date.now();
    const anchors = await extractPriorityPdfAnchors(file);
    return { anchors, preprocessMs: Date.now() - started };
  })();

  if (file.size <= MAX_INLINE_PDF_BYTES) {
    const [base64, anchorResult] = await Promise.all([
      readFileAsBase64(file),
      anchorPromise,
    ]);
    const source: PriorityPdfSource = {
      kind: 'inline',
      base64,
      mimeType: file.type || 'application/pdf',
      file,
      anchors: anchorResult.anchors,
    };
    return work(source, Date.now() - prepareStart, anchorResult.preprocessMs);
  }

  let active: ActiveGeminiPdfFile;
  let anchorResult: Awaited<typeof anchorPromise>;
  try {
    [active, anchorResult] = await Promise.all([
      uploadPdfAndWaitUntilActive(ai, file),
      anchorPromise,
    ]);
  } catch (error) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB, which is too large to send inline, ` +
        `and uploading it to the Gemini Files API failed (${error instanceof Error ? error.message : String(error)}). ` +
        `Split the PDF into parts under ${MAX_INLINE_PDF_BYTES / 1024 / 1024} MB and try again.`,
    );
  }
  const prepareMs = Date.now() - prepareStart;

  try {
    return await work(
      { kind: 'uploaded', active, file, anchors: anchorResult.anchors },
      prepareMs,
      anchorResult.preprocessMs,
    );
  } finally {
    try {
      await ai.files.delete({ name: active.name });
    } catch (error) {
      logError(`Unable to release uploaded Gemini file ${active.name}`, error);
    }
  }
};

/** Build the PDF part, keeping the pass's media resolution either way. */
const createPriorityPdfPart = (source: PriorityPdfSource, mediaResolution: PartMediaResolutionLevel) =>
  source.kind === 'uploaded'
    ? createPartFromUri(source.active.uri, source.active.mimeType, mediaResolution)
    : {
        inlineData: { mimeType: source.mimeType, data: source.base64 },
        mediaResolution: { level: mediaResolution },
      };

const generateAgainstPriorityPdf = async (
  ai: GoogleGenAI,
  source: PriorityPdfSource,
  prompt: string,
  responseJsonSchema: object,
  pass: 'primary' | 'escalated',
  additionalParts: PartUnion[] = [],
) => {
  const passConfig = selectPriorityPass(pass);
  const filePart = createPriorityPdfPart(source, passConfig.mediaResolution);
  const response = await ai.models.generateContent({
    model: passConfig.model,
    contents: createFoundationPriorityContents(filePart, prompt, additionalParts),
    config: createFoundationPriorityGenerationConfig(responseJsonSchema, passConfig.thinkingLevel),
  });
  const jsonText = response.text;
  if (!jsonText) {
    throw new Error('No data returned from the model.');
  }
  return {
    raw: parseStructuredArrayResponse(JSON.parse(jsonText)),
    usage: response.usageMetadata,
  };
};

const addStageDuration = (
  diagnostics: PriorityPipelineDiagnostics,
  stage: 'fallbackGeneration' | 'fallbackValidation',
  durationMs: number,
) => {
  const existing =
    stage === 'fallbackGeneration'
      ? diagnostics.stages.fallbackGenerationMs ?? 0
      : diagnostics.stages.fallbackValidationMs ?? 0;
  return finishStage(diagnostics, stage, existing + durationMs);
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

  const result = await withPriorityPdf(ai, file, async (source, prepareMs, preprocessMs) => {
    diagnostics = finishStage(diagnostics, 'upload', prepareMs);
    diagnostics = finishStage(diagnostics, 'preprocess', preprocessMs);
    diagnostics = recordPriorityAnchors(diagnostics, source.anchors);
    diagnostics = recordPriorityRequest(diagnostics, 'primary', selectPriorityPass('primary'));
    const prompt = `${serializePriorityAnchorManifest(source.anchors)}\n\n${CERTIFIED_FOUNDATION_COORDINATE_PROMPT}`;

    const primaryStart = Date.now();
    const primaryResult = await generateAgainstPriorityPdf(
      ai,
      source,
      prompt,
      certifiedCoordinateResponseSchema,
      'primary',
    );
    const primaryRaw = primaryResult.raw;
    diagnostics = recordPriorityUsage(diagnostics, 'primary', primaryResult.usage);
    diagnostics = finishStage(diagnostics, 'primaryGeneration', Date.now() - primaryStart);

    const primaryValidateStart = Date.now();
    let validated = normalizeCertifiedCoordinateRows(primaryRaw);
    diagnostics = finishStage(diagnostics, 'primaryValidation', Date.now() - primaryValidateStart);

    if (needsPriorityEscalation('certified', validated.length, validated.length)) {
      diagnostics = markEscalated(diagnostics, 'normalized-rows-empty');
      diagnostics = recordPriorityRequest(diagnostics, 'escalated', selectPriorityPass('escalated'));
      logError(
        `Certified coordinate extraction returned unusable rows for ${file.name}. Primary raw sample:`,
        summarizeRawCoordinateRows(primaryRaw),
      );

      const fallbackStart = Date.now();
      const fallbackResult = await generateAgainstPriorityPdf(
        ai,
        source,
        `${serializePriorityAnchorManifest(source.anchors)}\n\n${CERTIFIED_FOUNDATION_COORDINATE_FALLBACK_PROMPT}`,
        certifiedCoordinateResponseSchema,
        'escalated',
      );
      const fallbackRaw = fallbackResult.raw;
      diagnostics = recordPriorityUsage(diagnostics, 'escalated', fallbackResult.usage);
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

  const result = await withPriorityPdf(ai, file, async (source, prepareMs, preprocessMs) => {
    diagnostics = finishStage(diagnostics, 'upload', prepareMs);
    diagnostics = finishStage(diagnostics, 'preprocess', preprocessMs);
    diagnostics = recordPriorityAnchors(diagnostics, source.anchors);
    diagnostics = recordPriorityRequest(diagnostics, 'primary', selectPriorityPass('primary'));
    const manifestedPrompt = `${serializePriorityAnchorManifest(source.anchors)}\n\n${FOUNDATION_PLAN_COORDINATE_PROMPT}`;

    const primaryStart = Date.now();
    const primaryResult = await generateAgainstPriorityPdf(
      ai,
      source,
      manifestedPrompt,
      foundationPlanCoordinateResponseSchema,
      'primary',
    );
    const primaryRaw = primaryResult.raw;
    diagnostics = recordPriorityUsage(diagnostics, 'primary', primaryResult.usage);
    diagnostics = finishStage(diagnostics, 'primaryGeneration', Date.now() - primaryStart);

    const primaryValidateStart = Date.now();
    let validated = normalizeFoundationPlanCoordinateRows(primaryRaw);
    let coverage = evaluateFoundationPlanCoverage(source.anchors, validated);
    diagnostics = finishStage(diagnostics, 'primaryValidation', Date.now() - primaryValidateStart);
    diagnostics = recordPriorityCoverage(diagnostics, coverage);

    if (!coverage.complete) {
      const targetLabels = [...new Set([...coverage.missingLabels, ...coverage.unresolvedLabels])]
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      diagnostics = markEscalated(diagnostics, coverage.reasons.join(', '));
      diagnostics = recordPriorityRequest(diagnostics, 'escalated', selectPriorityPass('escalated'));

      const targetSet = new Set(targetLabels);
      const cropResults = await Promise.allSettled(
        source.anchors.anchors
          .filter((anchor) => anchor.kind === 'foundation' && targetSet.has(anchor.label))
          .map((anchor) => renderPdfAnchorCrop(source.file, anchor)),
      );
      const cropParts: PartUnion[] = cropResults.flatMap((cropResult) =>
        cropResult.status === 'fulfilled'
          ? [{
              inlineData: { mimeType: cropResult.value.mimeType, data: cropResult.value.data },
              mediaResolution: { level: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH },
            }]
          : [],
      );
      diagnostics = incrementPriorityCropCount(diagnostics, cropParts.length);

      const targetInstruction = `TARGETED RETRY: Extract only these missing or unresolved foundation labels: ${targetLabels.join(', ')}. Return every readable support location for them. The attached PNG crops, when present, are high-resolution evidence for these labels.`;
      const fallbackStart = Date.now();
      try {
        const fallbackResult = await generateAgainstPriorityPdf(
          ai,
          source,
          `${serializePriorityAnchorManifest(source.anchors)}\n\n${FOUNDATION_PLAN_COORDINATE_FALLBACK_PROMPT}`,
          foundationPlanCoordinateResponseSchema,
          'escalated',
          [...cropParts, targetInstruction],
        );
        diagnostics = recordPriorityUsage(diagnostics, 'escalated', fallbackResult.usage);
        diagnostics = addStageDuration(diagnostics, 'fallbackGeneration', Date.now() - fallbackStart);

        const fallbackValidateStart = Date.now();
        const targeted = normalizeFoundationPlanCoordinateRows(fallbackResult.raw);
        validated = normalizeFoundationPlanCoordinateRows(mergePriorityPlanRows(validated, targeted));
        coverage = evaluateFoundationPlanCoverage(source.anchors, validated);
        diagnostics = addStageDuration(diagnostics, 'fallbackValidation', Date.now() - fallbackValidateStart);
        diagnostics = recordPriorityCoverage(diagnostics, coverage);
      } catch (error) {
        diagnostics = addStageDuration(diagnostics, 'fallbackGeneration', Date.now() - fallbackStart);
        diagnostics = addPriorityWarning(
          diagnostics,
          `Foundation coverage is incomplete because the targeted retry failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!validated.some((row) => row.planColumnType)) {
      diagnostics = markEscalated(diagnostics, 'no-visible-plan-codes');
      diagnostics = recordPriorityRequest(diagnostics, 'escalated', selectPriorityPass('escalated'));
      const directTargets = [...new Set([
        ...coverage.missingLabels,
        ...coverage.unresolvedLabels,
        ...(coverage.mode === 'anchored' ? source.anchors.foundationLabels : []),
      ])].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      const directStart = Date.now();
      try {
        const directResult = await generateAgainstPriorityPdf(
          ai,
          source,
          `${serializePriorityAnchorManifest(source.anchors)}\n\n${FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT}`,
          foundationPlanDirectMappingResponseSchema,
          'escalated',
          [`DIRECT-MAPPING TARGETS: ${directTargets.join(', ') || 'all visible foundations'}.`],
        );
        diagnostics = recordPriorityUsage(diagnostics, 'escalated', directResult.usage);
        diagnostics = addStageDuration(diagnostics, 'fallbackGeneration', Date.now() - directStart);

        const directValidateStart = Date.now();
        const directRows = normalizeFoundationPlanCoordinateRows(directResult.raw);
        validated = normalizeFoundationPlanCoordinateRows(mergePriorityPlanRows(validated, directRows));
        coverage = evaluateFoundationPlanCoverage(source.anchors, validated);
        diagnostics = addStageDuration(diagnostics, 'fallbackValidation', Date.now() - directValidateStart);
        diagnostics = recordPriorityCoverage(diagnostics, coverage);
      } catch (error) {
        diagnostics = addStageDuration(diagnostics, 'fallbackGeneration', Date.now() - directStart);
        if (!diagnostics.warning) {
          diagnostics = addPriorityWarning(
            diagnostics,
            `Foundation direct mapping could not be completed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (!validated.some((row) => row.planColumnType)) {
        logError(
          `Foundation plan direct mapping fallback returned no code-bearing rows for ${file.name}.`,
          'No code-bearing rows returned.',
        );
      }
    }

    if (validated.length === 0) {
      throw new Error('No valid foundation plan data found in response. Gemini returned rows, but none contained a readable foundation label.');
    }

    coverage = evaluateFoundationPlanCoverage(source.anchors, validated);
    diagnostics = recordPriorityCoverage(diagnostics, coverage);
    if (!coverage.complete) {
      const labels = [...coverage.missingLabels, ...coverage.unresolvedLabels];
      if (!diagnostics.warning) {
        diagnostics = addPriorityWarning(
          diagnostics,
          `Foundation coverage is incomplete${labels.length ? `; missing or unresolved: ${labels.join(', ')}` : ''}.`,
        );
      }
    }

    return validated;
  });

  diagnostics = finishStage(diagnostics, 'total', Date.now() - totalStart);
  return { data: result, diagnostics };
};

// Frame extraction prompt (FW and FG types)
export const FRAME_MODEL = FRAME_IMAGE_MODEL;
export const FRAME_RESPONSE_REQUIRED_FIELDS = [
  'frameType',
  'frameName',
  'b',
  'h',
  'fwBaseRebarDiameter',
  'fwVerticalRebarDiameter',
  'fwHorizontalRebarCount',
  'fwHorizontalRebarDiameter',
  'fgTopRebarDiameter',
  'fgBottomRebarDiameter',
  'fgStirrupDiameter',
  'fgStirrupMaxDistance',
  'fgBellyRebarDiameter',
  'fgWidthStopRebarDiameter',
  'fgWidthStopRebarMaxDistance',
];

export const FRAME_SYSTEM_PROMPT = [
  'You are a structural engineering data extraction specialist. Extract one JSON row per unique FW or FG symbol from a Japanese structural CAD drawing.',
  '',
  'Every row must include frameType (FW or FG), frameName, b, and h. FW b is the bottom width. FW h is the dimension beside the bottom-most inner reinforcement square (the small white outlined box); ignore the 500 overall height and 30 base dimension. FG splits B×D into b and h.',
  '',
  'FW output fields:',
  '- FW_ベース筋_直径 (fwBaseRebarDiameter): always 13.',
  '- FW_タテ筋_直径 (fwVerticalRebarDiameter): numeric value after D in the タテ callout. If no callout exists, default 13.',
  '- FW_ヨコ筋_本数 (fwHorizontalRebarCount): count circular markers only inside the lower reinforcement square, on its left vertical side; exclude markers above that square and ignore all x marks. Return 0 when none exist.',
  '- FW_ヨコ筋_直径 (fwHorizontalRebarDiameter): numeric value after D in the ヨコ callout. If no callout exists, default 10.',
  '',
  'FG output fields (all diameters are numeric values after D only, never include the D prefix):',
  '- FG_上端筋_直径 (fgTopRebarDiameter) from 上端筋.',
  '- FG_下端筋_直径 (fgBottomRebarDiameter) from 下端筋.',
  '- FG_St_直径 (fgStirrupDiameter) and FG_St_距離_最大 (fgStirrupMaxDistance) from St.; the maximum distance is the numeric value after @.',
  '- FG_腹筋_直径 (fgBellyRebarDiameter) from 腹筋.',
  '- FG_巾止筋_直径 (fgWidthStopRebarDiameter) and FG_巾止筋_距離_最大 (fgWidthStopRebarMaxDistance) from 巾止筋; the maximum distance is the numeric value after @.',
  'Never leave an FG field blank when its source row is visible; use empty strings only for unavailable FG rows or FW-only fields.',
  '',
  'For a logical FG symbol such as FG1B that is visually split into two subcolumns, return one row only. Its required diameter values are shared, so read them from either subcolumn. Do not create duplicate rows for locations.',
  'Remove material specifications in parentheses. Return empty strings for unavailable optional FG fields.',
  SPATIAL_INSTRUCTION_IMAGE,
  'Output a valid JSON array based on the schema provided.',
].join('\n');
export const extractFrameData = async (base64Data: string, mimeType: string): Promise<FrameData[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: FRAME_MODEL,
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
              frameType: { type: Type.STRING, description: "Frame type: FW or FG" },
              frameName: { type: Type.STRING, description: "The frame identifier (for example FW1 or FG1B)" },
              b: { type: Type.STRING, description: "Width dimension B" },
              h: { type: Type.STRING, description: "Height dimension H" },
              fwBaseRebarDiameter: { type: Type.STRING, description: "FW_ベース筋_直径: numeric only, always 13" },
              fwVerticalRebarDiameter: { type: Type.STRING, description: "FW_タテ筋_直径: numeric value after D" },
              fwHorizontalRebarCount: { type: Type.STRING, description: "FW_ヨコ筋_本数: qualifying white circle count" },
              fwHorizontalRebarDiameter: { type: Type.STRING, description: "FW_ヨコ筋_直径: numeric value after D" },
              fgTopRebarDiameter: { type: Type.STRING, description: "FG_上端筋_直径: numeric value after D" },
              fgBottomRebarDiameter: { type: Type.STRING, description: "FG_下端筋_直径: numeric value after D" },
              fgStirrupDiameter: { type: Type.STRING, description: "FG_St_直径: numeric value after D" },
              fgStirrupMaxDistance: { type: Type.STRING, description: "FG_St_距離_最大: maximum distance" },
              fgBellyRebarDiameter: { type: Type.STRING, description: "FG_腹筋_直径: numeric value after D" },
              fgWidthStopRebarDiameter: { type: Type.STRING, description: "FG_巾止筋_直径: numeric value after D" },
              fgWidthStopRebarMaxDistance: { type: Type.STRING, description: "FG_巾止筋_距離_最大: maximum distance" },
              bbox: bboxSchemaTyped,
            },
            required: FRAME_RESPONSE_REQUIRED_FIELDS,
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

    const normalizedData = rawData
      .map((item: Record<string, unknown>) =>
        normalizeFrameData({ ...item, bbox: parseBoundingBox(item.bbox) }),
      )
      .filter((item: FrameData | null): item is FrameData => item !== null);

    if (normalizedData.length === 0) {
      throw new Error('No valid frame data found in response');
    }

    console.log(`Extracted ${normalizedData.length} frame(s) from image`);
    return normalizedData;

  } catch (error) {
    logError("Frame Extraction Error:", error);
    throw error;
  }
};
