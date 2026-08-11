export type HomeRole = "admin" | "miembro" | "invitado";
export type EventType = "tarea" | "evento" | "recordatorio";
export type EventStatus = "pendiente" | "hecho" | "cancelado";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  home_id: string | null;
  role: HomeRole;
  points: number;
};

export type HomeEvent = {
  id: string;
  home_id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  status: EventStatus;
  starts_at: string;
  ends_at: string | null;
  assignee_id: string | null;
  points_reward: number;
};

export type Reminder = {
  id: string;
  title: string;
  remind_at: string;
  status: string;
  event_id: string | null;
};

export type Reward = {
  id: string;
  title: string;
  description: string | null;
  cost_points: number;
};

export type Member = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: HomeRole;
  points: number;
};

export type FinanceKind = "ingreso" | "gasto";
export type FinancePaymentStatus = "pagado" | "pendiente";
export type FinanceCategory =
  | "sueldo"
  | "freelance"
  | "otros_ingresos"
  | "comida"
  | "hogar"
  | "transporte"
  | "servicios"
  | "luz"
  | "agua"
  | "gas"
  | "internet"
  | "telefono"
  | "mantenimiento"
  | "salud"
  | "entretenimiento"
  | "otros_gastos";

export type FinanceEntry = {
  id: string;
  home_id: string;
  kind: FinanceKind;
  category: FinanceCategory;
  amount: number;
  title: string;
  notes: string | null;
  occurred_on: string;
  created_by: string | null;
  provider?: string | null;
  payment_status?: FinancePaymentStatus;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  reference_number?: string | null;
  concept?: string | null;
  receipt_path?: string | null;
  receipt_mime?: string | null;
  receipt_filename?: string | null;
};

export type ReceiptExtraction = {
  category: FinanceCategory | null;
  provider: string | null;
  occurred_on: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  amount: number | null;
  reference_number: string | null;
  concept: string | null;
  title: string | null;
  payment_status: FinancePaymentStatus;
  notes: string | null;
};

export type FinanceSummary = {
  total_ingresos: number;
  total_gastos: number;
  ganancia_neta: number;
  total_pendiente?: number;
  total_pagado_gastos?: number;
  vencidos_count?: number;
  upcoming_dues?: Array<{
    id: string;
    title: string;
    provider: string | null;
    due_date: string;
    amount: number;
  }>;
  by_category: Array<{ category: string; total: number }>;
  by_month: Array<{ month: string; ingresos: number; gastos: number }>;
};
