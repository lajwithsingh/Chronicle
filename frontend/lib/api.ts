import type { SegmentEdit } from "./types";

const BASE = "/api/chronicle";

// For SSE, bypass Next.js rewrite proxy (it buffers SSE responses).
// Connect directly to the backend. Set NEXT_PUBLIC_BACKEND_URL if backend
// is not on localhost:8080.
const BACKEND_DIRECT =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

export async function startGeneration(topic: string, sessionId?: string, visualStyle?: string, voicePreference?: string, autonomous?: boolean): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      session_id: sessionId,
      visual_style: visualStyle ?? "cinematic",
      voice_preference: voicePreference ?? "male",
      autonomous: autonomous ?? false
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start generation: ${err}`);
  }
  return res.json();
}

export async function generateNarrative(
  sessionId: string,
  params: {
    definingMoment?: string;
    keyFigures?: string[];
    briefSummary?: string;
    detectedYear?: number;
    eraStyle?: string;
    styleBible?: string;
    userNotes?: string;
    autonomous?: boolean;
  } = {},
): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/generate-narrative/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      defining_moment: params.definingMoment,
      key_figures: params.keyFigures,
      brief_summary: params.briefSummary,
      detected_year: params.detectedYear,
      era_style: params.eraStyle,
      style_bible: params.styleBible,
      user_notes: params.userNotes ?? "",
      autonomous: params.autonomous ?? false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start narrative generation: ${err}`);
  }
  return res.json();
}

export async function generateStoryboard(
  sessionId: string,
  segmentEdits: SegmentEdit[],
  autonomous = false,
): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/generate-storyboard/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segment_edits: segmentEdits, autonomous }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start storyboard generation: ${err}`);
  }
  return res.json();
}

export async function generateVideo(
  sessionId: string,
  segmentEdits: SegmentEdit[],
  selectedStoryboardSegments: number[],
  autonomous = false,
  voicePreference = "male",
): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/generate-video/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segment_edits: segmentEdits,
      selected_storyboard_segments: selectedStoryboardSegments,
      autonomous,
      voice_preference: voicePreference,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start video generation: ${err}`);
  }
  return res.json();
}

export async function updateSegment(
  sessionId: string,
  segmentNumber: number,
  data: Partial<SegmentEdit>,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/segment/${segmentNumber}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update segment: ${err}`);
  }
}

export function getRegenerateImageUrl(sessionId: string, segmentNumber: number): string {
  return `${BACKEND_DIRECT}/chronicle/session/${sessionId}/segment/${segmentNumber}/regenerate-image`;
}

export async function retryPipeline(sessionId: string): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/retry/${sessionId}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to retry pipeline: ${err}`);
  }
  return res.json();
}

export async function restartResearch(sessionId: string, notes?: string): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/restart-research/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restart_notes: notes ?? "" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to restart research: ${err}`);
  }
  return res.json();
}

export async function getResult(sessionId: string) {
  const res = await fetch(`${BASE}/result/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch result");
  return res.json();
}

// Direct backend URL for SSE to avoid Next.js proxy buffering
export function getStreamUrl(sessionId: string): string {
  return `${BACKEND_DIRECT}/chronicle/stream/${sessionId}`;
}

/**
 * Resolve a media URL that may be a relative backend path (e.g. "/chronicle/clip/...")
 * or an already-absolute URL (real GCS signed URL starting with "https://").
 * Videos must be loaded directly from the backend, not through Next.js.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url; // already absolute (real signed URL)
  return `${BACKEND_DIRECT}${url}`;
}

export function resolveImageSrc(image?: string, mimeType = "image/png", imageUrl?: string): string {
  const candidate = imageUrl || image || "";
  if (!candidate) return "";
  if (candidate.startsWith("http") || candidate.startsWith("/")) {
    return resolveMediaUrl(candidate);
  }
  return `data:${mimeType};base64,${candidate}`;
}

export async function generateCharacters(sessionId: string, userPrompt?: string): Promise<unknown> {
  const res = await fetch(`${BASE}/characters/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_prompt: userPrompt || "" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to generate characters: ${err}`);
  }
  return res.json();
}

export async function regenerateVideoClip(
  sessionId: string,
  segmentNumber: number,
  userPrompt: string,
): Promise<{ ok: boolean; clip: any }> {
  const res = await fetch(
    `${BACKEND_DIRECT}/chronicle/session/${sessionId}/segment/${segmentNumber}/regenerate-video-clip`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: userPrompt }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to regenerate video clip: ${err}`);
  }
  return res.json();
}

export async function regenerateVideoAll(sessionId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND_DIRECT}/chronicle/session/${sessionId}/regenerate-video-all`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to regenerate all video clips: ${err}`);
  }
  return res.json();
}

export async function rewriteSegmentNarrative(
  sessionId: string,
  segmentNumber: number,
  userPrompt: string,
): Promise<void> {
  const res = await fetch(`${BACKEND_DIRECT}/chronicle/session/${sessionId}/segment/${segmentNumber}/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_prompt: userPrompt }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to rewrite segment narrative: ${err}`);
  }
}
