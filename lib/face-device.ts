import type { FaceDeviceClass } from "@/lib/face-types";

export function detectFaceDeviceClass(): FaceDeviceClass {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "desktop";
  const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (userAgentData?.mobile === true) return "mobile";
  if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent)) return "mobile";
  if (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return "mobile";
  const shortestSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  if (navigator.maxTouchPoints > 1 && shortestSide <= 600) return "mobile";
  return "desktop";
}
