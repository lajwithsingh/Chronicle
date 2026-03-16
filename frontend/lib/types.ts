export type EventType =
  | "research_done"
  | "research_validation_pass"
  | "pipeline_status"
  | "script_done"
  | "narrative_ready"
  | "storyboard_ready"
  | "character_references_ready"
  | "segment_media_done"
  | "clip_started"
  | "clip_done"
  | "assembly_progress"
  | "documentary_complete"
  | "error";

export interface DocumentarySegment {
  segment_number: number;
  segment_title: string;
  visual_purpose: string;
  emotional_beat: string;
}

export interface EditableSegment extends DocumentarySegment {
  narration_chunk: string;
  veo_prompt: string;
}

export interface SegmentEdit {
  segment_number: number;
  narration_chunk?: string;
  veo_prompt?: string;
  segment_title?: string;
}

export interface MediaSegment {
  segment_number: number;
  segment_title: string;
  narration_chunk: string;
  image_b64?: string;
  image_url?: string;
  image_mime: string;
}

export interface VideoClipStarted {
  window_index: number;
  segment_number: number;
  segment_title: string;
  narration_text: string;
  reference_segment_numbers: number[];
  has_character_collage: boolean;
  clips_total: number;
}

export interface VideoClip {
  segment_number: number;
  segment_title: string;
  narration_text?: string;
  clip_signed_url: string;
  duration_seconds: number;
  window_index?: number;
}

export interface EraIntelligence {
  style_bible: string;
  era_material_culture: {
    primary_clothing?: string;
    secondary_clothing?: string;
    hairstyles?: string;
    accessories?: string;
    physical_descriptors?: string;
    fabrics_materials?: string;
    wardrobe_negative_nouns?: string;
    note?: string;
  };
  era_architecture: {
    dominant_architecture?: string;
    street_environment?: string;
    landscape_vegetation?: string;
    vehicles_transport?: string;
    lighting_infrastructure?: string;
    distinctive_visual_elements?: string;
    architecture_negative_nouns?: string;
    note?: string;
  };
  era_technology: {
    communication_devices?: string;
    computing_media?: string;
    everyday_tools_objects?: string;
    media_entertainment?: string;
    era_defining_objects?: string;
    technology_negative_nouns?: string;
    note?: string;
  };
}

export interface ResearchDoneData extends Partial<EraIntelligence> {
  topic: string;
  key_figures: string[];
  defining_moment: string;
  timeline_count: number;
  brief_summary: string;
  detected_year: number;
  era_style: string;
}

export interface ScriptDoneData {
  documentary_title: string;
  total_duration_estimate: string;
  segments: DocumentarySegment[];
  era_style: string;
}


export interface PipelineStatusData {
  stage: "research" | "characters" | "script" | "system";
  step: string;
  attempt: number;
  message: string;
  issues?: string[];
  is_final?: boolean;
}

export interface PipelineLogEntry {
  id: number;          // monotonic counter for stable React keys
  stage: "research" | "characters" | "script" | "system";
  step: string;
  attempt: number;
  message: string;
  issues?: string[];
}

export interface AssemblyProgressData {
  percent: number;
  stage: string;
}

export interface DocumentaryCompleteData {
  final_video_url: string;
  duration_seconds: number;
  transcript: string;
  topic: string;
  segments_count: number;
  era_style: string;
}

export interface ChronicleEvent {
  event: EventType;
  session_id?: string;
  data: Record<string, unknown>;
}

export type GenerationStatus =
  | "idle"
  | "researching"
  | "era_researching"
  | "validating_research"
  | "awaiting_narrative"   // research done — user reviews before triggering story writing
  | "narrating"
  | "generating_characters"
  | "validating_narrative"
  | "awaiting_storyboard"
  | "generating_media"
  | "awaiting_video"
  | "generating_video"
  | "assembling"
  | "complete"
  | "error";

export interface ChronicleState {
  sessionId: string | null;
  status: GenerationStatus;
  eraStyle: string | null;
  topic: string;
  documentaryTitle: string | null;
  researchBrief: ResearchDoneData | null;
  documentarySegments: DocumentarySegment[];
  editableSegments: EditableSegment[];
  characterReferenceImages: string[];
  characterCollageB64: string | null;
  selectedStoryboardSegments: Set<number>;
  mediaSegments: MediaSegment[];
  clipsStarted: Record<number, VideoClipStarted>; // keyed by window_index
  videoClips: VideoClip[];
  assemblyPercent: number;
  assemblyStage: string;
  finalVideoUrl: string | null;
  transcript: string | null;
  agentActivity: string;
  userNotes: string;               // researcher notes injected into the narrative agent
  pipelineLog: PipelineLogEntry[]; // live log of all pipeline_status events
  error: string | null;
  errorRecoverable: boolean;       // true = user can retry; false = fatal
  isAutonomous: boolean;
}
