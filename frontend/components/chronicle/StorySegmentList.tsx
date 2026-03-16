"use client";
import type { EditableSegment, MediaSegment } from "@/lib/types";
import { StorySegment } from "./StorySegment";

interface StorySegmentListProps {
  scriptSegments: EditableSegment[];
  mediaSegments: MediaSegment[];
}

export function StorySegmentList({ scriptSegments, mediaSegments }: StorySegmentListProps) {
  if (scriptSegments.length === 0) return null;

  const mediaBySegment = new Map(
    mediaSegments.map((segment) => [segment.segment_number, segment]),
  );

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-serif text-chronicle-text">Storyboard</h3>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {scriptSegments.map((segment, i) => {
          const media = mediaBySegment.get(segment.segment_number);
          return (
            <StorySegment
              key={segment.segment_number}
              index={i}
              segment={{
                segment_number: segment.segment_number,
                segment_title: segment.segment_title,
                narration_chunk: segment.narration_chunk,
                image_b64: media?.image_b64,
                image_url: media?.image_url,
                image_mime: media?.image_mime ?? "image/png",
                image_status: media ? "ready" : "pending",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
