import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { FINANCE_EXPENSE_CATEGORIES } from "./catalogs.js";
import { parseReceiptText } from "./receipt-pdf-heuristics.js";

const EXTRACTION_SCHEMA_HINT = `{
  "category": "luz|agua|gas|internet|telefono|mantenimiento|servicios|hogar|transporte|comida|salud|entretenimiento|otros_gastos|null",
  "provider": "string|null",
  "occurred_on": "YYYY-MM-DD|null",
  "period_start": "YYYY-MM-DD|null",
  "period_end": "YYYY-MM-DD|null",
  "due_date": "YYYY-MM-DD|null",
  "amount": number|null,
  "reference_number": "string|null",
  "concept": "string|null",
  "title": "string|null",
  "payment_status": "pagado|pendiente|null",
  "notes": "string|null"
}`;

function hasOpenAI() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Falta OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: key });
}

function emptyExtraction() {
  return {
    category: null,
    provider: null,
    occurred_on: null,
    period_start: null,
    period_end: null,
    due_date: null,
    amount: null,
    reference_number: null,
    concept: null,
    title: null,
    payment_status: "pendiente",
    notes: null,
  };
}

function normalizeExtraction(raw) {
  const base = emptyExtraction();
  if (!raw || typeof raw !== "object") return base;

  const category =
    raw.category && FINANCE_EXPENSE_CATEGORIES.includes(raw.category)
      ? raw.category
      : null;
  const amount =
    typeof raw.amount === "number" && raw.amount > 0
      ? Math.round(raw.amount * 100) / 100
      : null;

  const dateOrNull = (v) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

  return {
    category,
    provider:
      typeof raw.provider === "string" && raw.provider.trim()
        ? raw.provider.trim()
        : null,
    occurred_on: dateOrNull(raw.occurred_on),
    period_start: dateOrNull(raw.period_start),
    period_end: dateOrNull(raw.period_end),
    due_date: dateOrNull(raw.due_date),
    amount,
    reference_number:
      typeof raw.reference_number === "string" && raw.reference_number.trim()
        ? raw.reference_number.trim()
        : null,
    concept:
      typeof raw.concept === "string" && raw.concept.trim()
        ? raw.concept.trim()
        : null,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim().slice(0, 120)
        : null,
    payment_status: raw.payment_status === "pagado" ? "pagado" : "pendiente",
    notes:
      typeof raw.notes === "string" && raw.notes.trim()
        ? raw.notes.trim().slice(0, 500)
        : null,
  };
}

/** Rellena nulls del primario con valores del secundario */
function mergeExtractions(primary, fallback) {
  const out = { ...fallback };
  for (const key of Object.keys(primary)) {
    const v = primary[key];
    if (v !== null && v !== undefined && v !== "") out[key] = v;
  }
  return normalizeExtraction(out);
}

async function chatExtract(messages) {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages,
  });
  const content = completion.choices[0]?.message?.content || "{}";
  try {
    return normalizeExtraction(JSON.parse(content));
  } catch {
    return emptyExtraction();
  }
}

const SYSTEM = `Eres un extractor de datos de recibos de servicios en México (luz, agua, gas, internet, teléfono, mantenimiento, etc.).
Devuelve SOLO JSON con este esquema: ${EXTRACTION_SCHEMA_HINT}
Reglas:
- Si un dato no es claro, usa null (nunca inventes).
- amount es el total a pagar en número (sin símbolo de moneda).
- category debe ser una de las permitidas o null.
- payment_status: pendiente si parece por pagar; pagado solo si el documento lo indica claramente.
- Fechas en YYYY-MM-DD.`;

async function readPdfText(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = (result?.text || "").trim();
    await parser.destroy().catch(() => {});
    return text;
  } catch {
    return "";
  }
}

/**
 * @param {{ buffer: Buffer, mime: string, filename: string }} file
 * @returns {Promise<{ extraction: object, source: string, text_preview: string|null }>}
 */
export async function extractReceiptData(file) {
  const { buffer, mime, filename } = file;

  if (mime === "application/pdf") {
    const text = await readPdfText(buffer);
    const heuristic = normalizeExtraction(parseReceiptText(text, filename));
    const text_preview = text ? text.slice(0, 1500) : null;

    if (text.length < 40) {
      if (hasOpenAI()) {
        // PDF escaneado: sin texto; OpenAI no ve el PDF binario aquí
        return {
          extraction: {
            ...emptyExtraction(),
            notes:
              "PDF escaneado sin texto. Sube una foto JPG/PNG del recibo o completa a mano.",
          },
          source: "pdf-empty",
          text_preview: null,
        };
      }
      return {
        extraction: {
          ...emptyExtraction(),
          notes:
            "PDF sin texto detectable. Completa los campos manualmente o sube una imagen.",
        },
        source: "pdf-empty",
        text_preview: null,
      };
    }

    if (hasOpenAI()) {
      try {
        const ai = await chatExtract([
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Analiza el texto de este recibo (${filename}) y extrae los campos. Si algo no aparece, null.\n\n---\n${text.slice(0, 12000)}`,
          },
        ]);
        return {
          extraction: mergeExtractions(ai, heuristic),
          source: "pdf+openai",
          text_preview,
        };
      } catch (e) {
        console.warn("[receipt-ai] OpenAI falló, uso lector PDF:", e.message);
      }
    }

    return {
      extraction: heuristic,
      source: "pdf-reader",
      text_preview,
    };
  }

  if (mime.startsWith("image/")) {
    if (!hasOpenAI()) {
      return {
        extraction: {
          ...emptyExtraction(),
          title: filename.replace(/\.[^.]+$/, ""),
          notes:
            "Para leer fotos necesitas OPENAI_API_KEY. Los PDF con texto sí se leen sin IA.",
        },
        source: "manual",
        text_preview: null,
      };
    }

    const b64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    const ai = await chatExtract([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza este recibo (${filename}) y extrae los campos. Si algo no se ve, null.`,
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
    return { extraction: ai, source: "openai-vision", text_preview: null };
  }

  throw new Error("Formato no soportado. Usa PDF, JPG, JPEG o PNG.");
}

export { emptyExtraction, normalizeExtraction };
