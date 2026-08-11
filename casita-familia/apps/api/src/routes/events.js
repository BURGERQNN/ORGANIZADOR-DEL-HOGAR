import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { EVENT_STATUSES, EVENT_TYPES } from "../lib/catalogs.js";
import { requireAuth, requireHome } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireHome, async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  let q = supabaseAdmin
    .from("home_events")
    .select("*")
    .eq("home_id", req.profile.home_id)
    .order("starts_at", { ascending: true });

  if (from) q = q.gte("starts_at", String(from));
  if (to) q = q.lte("starts_at", String(to));

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data });
});

router.post("/", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Los invitados no pueden crear eventos" });
  }

  const parsed = z
    .object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional(),
      event_type: z.enum(EVENT_TYPES).default("tarea"),
      starts_at: z.string().datetime({ offset: true }),
      ends_at: z.string().datetime({ offset: true }).optional().nullable(),
      assignee_id: z.string().uuid().optional().nullable(),
      points_reward: z.number().int().min(0).max(500).default(10),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("home_events")
    .insert({
      ...parsed.data,
      home_id: req.profile.home_id,
      created_by: req.user.id,
    })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ event: data });
});

router.patch("/:id", requireAuth, requireHome, async (req, res) => {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional().nullable(),
      status: z.enum(EVENT_STATUSES).optional(),
      assignee_id: z.string().uuid().optional().nullable(),
      starts_at: z.string().datetime({ offset: true }).optional(),
      ends_at: z.string().datetime({ offset: true }).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("home_events")
    .select("*")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) return res.status(404).json({ error: "Evento no encontrado" });

  const nextStatus = parsed.data.status;
  const becomingDone = nextStatus === "hecho" && existing.status !== "hecho";

  const { data, error } = await supabaseAdmin
    .from("home_events")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  if (becomingDone && existing.assignee_id && existing.points_reward > 0) {
    const { data: assignee } = await supabaseAdmin
      .from("profiles")
      .select("points")
      .eq("id", existing.assignee_id)
      .single();
    if (assignee) {
      await supabaseAdmin
        .from("profiles")
        .update({ points: assignee.points + existing.points_reward })
        .eq("id", existing.assignee_id);
    }
  }

  res.json({ event: data });
});

router.delete("/:id", requireAuth, requireHome, async (req, res) => {
  if (req.profile.role === "invitado") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  const { error } = await supabaseAdmin
    .from("home_events")
    .delete()
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
