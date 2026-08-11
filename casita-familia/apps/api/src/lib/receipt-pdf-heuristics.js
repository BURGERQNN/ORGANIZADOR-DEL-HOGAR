/**
 * Lector heurístico de texto de recibos (México).
 * Se usa cuando el PDF tiene texto embebido y/o como respaldo sin OpenAI.
 */

function toISO(d, m, y) {
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const yy = String(y).length === 2 ? `20${y}` : String(y);
  if (!/^\d{4}$/.test(yy)) return null;
  const iso = `${yy}-${mm}-${dd}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
}

function parseAmount(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    const parts = s.split(",");
    s = parts.length === 2 && parts[1].length <= 2 ? parts.join(".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  return n > 0 && n < 1_000_000_000 ? Math.round(n * 100) / 100 : null;
}

function findDates(text) {
  const dates = [];
  const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const iso = toISO(m[1], m[2], m[3]);
    if (iso) dates.push({ iso, index: m.index });
  }
  const re2 = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = re2.exec(text)) !== null) {
    dates.push({ iso: `${m[1]}-${m[2]}-${m[3]}`, index: m.index });
  }
  return dates;
}

function detectProviderCategory(text) {
  const t = text.toLowerCase();
  const rules = [
    {
      test: /\bcfe\b|comisi[oó]n federal de electricidad|suministro de energ[ií]a/,
      provider: "CFE",
      category: "luz",
    },
    { test: /\btelmex\b/, provider: "Telmex", category: "internet" },
    { test: /\btelcel\b/, provider: "Telcel", category: "telefono" },
    { test: /\batt\b|at&t/, provider: "AT&T", category: "telefono" },
    { test: /movistar/, provider: "Movistar", category: "telefono" },
    { test: /\bizzi\b/, provider: "izzi", category: "internet" },
    { test: /totalplay/, provider: "Totalplay", category: "internet" },
    { test: /megacable/, provider: "Megacable", category: "internet" },
    {
      test: /\bagua\b|sapal|siapa|cespt|organismos operadores/,
      provider: null,
      category: "agua",
    },
    {
      test: /\bgas\b|naturgy|gas natural|zegas/,
      provider: null,
      category: "gas",
    },
    {
      test: /mantenimiento|cuota de mantenimiento|condominio/,
      provider: null,
      category: "mantenimiento",
    },
  ];

  for (const r of rules) {
    if (r.test.test(t)) return { provider: r.provider, category: r.category };
  }
  return { provider: null, category: "servicios" };
}

function findAmount(text) {
  const patterns = [
    /total\s*(a\s*pagar)?\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /importe\s*(total)?\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /monto\s*(total)?\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /pago\s*oportuno\s*[:$]?\s*\$?\s*([\d.,]+)/i,
    /\$\s*([\d,]+\.\d{2})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[2] || m[1];
      const amount = parseAmount(raw);
      if (amount) return amount;
    }
  }
  return null;
}

function findReference(text) {
  const patterns = [
    /(?:no\.?\s*de\s*)?(?:referencia|recibo|folio|cuenta)\s*[:#]?\s*([A-Z0-9\-]{6,24})/i,
    /\b(\d{10,20})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function findLabeledDate(text, labels) {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:]?\\s*(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|20\\d{2}-\\d{2}-\\d{2})`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(m[1])) return m[1];
      const parts = m[1].split(/[\/\-.]/);
      if (parts.length === 3) return toISO(parts[0], parts[1], parts[2]);
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} [filename]
 */
export function parseReceiptText(text, filename = "recibo.pdf") {
  const clean = (text || "").replace(/\u0000/g, " ").replace(/[ \t]+/g, " ");
  if (clean.trim().length < 20) {
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
      title: filename.replace(/\.[^.]+$/, ""),
      payment_status: "pendiente",
      notes: "PDF sin texto suficiente. Completa los campos manualmente.",
    };
  }

  const { provider, category } = detectProviderCategory(clean);
  const amount = findAmount(clean);
  const reference_number = findReference(clean);
  const due_date = findLabeledDate(clean, [
    "fecha\\s*l[ií]mite\\s*(de\\s*pago)?",
    "vencimiento",
    "pagar\\s*antes\\s*del",
    "fecha\\s*de\\s*vencimiento",
  ]);
  const occurred_on =
    findLabeledDate(clean, [
      "fecha\\s*(de\\s*)?(emisi[oó]n|factura|recibo)",
      "fecha\\s*de\\s*corte",
    ]) ||
    findDates(clean)[0]?.iso ||
    null;

  const periodMatch = clean.match(
    /periodo(?:\s*facturado)?\s*[:]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*(?:al|a|-|–)\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  );
  let period_start = null;
  let period_end = null;
  if (periodMatch) {
    const a = periodMatch[1].split(/[\/\-.]/);
    const b = periodMatch[2].split(/[\/\-.]/);
    period_start = toISO(a[0], a[1], a[2]);
    period_end = toISO(b[0], b[1], b[2]);
  }

  const paid = /pagado|pago\s*realizado|comprobante\s*de\s*pago/i.test(clean);
  const titleParts = [provider, category].filter(Boolean);
  const title =
    titleParts.length > 0
      ? `Recibo ${titleParts.join(" ")}`
      : filename.replace(/\.[^.]+$/, "");

  return {
    category,
    provider,
    occurred_on,
    period_start,
    period_end,
    due_date,
    amount,
    reference_number,
    concept: provider ? `Servicio ${provider}` : "Servicio del hogar",
    title,
    payment_status: paid ? "pagado" : "pendiente",
    notes: null,
  };
}
