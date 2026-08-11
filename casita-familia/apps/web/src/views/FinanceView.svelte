<script lang="ts">
  import { api, apiUpload } from "../lib/api";
  import { demoStore } from "../lib/demo-store";
  import { getSession, useDemoMode } from "../lib/session.svelte";
  import type {
    FinanceCategory,
    FinanceEntry,
    FinanceKind,
    FinancePaymentStatus,
    FinanceSummary,
    ReceiptExtraction,
  } from "../lib/types";

  const session = getSession();

  const INCOME_CATEGORIES: FinanceCategory[] = ["sueldo", "freelance", "otros_ingresos"];
  const EXPENSE_CATEGORIES: FinanceCategory[] = [
    "comida",
    "hogar",
    "transporte",
    "servicios",
    "luz",
    "agua",
    "gas",
    "internet",
    "telefono",
    "mantenimiento",
    "salud",
    "entretenimiento",
    "otros_gastos",
  ];

  let entries = $state<FinanceEntry[]>([]);
  let summary = $state<FinanceSummary>({
    total_ingresos: 0,
    total_gastos: 0,
    ganancia_neta: 0,
    total_pendiente: 0,
    total_pagado_gastos: 0,
    vencidos_count: 0,
    upcoming_dues: [],
    by_category: [],
    by_month: [],
  });
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let loading = $state(false);
  let editingId = $state<string | null>(null);
  let detail = $state<FinanceEntry | null>(null);
  let analyzing = $state(false);
  let confirming = $state(false);

  let filters = $state({
    from: "",
    to: "",
    kind: "" as "" | FinanceKind,
    category: "" as "" | FinanceCategory,
    payment_status: "" as "" | FinancePaymentStatus,
    provider: "",
  });

  let form = $state({
    kind: "gasto" as FinanceKind,
    category: "comida" as FinanceCategory,
    amount: "",
    title: "",
    notes: "",
    occurred_on: new Date().toISOString().slice(0, 10),
    payment_status: "pagado" as FinancePaymentStatus,
  });

  type ReviewState = {
    pending_path: string;
    receipt_mime: string;
    receipt_filename: string;
    duplicates: Array<{ id: string; title: string; amount: number }>;
    category: FinanceCategory;
    provider: string;
    occurred_on: string;
    period_start: string;
    period_end: string;
    due_date: string;
    amount: string;
    reference_number: string;
    concept: string;
    title: string;
    payment_status: FinancePaymentStatus;
    notes: string;
    text_preview: string | null;
    source: string | null;
  };

  let review = $state<ReviewState | null>(null);
  let previewUrl = $state<string | null>(null);

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function cancelReview() {
    review = null;
    clearPreview();
  }

  const categoryOptions = $derived(
    form.kind === "ingreso" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES,
  );

  function computeSummary(list: FinanceEntry[]): FinanceSummary {
    let total_ingresos = 0;
    let total_gastos = 0;
    let total_pendiente = 0;
    let total_pagado_gastos = 0;
    let vencidos_count = 0;
    const byCategory: Record<string, number> = {};
    const byMonth: Record<string, { ingresos: number; gastos: number }> = {};
    const upcoming: NonNullable<FinanceSummary["upcoming_dues"]> = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const e of list) {
      const amount = Number(e.amount);
      if (e.kind === "ingreso") total_ingresos += amount;
      else {
        total_gastos += amount;
        if ((e.payment_status || "pagado") === "pendiente") {
          total_pendiente += amount;
          if (e.due_date && e.due_date < today) vencidos_count += 1;
          if (e.due_date && e.due_date >= today) {
            upcoming.push({
              id: e.id,
              title: e.title,
              provider: e.provider || null,
              due_date: e.due_date,
              amount: round2(amount),
            });
          }
        } else total_pagado_gastos += amount;
      }
      byCategory[e.category] = (byCategory[e.category] || 0) + amount;
      const month = e.occurred_on.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { ingresos: 0, gastos: 0 };
      if (e.kind === "ingreso") byMonth[month].ingresos += amount;
      else byMonth[month].gastos += amount;
    }

    upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date));

    return {
      total_ingresos: round2(total_ingresos),
      total_gastos: round2(total_gastos),
      ganancia_neta: round2(total_ingresos - total_gastos),
      total_pendiente: round2(total_pendiente),
      total_pagado_gastos: round2(total_pagado_gastos),
      vencidos_count,
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

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  function money(n: number) {
    return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }

  function labelCategory(c: string) {
    return c.replaceAll("_", " ");
  }

  function extractionToReview(
    meta: {
      pending_path: string;
      receipt_mime: string;
      receipt_filename: string;
      duplicates?: Array<{ id: string; title: string; amount: number }>;
      text_preview?: string | null;
      source?: string | null;
    },
    extraction: ReceiptExtraction,
  ): ReviewState {
    return {
      pending_path: meta.pending_path,
      receipt_mime: meta.receipt_mime,
      receipt_filename: meta.receipt_filename,
      duplicates: meta.duplicates || [],
      category: extraction.category || "servicios",
      provider: extraction.provider || "",
      occurred_on: extraction.occurred_on || new Date().toISOString().slice(0, 10),
      period_start: extraction.period_start || "",
      period_end: extraction.period_end || "",
      due_date: extraction.due_date || "",
      amount: extraction.amount != null ? String(extraction.amount) : "",
      reference_number: extraction.reference_number || "",
      concept: extraction.concept || "",
      title:
        extraction.title ||
        extraction.concept ||
        extraction.provider ||
        meta.receipt_filename.replace(/\.[^.]+$/, ""),
      payment_status: extraction.payment_status || "pendiente",
      notes: extraction.notes || "",
      text_preview: meta.text_preview || null,
      source: meta.source || null,
    };
  }

  async function loadFinance() {
    if (!session.token || !session.profile?.home_id) return;
    loading = true;
    error = null;
    try {
      const q = new URLSearchParams();
      if (filters.from) q.set("from", filters.from);
      if (filters.to) q.set("to", filters.to);
      if (filters.kind) q.set("kind", filters.kind);
      if (filters.category) q.set("category", filters.category);
      if (filters.payment_status) q.set("payment_status", filters.payment_status);
      if (filters.provider.trim()) q.set("provider", filters.provider.trim());

      if (useDemoMode) {
        entries = demoStore.financeList({
          from: filters.from || undefined,
          to: filters.to || undefined,
          kind: filters.kind || undefined,
          category: filters.category || undefined,
          payment_status: filters.payment_status || undefined,
          provider: filters.provider || undefined,
        });
        summary = computeSummary(entries);
      } else {
        const res = await api<{ entries: FinanceEntry[]; summary: FinanceSummary }>(
          `/api/finance?${q.toString()}`,
          { token: session.token },
        );
        entries = res.entries.map((e) => ({ ...e, amount: Number(e.amount) }));
        summary = res.summary;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo cargar finanzas";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (session.profile?.home_id) loadFinance();
  });

  function resetForm() {
    editingId = null;
    form = {
      kind: "gasto",
      category: "comida",
      amount: "",
      title: "",
      notes: "",
      occurred_on: new Date().toISOString().slice(0, 10),
      payment_status: "pagado",
    };
  }

  function onKindChange() {
    form.category = (form.kind === "ingreso" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0])!;
  }

  function startEdit(entry: FinanceEntry) {
    editingId = entry.id;
    detail = null;
    form = {
      kind: entry.kind,
      category: entry.category,
      amount: String(entry.amount),
      title: entry.title,
      notes: entry.notes || "",
      occurred_on: entry.occurred_on,
      payment_status: entry.payment_status || "pagado",
    };
  }

  async function saveEntry() {
    error = null;
    message = null;
    const amount = Number(form.amount);
    if (!form.title.trim() || !(amount > 0) || !form.occurred_on) {
      error = "Completa título, monto y fecha";
      return;
    }
    const payload = {
      kind: form.kind,
      category: form.category,
      amount,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      occurred_on: form.occurred_on,
      payment_status: form.kind === "gasto" ? form.payment_status : "pagado",
    };
    try {
      if (useDemoMode) {
        if (editingId) demoStore.financeUpdate(editingId, payload);
        else demoStore.financeCreate(payload);
      } else {
        if (editingId) {
          await api(`/api/finance/${editingId}`, {
            method: "PATCH",
            token: session.token,
            body: JSON.stringify(payload),
          });
        } else {
          await api("/api/finance", {
            method: "POST",
            token: session.token,
            body: JSON.stringify(payload),
          });
        }
      }
      message = editingId ? "Movimiento actualizado" : "Movimiento registrado";
      resetForm();
      await loadFinance();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo guardar";
    }
  }

  async function removeEntry(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    error = null;
    try {
      if (useDemoMode) demoStore.financeDelete(id);
      else await api(`/api/finance/${id}`, { method: "DELETE", token: session.token });
      if (editingId === id) resetForm();
      if (detail?.id === id) detail = null;
      message = "Movimiento eliminado";
      await loadFinance();
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo eliminar";
    }
  }

  async function togglePayment(entry: FinanceEntry) {
    if (entry.kind !== "gasto") return;
    const next: FinancePaymentStatus =
      entry.payment_status === "pendiente" ? "pagado" : "pendiente";
    try {
      if (useDemoMode) demoStore.financeUpdate(entry.id, { payment_status: next });
      else {
        await api(`/api/finance/${entry.id}`, {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify({ payment_status: next }),
        });
      }
      message = next === "pagado" ? "Marcado como pagado" : "Marcado como pendiente";
      await loadFinance();
      if (detail?.id === entry.id) {
        detail = { ...detail, payment_status: next };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo actualizar estado";
    }
  }

  async function openReceipt(entry: FinanceEntry) {
    if (!entry.receipt_path) {
      error = "Este movimiento no tiene comprobante";
      return;
    }
    if (useDemoMode) {
      message = "En modo demo no hay archivo en Storage";
      return;
    }
    try {
      const res = await api<{ url: string }>(`/api/finance/${entry.id}/receipt`, {
        token: session.token,
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo abrir el comprobante";
    }
  }

  async function onReceiptSelected(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    error = null;
    message = null;
    analyzing = true;
    review = null;
    clearPreview();
    previewUrl = URL.createObjectURL(file);

    try {
      if (useDemoMode) {
        review = extractionToReview(
          {
            pending_path: `demo/${file.name}`,
            receipt_mime: file.type || "application/pdf",
            receipt_filename: file.name,
            duplicates: [],
            source: "demo",
            text_preview: null,
          },
          {
            category: null,
            provider: null,
            occurred_on: new Date().toISOString().slice(0, 10),
            period_start: null,
            period_end: null,
            due_date: null,
            amount: null,
            reference_number: null,
            concept: null,
            title: file.name.replace(/\.[^.]+$/, ""),
            payment_status: "pendiente",
            notes: "Modo demo: completa los datos a mano.",
          },
        );
        message = "Revisa y completa los datos del recibo";
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload<{
        pending_path: string;
        receipt_mime: string;
        receipt_filename: string;
        extraction: ReceiptExtraction;
        duplicates: Array<{ id: string; title: string; amount: number }>;
        source?: string;
        text_preview?: string | null;
      }>("/api/finance/receipts/analyze", fd, session.token);

      review = extractionToReview(res, res.extraction);
      if (res.source === "pdf-reader") {
        message = "PDF leído. Revisa y corrige los datos antes de guardar.";
      } else if (res.source === "pdf+openai") {
        message = "PDF leído con IA. Revisa los datos antes de guardar.";
      } else if (res.duplicates?.length > 0) {
        message = "Analizado. Hay posibles duplicados — revisa antes de guardar.";
      } else {
        message = "Recibo analizado. Revisa los datos antes de guardar.";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo analizar el recibo";
      clearPreview();
    } finally {
      analyzing = false;
    }
  }

  async function confirmReceipt(force = false) {
    if (!review) return;
    error = null;
    message = null;
    const amount = Number(review.amount);
    if (!review.title.trim() || !(amount > 0) || !review.occurred_on || !review.category) {
      error = "Completa título, categoría, monto y fecha antes de guardar";
      return;
    }

    confirming = true;
    try {
      const payload = {
        pending_path: review.pending_path,
        receipt_mime: review.receipt_mime,
        receipt_filename: review.receipt_filename,
        force,
        category: review.category,
        amount,
        title: review.title.trim(),
        notes: review.notes.trim() || null,
        occurred_on: review.occurred_on,
        provider: review.provider.trim() || null,
        payment_status: review.payment_status,
        due_date: review.due_date || null,
        period_start: review.period_start || null,
        period_end: review.period_end || null,
        reference_number: review.reference_number.trim() || null,
        concept: review.concept.trim() || null,
      };

      if (useDemoMode) {
        demoStore.financeCreate({
          kind: "gasto",
          category: payload.category,
          amount: payload.amount,
          title: payload.title,
          notes: payload.notes,
          occurred_on: payload.occurred_on,
          provider: payload.provider,
          payment_status: payload.payment_status,
          due_date: payload.due_date,
          period_start: payload.period_start,
          period_end: payload.period_end,
          reference_number: payload.reference_number,
          concept: payload.concept,
          receipt_path: null,
          receipt_mime: payload.receipt_mime,
          receipt_filename: payload.receipt_filename,
        });
      } else {
        await api("/api/finance/receipts/confirm", {
          method: "POST",
          token: session.token,
          body: JSON.stringify(payload),
        });
      }

      review = null;
      clearPreview();
      message = "Gasto guardado con comprobante";
      await loadFinance();
    } catch (err) {
      const e = err as Error & {
        status?: number;
        body?: { duplicates?: Array<{ id: string; title: string; amount: number }> };
      };
      if (e.status === 409 && e.body?.duplicates && review) {
        review.duplicates = e.body.duplicates;
        error = "Posible duplicado. Revisa o confirma de nuevo para forzar.";
      } else {
        error = err instanceof Error ? err.message : "No se pudo guardar el recibo";
      }
    } finally {
      confirming = false;
    }
  }

  const maxMonth = $derived(
    Math.max(1, ...summary.by_month.flatMap((m) => [m.ingresos, m.gastos])),
  );
  const maxCat = $derived(Math.max(1, ...summary.by_category.map((c) => c.total)));
</script>

{#if !session.profile?.home_id}
  <section class="setup">
    <h2>Finanzas</h2>
    <p class="muted">Primero crea o únete a un hogar en la pestaña Hogar.</p>
  </section>
{:else}
  <section class="finance">
    <header class="hero-strip">
      <div>
        <p class="eyebrow">Módulo de finanzas</p>
        <h2>Ingresos y gastos del hogar</h2>
      </div>
      <label class="upload-btn">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onchange={onReceiptSelected}
          disabled={analyzing}
        />
        {analyzing ? "Analizando…" : "Subir recibo"}
      </label>
    </header>

    {#if message}<p class="ok">{message}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if loading}<p class="muted">Cargando…</p>{/if}

    <div class="totals">
      <div class="stat">
        <span>Ingresos</span>
        <strong class="income">{money(summary.total_ingresos)}</strong>
      </div>
      <div class="stat">
        <span>Gastos</span>
        <strong class="expense">{money(summary.total_gastos)}</strong>
      </div>
      <div class="stat">
        <span>Ganancia neta</span>
        <strong class:income={summary.ganancia_neta >= 0} class:expense={summary.ganancia_neta < 0}>
          {money(summary.ganancia_neta)}
        </strong>
      </div>
      <div class="stat">
        <span>Pendiente de pago</span>
        <strong class="expense">{money(summary.total_pendiente || 0)}</strong>
      </div>
      <div class="stat">
        <span>Vencidos</span>
        <strong class="expense">{summary.vencidos_count || 0}</strong>
      </div>
    </div>

    {#if review}
      <article class="review">
        <h3>Revisar información del recibo</h3>
        <p class="muted">
          Archivo: {review.receipt_filename}
          {#if review.source === "pdf-reader"} · leído del PDF{/if}
          {#if review.source === "pdf+openai"} · PDF + IA{/if}
          . Nada se guarda hasta que confirmes.
        </p>

        <div class="review-layout">
          <div class="reader">
            <h4>Vista del documento</h4>
            {#if previewUrl && review.receipt_mime === "application/pdf"}
              <iframe title="Lector PDF" class="pdf-frame" src={previewUrl}></iframe>
            {:else if previewUrl && review.receipt_mime.startsWith("image/")}
              <img class="receipt-img" src={previewUrl} alt="Vista del recibo" />
            {:else}
              <p class="muted">Sin vista previa</p>
            {/if}
            {#if review.text_preview}
              <details class="text-preview">
                <summary>Texto detectado en el PDF</summary>
                <pre>{review.text_preview}</pre>
              </details>
            {/if}
          </div>

          <div class="review-form">
            {#if review.duplicates.length > 0}
              <div class="warn">
                <p>Posibles duplicados:</p>
                <ul>
                  {#each review.duplicates as d}
                    <li>{d.title} · {money(Number(d.amount))}</li>
                  {/each}
                </ul>
              </div>
            {/if}
            <div class="form-grid">
              <label>
                Categoría
                <select bind:value={review.category}>
                  {#each EXPENSE_CATEGORIES as c}
                    <option value={c}>{labelCategory(c)}</option>
                  {/each}
                </select>
              </label>
              <label>
                Proveedor
                <input bind:value={review.provider} placeholder="CFE, Telmex…" />
              </label>
              <label>
                Título
                <input bind:value={review.title} />
              </label>
              <label>
                Importe
                <input type="number" min="0.01" step="0.01" bind:value={review.amount} />
              </label>
              <label>
                Fecha recibo
                <input type="date" bind:value={review.occurred_on} />
              </label>
              <label>
                Vence
                <input type="date" bind:value={review.due_date} />
              </label>
              <label>
                Periodo inicio
                <input type="date" bind:value={review.period_start} />
              </label>
              <label>
                Periodo fin
                <input type="date" bind:value={review.period_end} />
              </label>
              <label>
                Referencia
                <input bind:value={review.reference_number} />
              </label>
              <label>
                Concepto
                <input bind:value={review.concept} />
              </label>
              <label>
                Estado
                <select bind:value={review.payment_status}>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                </select>
              </label>
              <label class="span2">
                Notas
                <input bind:value={review.notes} />
              </label>
            </div>
            <div class="actions">
              <button class="primary" disabled={confirming} onclick={() => confirmReceipt(false)}>
                {confirming ? "Guardando…" : "Guardar gasto"}
              </button>
              {#if review.duplicates.length > 0}
                <button disabled={confirming} onclick={() => confirmReceipt(true)}>Guardar de todos modos</button>
              {/if}
              <button onclick={cancelReview}>Cancelar</button>
            </div>
          </div>
        </div>
      </article>
    {/if}

    <article>
      <h3>Filtros</h3>
      <div class="form-row">
        <label>
          Desde
          <input type="date" bind:value={filters.from} />
        </label>
        <label>
          Hasta
          <input type="date" bind:value={filters.to} />
        </label>
        <label>
          Tipo
          <select bind:value={filters.kind}>
            <option value="">Todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
          </select>
        </label>
        <label>
          Categoría
          <select bind:value={filters.category}>
            <option value="">Todas</option>
            {#each [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as c}
              <option value={c}>{labelCategory(c)}</option>
            {/each}
          </select>
        </label>
        <label>
          Estado
          <select bind:value={filters.payment_status}>
            <option value="">Todos</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
        <label>
          Proveedor
          <input placeholder="Buscar…" bind:value={filters.provider} />
        </label>
        <button class="primary" onclick={loadFinance}>Aplicar</button>
      </div>
    </article>

    <div class="charts">
      <article>
        <h3>Por mes</h3>
        {#if summary.by_month.length === 0}
          <p class="muted">Sin datos para graficar</p>
        {:else}
          <div class="bars" role="img" aria-label="Ingresos y gastos por mes">
            {#each summary.by_month as m}
              <div class="bar-group">
                <div class="bar-pair">
                  <div class="bar income" style={`height:${(m.ingresos / maxMonth) * 100}%`} title={`Ingresos ${money(m.ingresos)}`}></div>
                  <div class="bar expense" style={`height:${(m.gastos / maxMonth) * 100}%`} title={`Gastos ${money(m.gastos)}`}></div>
                </div>
                <span>{m.month.slice(5)}</span>
              </div>
            {/each}
          </div>
          <p class="legend"><span class="dot income"></span> Ingresos <span class="dot expense"></span> Gastos</p>
        {/if}
      </article>

      <article>
        <h3>Por categoría</h3>
        {#if summary.by_category.length === 0}
          <p class="muted">Sin datos para graficar</p>
        {:else}
          <ul class="cat-bars">
            {#each summary.by_category as c}
              <li>
                <div class="cat-label">
                  <span>{labelCategory(c.category)}</span>
                  <span>{money(c.total)}</span>
                </div>
                <div class="track">
                  <div class="fill" style={`width:${(c.total / maxCat) * 100}%`}></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    </div>

    {#if (summary.upcoming_dues || []).length > 0}
      <article>
        <h3>Próximos vencimientos</h3>
        <ul class="list">
          {#each summary.upcoming_dues || [] as d}
            <li>
              <div>
                <strong class="expense">{money(d.amount)}</strong>
                <span class="muted">{d.title}{#if d.provider} · {d.provider}{/if} · vence {d.due_date}</span>
              </div>
            </li>
          {/each}
        </ul>
      </article>
    {/if}

    <article>
      <h3>{editingId ? "Editar movimiento" : "Registrar movimiento"}</h3>
      <div class="form-row">
        <select bind:value={form.kind} onchange={onKindChange}>
          <option value="ingreso">Ingreso</option>
          <option value="gasto">Gasto</option>
        </select>
        <select bind:value={form.category}>
          {#each categoryOptions as c}
            <option value={c}>{labelCategory(c)}</option>
          {/each}
        </select>
        <input type="number" min="0.01" step="0.01" placeholder="Monto" bind:value={form.amount} />
        <input placeholder="Título" bind:value={form.title} />
        <input type="date" bind:value={form.occurred_on} />
        {#if form.kind === "gasto"}
          <select bind:value={form.payment_status}>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        {/if}
        <input placeholder="Notas (opcional)" bind:value={form.notes} />
        <button class="primary" onclick={saveEntry}>{editingId ? "Guardar" : "Agregar"}</button>
        {#if editingId}
          <button onclick={resetForm}>Cancelar</button>
        {/if}
      </div>
    </article>

    {#if detail}
      <article>
        <h3>Detalle</h3>
        <div class="detail-grid">
          <p><span class="muted">Título</span><strong>{detail.title}</strong></p>
          <p><span class="muted">Monto</span><strong class:expense={detail.kind === "gasto"} class:income={detail.kind === "ingreso"}>{money(Number(detail.amount))}</strong></p>
          <p><span class="muted">Categoría</span>{labelCategory(detail.category)}</p>
          <p><span class="muted">Fecha</span>{detail.occurred_on}</p>
          <p><span class="muted">Estado</span>{detail.payment_status || "pagado"}</p>
          <p><span class="muted">Proveedor</span>{detail.provider || "—"}</p>
          <p><span class="muted">Referencia</span>{detail.reference_number || "—"}</p>
          <p><span class="muted">Vence</span>{detail.due_date || "—"}</p>
          <p><span class="muted">Periodo</span>{detail.period_start || "—"} → {detail.period_end || "—"}</p>
          <p><span class="muted">Concepto</span>{detail.concept || "—"}</p>
          <p class="span2"><span class="muted">Notas</span>{detail.notes || "—"}</p>
        </div>
        <div class="actions">
          {#if detail.receipt_path || detail.receipt_filename}
            <button onclick={() => openReceipt(detail!)}>Ver comprobante</button>
          {/if}
          {#if detail.kind === "gasto"}
            <button onclick={() => togglePayment(detail!)}>
              Marcar {detail.payment_status === "pendiente" ? "pagado" : "pendiente"}
            </button>
          {/if}
          <button onclick={() => startEdit(detail!)}>Editar</button>
          <button onclick={() => (detail = null)}>Cerrar</button>
        </div>
      </article>
    {/if}

    <article>
      <h3>Movimientos</h3>
      <ul class="list">
        {#each entries as e}
          <li>
            <div>
              <strong class:income={e.kind === "ingreso"} class:expense={e.kind === "gasto"}>
                {e.kind === "ingreso" ? "+" : "-"}{money(Number(e.amount))}
              </strong>
              <span class="muted">
                {e.title} · {labelCategory(e.category)} · {e.occurred_on}
                {#if e.provider} · {e.provider}{/if}
                {#if e.kind === "gasto"}
                  · <span class:badge-pending={e.payment_status === "pendiente"}>{e.payment_status || "pagado"}</span>
                {/if}
                {#if e.receipt_path || e.receipt_filename} · comprobante{/if}
              </span>
            </div>
            <div class="actions">
              <button onclick={() => (detail = e)}>Ver</button>
              <button onclick={() => startEdit(e)}>Editar</button>
              <button onclick={() => removeEntry(e.id)}>Eliminar</button>
            </div>
          </li>
        {:else}
          <li class="muted">Aún no hay movimientos</li>
        {/each}
      </ul>
    </article>
  </section>
{/if}

<style>
  .finance,
  .setup {
    display: grid;
    gap: 1.25rem;
  }
  .hero-strip {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .eyebrow {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  h2,
  h3 {
    font-family: var(--font-display);
    margin: 0.2rem 0;
  }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: #fff;
    border-radius: 10px;
    padding: 0.65rem 1rem;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
  }
  .upload-btn input {
    display: none;
  }
  .totals {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
  .stat {
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1rem;
    display: grid;
    gap: 0.35rem;
  }
  .stat span {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .stat strong {
    font-family: var(--font-display);
    font-size: 1.25rem;
  }
  .income {
    color: var(--accent);
  }
  .expense {
    color: #9b2c2c;
  }
  .charts {
    display: grid;
    gap: 1.25rem;
  }
  @media (min-width: 900px) {
    .charts {
      grid-template-columns: 1fr 1fr;
    }
  }
  article {
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1rem 1.1rem;
  }
  .review {
    border-color: var(--accent);
  }
  .review-layout {
    display: grid;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  @media (min-width: 960px) {
    .review-layout {
      grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.1fr);
      align-items: start;
    }
  }
  .reader h4 {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 1rem;
  }
  .pdf-frame {
    width: 100%;
    min-height: 420px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
  }
  .receipt-img {
    width: 100%;
    max-height: 420px;
    object-fit: contain;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
  }
  .text-preview {
    margin-top: 0.75rem;
    font-size: 0.85rem;
  }
  .text-preview pre {
    white-space: pre-wrap;
    max-height: 160px;
    overflow: auto;
    background: #f7f3ea;
    border-radius: 10px;
    padding: 0.65rem;
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
  }
  .warn {
    background: #fff4e5;
    border: 1px solid #e7c48a;
    border-radius: 10px;
    padding: 0.65rem 0.8rem;
    margin: 0.75rem 0;
    font-size: 0.9rem;
  }
  .form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
    align-items: end;
  }
  .form-grid,
  .detail-grid {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-top: 0.75rem;
  }
  .span2 {
    grid-column: 1 / -1;
  }
  .detail-grid p {
    margin: 0;
    display: grid;
    gap: 0.15rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input,
  select {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    font: inherit;
    background: #fff;
  }
  .bars {
    display: flex;
    gap: 0.75rem;
    align-items: end;
    min-height: 160px;
    padding-top: 0.5rem;
  }
  .bar-group {
    flex: 1;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }
  .bar-pair {
    display: flex;
    gap: 3px;
    align-items: end;
    height: 130px;
    width: 100%;
    justify-content: center;
  }
  .bar {
    width: 12px;
    min-height: 2px;
    border-radius: 6px 6px 0 0;
  }
  .bar.income {
    background: var(--accent);
  }
  .bar.expense {
    background: #c45c5c;
  }
  .legend {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    display: inline-block;
    margin-right: 0.25rem;
  }
  .dot.income {
    background: var(--accent);
  }
  .dot.expense {
    background: #c45c5c;
  }
  .cat-bars {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }
  .cat-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
  }
  .track {
    height: 8px;
    background: #ebe4d6;
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
  }
  .list {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }
  .list li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--line);
  }
  .list li > div:first-child {
    display: grid;
    gap: 0.15rem;
  }
  .actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }
  .list .actions {
    margin-top: 0;
  }
  .badge-pending {
    color: #9b2c2c;
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .ok {
    color: var(--accent);
  }
  .error {
    color: #9b2c2c;
  }
</style>
