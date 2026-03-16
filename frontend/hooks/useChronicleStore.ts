import { create } from "zustand";
import type {
  ChronicleState,
  DocumentarySegment,
  EditableSegment,
  GenerationStatus,
  MediaSegment,
  PipelineLogEntry,
  PipelineStatusData,
  ResearchDoneData,
  VideoClip,
  VideoClipStarted,
} from "@/lib/types";

let _pipelineLogCounter = 0;

function deriveStatusFromPipelineEvent(
  currentStatus: GenerationStatus,
  isAutonomous: boolean,
  data: PipelineStatusData,
): GenerationStatus {
  if (data.is_final && data.stage === "characters" && data.step === "character_generation") {
    return isAutonomous ? "narrating" : "awaiting_narrative";
  }

  if (data.stage === "research") {
    if (data.step === "researching") {
      return "researching";
    }
    if (data.step === "era_research") {
      return "era_researching";
    }
    if (["validating", "pass", "fail"].includes(data.step)) {
      return "validating_research";
    }
    return currentStatus;
  }

  if (data.stage === "characters") {
    return "generating_characters";
  }

  if (data.stage === "script") {
    if (data.step === "writing") {
      return "narrating";
    }
    if (["validating", "pass", "fail"].includes(data.step)) {
      return "validating_narrative";
    }
  }

  return currentStatus;
}

interface NarrativeReadyData {
  documentary_title: string;
  segments: EditableSegment[];
}

interface ChronicleActions {
  setStatus: (status: GenerationStatus) => void;
  setSessionId: (id: string) => void;
  setTopic: (topic: string) => void;
  setIsAutonomous: (val: boolean) => void;
  handlePipelineStatus: (data: PipelineStatusData) => void;
  handleResearchDone: (data: ResearchDoneData) => void;
  handleResearchValidationPass: () => void;
  handleScriptDone: (data: { segments: DocumentarySegment[]; era_style: string; documentary_title?: string }) => void;
  handleNarrativeReady: (data: NarrativeReadyData) => void;
  handleCharacterReferencesReady: (data: { character_reference_images: string[]; character_collage_b64?: string }) => void;
  handleStoryboardReady: () => void;
  handleSegmentMediaDone: (segment: MediaSegment) => void;
  updateMediaSegment: (segment: MediaSegment) => void;
  handleClipStarted: (data: VideoClipStarted) => void;
  handleClipDone: (clip: VideoClip) => void;
  handleAssemblyProgress: (percent: unknown, stage: unknown) => void;
  handleDocumentaryComplete: (data: {
    final_video_url: string;
    duration_seconds: number;
    transcript: string;
    topic: string;
    segments_count: number;
    era_style: string;
  }) => void;
  handleError: (message: unknown, recoverable?: boolean) => void;
  updateResearchBrief: (patch: Partial<ResearchDoneData>) => void;
  setUserNotes: (notes: string) => void;
  resetResearch: () => void;
  updateEditableSegment: (segNum: number, field: string, value: string) => void;
  toggleStoryboardSegment: (segNum: number) => void;
  reset: () => void;
}

const initialState: ChronicleState = {
  sessionId: null,
  status: "idle",
  eraStyle: null,
  topic: "",
  documentaryTitle: null,
  researchBrief: null,
  documentarySegments: [],
  editableSegments: [],
  characterReferenceImages: [],
  characterCollageB64: null,
  selectedStoryboardSegments: new Set<number>(),
  mediaSegments: [],
  clipsStarted: {},
  videoClips: [],
  assemblyPercent: 0,
  assemblyStage: "",
  finalVideoUrl: null,
  transcript: null,
  agentActivity: "",
  userNotes: "",
  pipelineLog: [],
  error: null,
  errorRecoverable: false,
  isAutonomous: false,
};

