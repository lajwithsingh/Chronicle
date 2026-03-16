import type { EventType } from "./types";

export type SSEHandler = (data: Record<string, unknown>) => void;

export class ChronicleSSE {
  private source: EventSource | null = null;
  private handlers: Map<EventType, SSEHandler[]> = new Map();
  private onCloseCallback?: () => void;

  connect(url: string): void {
    this.source = new EventSource(url);
    this.source.onerror = () => this.close();

    const eventTypes: EventType[] = [
      "research_done",
      "research_validation_pass",
      "pipeline_status",
      "script_done",
      "narrative_ready",
      "storyboard_ready",
      "segment_media_done",
      "clip_done",
      "assembly_progress",
      "documentary_complete",
      "error",
    ];

    eventTypes.forEach((type) => {
      this.source!.addEventListener(type, (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        (this.handlers.get(type) || []).forEach((fn) => fn(data));
      });
    });
  }

  on(event: EventType, handler: SSEHandler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
    return this;
  }

  onClose(callback: () => void): this {
    this.onCloseCallback = callback;
    return this;
  }

  close(): void {
    this.source?.close();
    this.source = null;
    this.onCloseCallback?.();
  }
}
