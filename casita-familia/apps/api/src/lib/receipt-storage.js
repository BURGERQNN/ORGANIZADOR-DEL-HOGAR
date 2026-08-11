import { supabaseAdmin } from "./supabase.js";

const BUCKET = "receipts";

export async function ensureReceiptsBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.id === BUCKET || b.name === BUCKET);
  if (exists) return;
  await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/jpg"],
  });
}

export async function uploadReceipt({ homeId, buffer, mime, filename, pending = false }) {
  await ensureReceiptsBucket();
  const safeName = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const folder = pending ? "pending" : "stored";
  const path = `${homeId}/${folder}/${Date.now()}_${safeName}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function movePendingReceipt(pendingPath, homeId, filename) {
  if (!pendingPath) return null;
  if (!pendingPath.includes("/pending/")) return pendingPath;
  await ensureReceiptsBucket();
  const safeName = (filename || "recibo").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const dest = `${homeId}/stored/${Date.now()}_${safeName}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).move(pendingPath, dest);
  if (error) {
    // Si move falla, dejamos el path pendiente usable
    console.warn("[storage] move failed:", error.message);
    return pendingPath;
  }
  return dest;
}

export async function createSignedReceiptUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function removeReceipt(path) {
  if (!path) return;
  await supabaseAdmin.storage.from(BUCKET).remove([path]);
}

export { BUCKET };
