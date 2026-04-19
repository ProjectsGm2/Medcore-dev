import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function resolveImageSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:image\//i.test(raw)) return raw;
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  if (raw.startsWith("blob:") || raw.startsWith("/")) return raw;
  const compact = raw.replace(/\s+/g, "");
  const looksLikeBase64 = compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact);
  if (looksLikeBase64) return `data:image/png;base64,${compact}`;
  return raw;
}


export const isIframe = window.self !== window.top;
