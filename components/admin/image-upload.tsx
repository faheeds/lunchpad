"use client";

/**
 * Reusable image-upload widget backed by Vercel Blob.
 *
 * Usage in a server-action form:
 *   <ImageUpload name="logoUrl" defaultValue={restaurant.logoUrl} aspect="square" />
 *
 * On select, the file is uploaded directly to Vercel Blob via /api/admin/upload,
 * then the resulting public URL is written into a hidden <input name=...>
 * so the parent form picks it up on submit. There's also a "paste URL"
 * fallback for operators who already have a CDN-hosted image.
 */

import { useId, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type Aspect = "square" | "wide" | "free";

const ASPECT_CLASSES: Record<Aspect, string> = {
  square: "aspect-square",
  wide: "aspect-[16/9]",
  free: "aspect-[4/3]",
};

export function ImageUpload({
  name,
  defaultValue,
  label,
  aspect = "square",
  hint,
}: {
  name: string;
  defaultValue?: string | null;
  label?: string;
  aspect?: Aspect;
  hint?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string>(defaultValue ?? "");
  const [pasting, setPasting] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const blob = await upload(safeName, file, {
        access: "public",
        handleUploadUrl: "/api/admin/upload",
      });
      setUrl(blob.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setUrl("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-[11px] text-slate-500 font-medium block">{label}</label>
      )}

      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className={`${ASPECT_CLASSES[aspect]} w-full object-cover rounded-[12px] border border-slate-200`}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/40 rounded-[12px] transition">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white text-[11px] font-semibold text-ink"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={clear}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold"
            >
              Remove
            </button>
          </div>
        </div>
      ) : pasting ? (
        <div className="space-y-2">
          <input
            type="url"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setUrl(pasteValue.trim());
                setPasting(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-semibold"
            >
              Use URL
            </button>
            <button
              type="button"
              onClick={() => {
                setPasting(false);
                setPasteValue("");
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`${ASPECT_CLASSES[aspect]} w-full flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-brand-700/40 cursor-pointer transition`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-[12px] font-medium text-slate-500">
            {busy ? "Uploading…" : "Click to upload an image"}
          </p>
          <p className="text-[10px] text-slate-400">PNG, JPG, WebP up to 8MB</p>
        </label>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {!url && !pasting && (
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="text-[11px] text-slate-400 hover:text-brand-700 transition"
        >
          or paste a URL instead
        </button>
      )}

      {hint && !error && (
        <p className="text-[10px] text-slate-400">{hint}</p>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