export const useChronicleStore = create<ChronicleState & ChronicleActions>()(
  (set) => ({
    ...initialState,

    setStatus: (status) => set({ status }),
    setSessionId: (sessionId) => set({ sessionId }),
    setTopic: (topic) => set({ topic }),
    setIsAutonomous: (isAutonomous) => set({ isAutonomous }),

    handlePipelineStatus: (data) =>
      set((state) => {
        // For rate_limited (system) step: update the last entry's message
        // instead of appending, so the countdown ticks in place
        const lastEntry = state.pipelineLog[state.pipelineLog.length - 1];
        const isCountdownUpdate =
          data.stage === "system" &&
          data.step === "rate_limited" &&
          lastEntry?.stage === "system" &&
          lastEntry?.step === "rate_limited";

        let pipelineLog: PipelineLogEntry[];
        if (isCountdownUpdate) {
          pipelineLog = [
            ...state.pipelineLog.slice(0, -1),
            { ...lastEntry, message: data.message },
          ];
        } else {
          pipelineLog = [
            ...state.pipelineLog,
            {
              id: ++_pipelineLogCounter,
              stage: data.stage,
              step: data.step,
              attempt: data.attempt,
              message: data.message,
              issues: data.issues,
            },
          ];
        }

        const status = deriveStatusFromPipelineEvent(state.status, state.isAutonomous, data);

        return { agentActivity: data.message, pipelineLog, status };
      }),

    handleResearchDone: (data) =>
      set((state) => ({
        researchBrief: data,
        eraStyle: data.era_style,
        // In autonomous mode, we skip the review pause and move straight to character discovery
        status: state.isAutonomous ? "generating_characters" : "awaiting_narrative",
      })),

    handleResearchValidationPass: () =>
      set({ status: "narrating" }),

    handleScriptDone: (data) =>
      set({
        documentarySegments: data.segments,
        documentaryTitle: data.documentary_title ?? null,
        eraStyle: data.era_style,
        status: "narrating",
      }),

    handleNarrativeReady: (data) =>
      set((state) => ({
        documentaryTitle: data.documentary_title,
        documentarySegments: data.segments.map((segment) => ({
          segment_number: segment.segment_number,
          segment_title: segment.segment_title,
          visual_purpose: segment.visual_purpose,
          emotional_beat: segment.emotional_beat,
        })),
        editableSegments: data.segments,
        selectedStoryboardSegments: new Set(data.segments.map((s) => s.segment_number)),
        // In autonomous mode, jump straight to storyboard generation (media agent)
        status: state.isAutonomous ? "generating_media" : "awaiting_storyboard",
      })),

    handleCharacterReferencesReady: (data) =>
      set({
        characterReferenceImages: data.character_reference_images,
        characterCollageB64: data.character_collage_b64 ?? null,
      }),

    handleStoryboardReady: () =>
      set((state) => ({ 
        status: state.isAutonomous ? "generating_video" : "awaiting_video" 
      })),

    handleSegmentMediaDone: (segment) =>
      set((state) => ({
        mediaSegments: (() => {
          const existing = state.mediaSegments.findIndex(
            (ms) => ms.segment_number === segment.segment_number,
          );
          if (existing >= 0) {
            const updated = [...state.mediaSegments];
            updated[existing] = segment;
            return updated;
          }
          return [...state.mediaSegments, segment];
        })(),
        status: "generating_media",
      })),

    updateMediaSegment: (segment) =>
      set((state) => {
        const existing = state.mediaSegments.findIndex(
          (ms) => ms.segment_number === segment.segment_number,
        );
        if (existing >= 0) {
          const updated = [...state.mediaSegments];
          updated[existing] = segment;
          return { mediaSegments: updated };
        }
        return { mediaSegments: [...state.mediaSegments, segment] };
      }),

    handleClipStarted: (data) =>
      set((state) => ({
        clipsStarted: { ...state.clipsStarted, [data.window_index]: data },
        status: "generating_video",
      })),

    handleClipDone: (clip) =>
      set((state) => ({
        videoClips: [...state.videoClips, clip],
        status: "generating_video",
      })),

    handleAssemblyProgress: (percent, stage) =>
      set({
        assemblyPercent: typeof percent === "number" ? percent : 0,
        assemblyStage: typeof stage === "string" ? stage : "",
        status: "assembling",
      }),

    handleDocumentaryComplete: (data) =>
      set({
        finalVideoUrl: data.final_video_url,
        transcript: data.transcript,
        status: "complete",
      }),

    handleError: (message, recoverable = false) =>
      set({
        error: typeof message === "string" ? message : "Unknown error",
        errorRecoverable: !!recoverable,
        status: "error",
      }),

    updateResearchBrief: (patch) =>
      set((state) => ({
        researchBrief: state.researchBrief ? { ...state.researchBrief, ...patch } : null,
      })),

    setUserNotes: (notes) => set({ userNotes: notes }),

    resetResearch: () =>
      set((state) => ({
        researchBrief: null,
        eraStyle: null,
        pipelineLog: [],
        agentActivity: "",
        userNotes: "",
        error: null,
        errorRecoverable: false,
        status: "researching",
        // preserve session identity and topic
        sessionId: state.sessionId,
        topic: state.topic,
      })),

    updateEditableSegment: (segNum, field, value) =>
      set((state) => ({
        editableSegments: state.editableSegments.map((seg) =>
          seg.segment_number === segNum ? { ...seg, [field]: value } : seg,
        ),
      })),

    toggleStoryboardSegment: (segNum) =>
      set((state) => {
        const next = new Set(state.selectedStoryboardSegments);
        if (next.has(segNum)) {
          next.delete(segNum);
        } else {
          next.add(segNum);
        }
        return { selectedStoryboardSegments: next };
      }),

    reset: () => set(initialState),
  })
);
