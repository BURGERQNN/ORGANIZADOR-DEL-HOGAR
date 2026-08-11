import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireHome, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("rewards")
    .select("*")
    .eq("home_id", req.profile.home_id)
    .eq("active", true)
    .order("cost_points", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rewards: data });
});

router.get("/redemptions", requireAuth, requireHome, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("redemptions")
    .select("*, rewards(title, cost_points)")
    .eq("home_id", req.profile.home_id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ redemptions: data });
});

router.post("/", requireAuth, requireHome, requireRole("admin"), async (req, res) => {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(400).optional(),
      cost_points: z.number().int().min(1).max(10000),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data, error } = await supabaseAdmin
    .from("rewards")
    .insert({ ...parsed.data, home_id: req.profile.home_id })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ reward: data });
});

router.post("/:id/redeem", requireAuth, requireHome, async (req, res) => {
  const { data: reward, error: rErr } = await supabaseAdmin
    .from("rewards")
    .select("*")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .eq("active", true)
    .maybeSingle();
  if (rErr) return res.status(500).json({ error: rErr.message });
  if (!reward) return res.status(404).json({ error: "Recompensa no encontrada" });
  if (req.profile.points < reward.cost_points) {
    return res.status(400).json({ error: "Puntos insuficientes" });
  }

  const { data: redemption, error } = await supabaseAdmin
    .from("redemptions")
    .insert({
      home_id: req.profile.home_id,
      reward_id: reward.id,
      user_id: req.user.id,
      status: "pendiente",
    })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin
    .from("profiles")
    .update({ points: req.profile.points - reward.cost_points })
    .eq("id", req.user.id);

  res.status(201).json({ redemption });
});

router.patch("/redemptions/:id", requireAuth, requireHome, requireRole("admin"), async (req, res) => {
  const parsed = z.object({ status: z.enum(["aprobado", "rechazado"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Estado inválido" });

  const { data: existing } = await supabaseAdmin
    .from("redemptions")
    .select("*")
    .eq("id", req.params.id)
    .eq("home_id", req.profile.home_id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: "Canje no encontrado" });
  if (existing.status !== "pendiente") {
    return res.status(400).json({ error: "El canje ya fue revisado" });
  }

  if (parsed.data.status === "rechazado") {
    const { data: reward } = await supabaseAdmin
      .from("rewards")
      .select("cost_points")
      .eq("id", existing.reward_id)
      .single();
    const { data: user } = await supabaseAdmin
      .from("profiles")
      .select("points")
      .eq("id", existing.user_id)
      .single();
    if (reward && user) {
      await supabaseAdmin
        .from("profiles")
        .update({ points: user.points + reward.cost_points })
        .eq("id", existing.user_id);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("redemptions")
    .update({
      status: parsed.data.status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: req.user.id,
    })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ redemption: data });
});

export default router;
