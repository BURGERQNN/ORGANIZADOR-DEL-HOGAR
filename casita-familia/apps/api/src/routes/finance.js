import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  FINANCE_CATEGORIES,
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_KINDS,
  FINANCE_PAYMENT_STATUSES,
} from "../lib/catalogs.js";
import { requireAuth, requireHome } from "../middleware/auth.js";
import { extractReceiptData } from "../lib/receipt-ai.js";
import {
  createSignedReceiptUrl,
  movePendingReceipt,
  removeReceipt,
  uploadReceipt,
} from "../lib/receipt-storage.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Solo PDF, JPG o PNG"), ok);
  },
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrySchema = z
  .object({
    kind: z.enum(FINANCE_KINDS),
    category: z.enum(FINANCE_CATEGORIES),
    amount: z.number().positive().max(1_000_000_000),
    title: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(500).optional().nullable(),
    occurred_on: dateStr,
    provider: z.string().trim().max(120).optional().nullable(),
    payment_status: z.enum(FINANCE_PAYMENT_STATUSES).optional(),
    due_date: dateStr.optional().nullable(),
    period_start: dateStr.optional().nullable(),
    period_end: dateStr.optional().nullable(),
    reference_number: z.string().trim().max(120).optional().nullable(),
    concept: z.string().trim().max(300).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    const allowed =
      val.kind === "ingreso" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES;
    if (!allowed.includes(val.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Categoría inválida para ${val.kind}`,
        path: ["category"],
      });
    }
  });

const confirmSchema = z.object({
  pending_path: z.string().min(1),
  receipt_mime: z.string().min(1),
  receipt_filename: z.string().min(1),
  force: z.boolean().optional(),
  category: z.enum(FINANCE_EXPENSE_CATEGORIES),
  amount: z.number().positive().max(1_000_000_000),
  title: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional().nullable(),
  occurred_on: dateStr,
  provider: z.string().trim().max(120).optional().nullable(),
  payment_status: z.enum(FINANCE_PAYMENT_STATUSES).default("pendiente"),
  due_date: dateStr.optional().nullable(),
  period_start: dateStr.optional().nullable(),
  period_end: dateStr.optional().nullable(),
  reference_number: z.string().trim().max(120).optional().nullable(),
  concept: z.string().trim().max(300).optional().nullable(),
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function summarize(entries) {
  let totalIngresos = 0;
  let totalGastos = 0;
  let totalPendiente = 0;
  let totalPagadoGastos = 0;
  let vencidos = 0;
  const byCategory = {};
  const byMonth = {};
  const upcoming = [];
  const today = todayISO();

  for (const e of entries) {
    const amount = Number(e.amount);
    if (e.kind === "ingreso") totalIngresos += amount;
    else {
      totalGastos += amount;
      if (e.payment_status === "pendiente") {
        totalPendiente += amount;
        if (e.due_date && e.due_date < today) vencidos += 1;
        if (e.due_date && e.due_date >= today) {
          upcoming.push({
            id: e.id,
            title: e.title,
            provider: e.provider,
            due_date: e.due_date,
            amount: round2(amount),
          });
        }
      } else {
        totalPagadoGastos += amount;
      }
    }

    byCategory[e.category] = (byCategory[e.category] || 0) + amount;
    const month = String(e.occurred_on).slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { ingresos: 0, gastos: 0 };
    if (e.kind === "ingreso") byMonth[month].ingresos += amount;
    else byMonth[month].gastos += amount;
  }

  upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date));

  return {
    total_ingresos: round2(totalIngresos),
    total_gastos: round2(totalGastos),
    ganancia_neta: round2(totalIngresos - totalGastos),
    total_pendiente: round2(totalPendiente),
    total_pagado_gastos: round2(totalPagadoGastos),
    vencidos_count: vencidos,
    upcoming_dues: upcoming.slice(0, 8),
    by_category: Object.entries(byCategory).map(([category, total]) => ({
      category,
      total: round2(total),
    })),
    by_month: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        ingresos: round2(v.ingresos),
        gastos: round2(v.gastos),
      })),
  };
}

async function fetchEntries(homeId, query) {
  let q = supabaseAdmin
    .from("finance_entries")
    .select("*")
    .eq("home_id", homeId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (query.from) q = q.gte("occurred_on", String(query.from));
  if (query.to) q = q.lte("occurred_on", String(query.to));
  if (query.kind && FINANCE_KINDS.includes(String(query.kind))) {
    q = q.eq("kind", String(query.kind));
  }
  if (query.category && FINANCE_CATEGORIES.includes(String(query.category))) {
    q = q.eq("category", String(query.category));
  }
  if (
    query.payment_status &&
    FINANCE_PAYMENT_STATUSES.includes(String(query.payment_status))
  ) {
    q = q.eq("payment_status", String(query.payment_status));
  }
  if (query.provider) {
    q = q.ilike("provider", `%${String(query.provider).trim()}%`);
  }

  return q;
}

async function findDuplicates(homeId, data) {
  if (!data.reference_number && !data.provider) return [];

  let q = supabaseAdmin
    .from("finance_entries")
    .select("id, title, amount, provider, reference_number, period_start, period_end, occurred_on")
    .eq("home_id", homeId)
    .eq("kind", "gasto");

  if (data.reference_number) {
    q = q.eq("reference_number", data.reference_number);
  } else if (data.provider) {
    q = q.ilike("provider", data.provider);
    if (data.amount != null) q = q.eq("amount", data.amount);
    if (data.period_start) q = q.eq("period_start", data.period_start);
    if (data.period_end) q = q.eq("period_end", data.period_end);
  }

  const { data: rows, error } = await q.limit(10);
  if (error) throw new Error(error.message);
  return rows || [];
}

router.get("/catalogs", requireAuth, (_req, res) => {
  res.json({
    kinds: FINANCE_KINDS,
    categories: FINANCE_CATEGORIES,
    income_categories: FINANCE_INCOME_CATEGORIES,
    expense_categories: FINANCE_EXPENSE_CATEGORIES,
    payment_statuses: FINANCE_PAYMENT_STATUSES,
  });
});

router.get("/", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await fetchEntries(req.profile.home_id, req.query);
  if (error) return res.status(500).json({ error: error.message });
  const entries = data || [];
  res.json({ entries, summary: summarize(entries) });
});

router.post("/receipts/analyze", requireAuth, requireHome, (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Los invitados no pueden subir recibos" });
  }

  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Falta el archivo" });

    try {
      const mime = req.file.mimetype === "image/jpg" ? "image/jpeg" : req.file.mimetype;
      const filename = req.file.originalname || "recibo";

      const analyzed = await extractReceiptData({
        buffer: req.file.buffer,
        mime,
        filename,
      });
      const extraction = analyzed.extraction;

      const pending_path = await uploadReceipt({
        homeId: req.profile.home_id,
        buffer: req.file.buffer,
        mime,
        filename,
        pending: true,
      });

      const duplicates = await findDuplicates(req.profile.home_id, extraction);

      res.json({
        pending_path,
        receipt_mime: mime,
        receipt_filename: filename,
        extraction,
        duplicates,
        source: analyzed.source,
        text_preview: analyzed.text_preview,
      });
    } catch (e) {
      console.error("[receipts/analyze]", e);
      res.status(500).json({ error: e.message || "No se pudo analizar el recibo" });
    }
  });
});

router.post("/receipts/confirm", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const body = parsed.data;
  if (!String(body.pending_path).startsWith(`${req.profile.home_id}/`)) {
    return res.status(400).json({ error: "Comprobante inválido" });
  }

  try {
    const duplicates = await findDuplicates(req.profile.home_id, body);
    if (duplicates.length > 0 && !body.force) {
      return res.status(409).json({
        error: "Posible duplicado detectado",
        duplicates,
      });
    }

    const receipt_path = await movePendingReceipt(
      body.pending_path,
      req.profile.home_id,
      body.receipt_filename,
    );

    const { data, error } = await supabaseAdmin
      .from("finance_entries")
      .insert({
        home_id: req.profile.home_id,
        created_by: req.user.id,
        kind: "gasto",
        category: body.category,
        amount: body.amount,
        title: body.title,
        notes: body.notes ?? null,
        occurred_on: body.occurred_on,
        provider: body.provider ?? null,
        payment_status: body.payment_status,
        due_date: body.due_date ?? null,
        period_start: body.period_start ?? null,
        period_end: body.period_end ?? null,
        reference_number: body.reference_number ?? null,
        concept: body.concept ?? null,
        receipt_path,
        receipt_mime: body.receipt_mime,
        receipt_filename: body.receipt_filename,
      })
      .select("*")
      .single();

    if (error) {
      await removeReceipt(receipt_path).catch(() => {});
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ entry: data });
  } catch (e) {
    console.error("[receipts/confirm]", e);
    res.status(500).json({ error: e.message || "No se pudo guardar el recibo" });
  }
});

router.get("/:id/receipt", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("finance_entries")
    .select("id, receipt_path, receipt_filename, receipt_mime")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data?.receipt_path) return res.status(404).json({ error: "Sin comprobante" });

  try {
    const url = await createSignedReceiptUrl(data.receipt_path);
    res.json({
      url,
      filename: data.receipt_filename,
      mime: data.receipt_mime,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Los invitados no pueden registrar finanzas" });
  }
  const parsed = entrySchema.safeParse({
    payment_status: "pagado",
    ...req.body,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("finance_entries")
    .insert({
      ...parsed.data,
      home_id: req.profile.home_id,
      created_by: req.user.id,
    })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ entry: data });
});

router.patch("/:id", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  const parsed = z
    .object({
      kind: z.enum(FINANCE_KINDS).optional(),
      category: z.enum(FINANCE_CATEGORIES).optional(),
      amount: z.number().positive().max(1_000_000_000).optional(),
      title: z.string().trim().min(2).max(120).optional(),
      notes: z.string().trim().max(500).optional().nullable(),
      occurred_on: dateStr.optional(),
      provider: z.string().trim().max(120).optional().nullable(),
      payment_status: z.enum(FINANCE_PAYMENT_STATUSES).optional(),
      due_date: dateStr.optional().nullable(),
      period_start: dateStr.optional().nullable(),
      period_end: dateStr.optional().nullable(),
      reference_number: z.string().trim().max(120).optional().nullable(),
      concept: z.string().trim().max(300).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "Nada que actualizar" });
  }

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("finance_entries")
    .select("*")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) return res.status(404).json({ error: "Movimiento no encontrado" });

  const next = { ...existing, ...parsed.data };
  const check = entrySchema.safeParse({
    kind: next.kind,
    category: next.category,
    amount: Number(next.amount),
    title: next.title,
    notes: next.notes ?? null,
    occurred_on: next.occurred_on,
    provider: next.provider ?? null,
    payment_status: next.payment_status || "pagado",
    due_date: next.due_date ?? null,
    period_start: next.period_start ?? null,
    period_end: next.period_end ?? null,
    reference_number: next.reference_number ?? null,
    concept: next.concept ?? null,
  });
  if (!check.success) return res.status(400).json({ error: check.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("finance_entries")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ entry: data });
});

router.delete("/:id", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }

  const { data: existing } = await supabaseAdmin
    .from("finance_entries")
    .select("receipt_path")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("finance_entries")
    .delete()
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id);
  if (error) return res.status(500).json({ error: error.message });

  if (existing?.receipt_path) {
    await removeReceipt(existing.receipt_path).catch(() => {});
  }
  res.status(204).end();
});

export default router;
