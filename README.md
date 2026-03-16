# Chronicle

Chronicle is an AI documentary pipeline that turns a single topic into a research-backed, narrated, visually consistent film.

Instead of treating research, writing, image generation, video generation, and editing as separate tools, Chronicle orchestrates them as one connected workflow. The core problem it solves is continuity: making multiple short AI-generated clips feel like one coherent documentary.

## What Chronicle does

Given a topic, Chronicle:

- researches the event and its key figures
- studies the era to ground visuals in the right architecture, clothing, and technology
- creates character references
- writes a documentary-style story and narration
- generates storyboard images
- turns storyboard scenes into short video clips
- assembles clips and narration into a final documentary

## Core workflow

Chronicle runs as a multi-agent pipeline:

1. `Research Agent`
2. `EraResearch Agent`
3. `Research Validator`
4. `Reference Agent`
5. `Narrative Agent`
6. `Narrative Validator`
7. `Interleaved Media Agent`
8. `Video Agent`
9. `Assembly Agent`

## Repository structure

```text
├── backend/
│   ├── main.py                         FastAPI app entry point, CORS, router registration
│   ├── requirements.txt                Python dependencies
│   ├── .env.example                    Environment variable template
│   │
│   ├── agents/
│   │   ├── agent.py                    ChronicleOrchestrator — root CustomAgent, full pipeline loop
│   │   ├── research_agent.py           LlmAgent that uses Google Search to gather historical sources
│   │   ├── research_validator.py       LlmAgent that fact-checks dates, figures, and sensory details
│   │   ├── era_research_agent.py       LlmAgent that researches era-specific visual and cultural context
│   │   ├── reference_agent.py          LlmAgent that builds character and location visual references
│   │   ├── narrative_agent.py          LlmAgent that writes documentary story and narration script
│   │   ├── narrative_validator.py      LlmAgent that checks narration quality and Veo prompt fitness
│   │   ├── media_agent.py              Gemini 2.5 Flash Image multi-turn agent for storyboard generation
│   │   ├── video_agent.py              Veo 3.1 agent — scene-by-scene video with last-frame continuity
│   │   └── assembly_agent.py           FFmpeg pipeline — merges clips, narration, LUT grading, captions
│   │
│   ├── chronicle/
│   │   └── agent.py                    ADK root agent registration entry point
│   │
│   ├── api/
│   │   └── routes.py                   FastAPI routes — session creation, SSE streaming bridge
│   │
│   ├── tools/
│   │   ├── veo_tool.py                 Veo 3.1 async generation, polling, last-frame extraction
│   │   ├── gcs_tool.py                 GCS upload, download, signed URL helpers
│   │   ├── tts_tool.py                 Gemini TTS narration synthesis (voice: Kore)
│   │   └── assembly_tool.py            process_clip() and assemble_documentary() using FFmpeg + moviepy
│   │
│   ├── models/
│   │   └── schemas.py                  Pydantic models — NarrativeOutput, ResearchValidationResult, etc.
│   │
│   ├── prompts/
│   │   ├── style_bible.py              Era-specific Style Bibles injected into Narrative Agent context
│   │   └── visual_styles.py            Visual style definitions for storyboard and video generation
│   │
│   ├── config/
│   │   ├── settings.py                 pydantic-settings env config
│   │   └── genai_client.py             Shared Gemini / Vertex AI client initialisation
│   │
│   ├── services/
│   │   └── persistence.py              Firestore session persistence helpers
│   │
│   └── assets/
│       └── luts/                       Colour grading LUT .cube files (cinematic, warm, cool)
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                  Root layout, global font and metadata
│   │   ├── globals.css                 Tailwind base styles and CSS variables
│   │   ├── page.tsx                    Home page — topic entry
│   │   └── chronicle/[sessionId]/
│   │       └── page.tsx                Live generation view for a session
│   │
│   ├── components/
│   │   ├── chronicle/
│   │   │   ├── ChronicleStream.tsx     Main stream layout — sidebar pipeline + tab content
│   │   │   ├── ResearchPipeline.tsx    Animated agent progress cards during research phase
│   │   │   ├── ResearchCard.tsx        Research brief display with inline editing and Era Intelligence modal
│   │   │   ├── NarrativeActs.tsx       Story acts display with act-by-act reveal
│   │   │   ├── NarrativeReview.tsx     Narrative review and approval panel
│   │   │   ├── CharacterPipeline.tsx   Character reference generation progress
│   │   │   ├── StoryboardReview.tsx    Storyboard image review panel
│   │   │   ├── StorySegment.tsx        Single story segment — narration + storyboard + video
│   │   │   ├── StorySegmentList.tsx    Ordered list of all story segments
│   │   │   ├── VideoClipProgress.tsx   Per-clip video generation progress indicator
│   │   │   ├── VideoClipPreview.tsx    Inline video clip player during generation
│   │   │   └── FinalPlayer.tsx         Final assembled documentary player
│   │   │
│   │   ├── ui/
│   │   │   ├── TopicInput.tsx          Animated topic entry input on the home page
│   │   │   ├── MosaicInput.tsx         Mosaic-style input variant
│   │   │   ├── AdvancedControls.tsx    Optional generation parameter controls
│   │   │   └── LoadingOrb.tsx          Animated loading indicator
│   │   │
│   │   └── shared/
│   │       ├── Navbar.tsx              Top navigation bar
│   │       └── Footer.tsx              Page footer
│   │
│   ├── hooks/
│   │   ├── useChronicleSSE.ts          EventSource SSE consumer — dispatches events to Zustand store
│   │   ├── useChronicleStore.ts        Zustand global state — pipeline log, research brief, segments
│   │   └── useVideoPlayer.ts           Video playback controls hook
│   │
│   ├── lib/
│   │   ├── types.ts                    Shared TypeScript types for pipeline and segment data
│   │   ├── api.ts                      API client helpers — session creation, restart
│   │   └── sse.ts                      SSE connection utilities
│   │
│   ├── next.config.ts                  Next.js config — backend proxy rewrites
│   ├── tailwind.config.ts              Tailwind theme — Chronicle colour palette and typography
│   └── package.json                    Frontend dependencies
│
├── deploy/
│   ├── cloudbuild.yaml                 Cloud Build pipeline — build, push, deploy backend + frontend
│   ├── Dockerfile.backend              Backend container — python:3.12-slim + FFmpeg
│   ├── Dockerfile.frontend             Frontend container — Node build + Nginx serve
│   ├── DEPLOY_GCP.md                   Step-by-step Cloud deployment guide
│   └── README.md                       Deployment overview for judges and reviewers
│
├── docker-compose.yml                  Local development stack — backend + frontend together
├── .gitignore                          Excludes secrets, build artefacts, and media outputs
└── .gcloudignore                       Excludes local files from Cloud Build upload
```

## Tech stack

- Backend: Python, FastAPI
- Frontend: Next.js, React, TypeScript, Zustand, Framer Motion
- AI / media: Gemini, Veo 3.1, Google Text-to-Speech
- Cloud: Cloud Run, Cloud Build, Firestore, Google Cloud Storage, Vertex AI

## Requirements

### Local development

You will need:

- Python 3.11+
- Node.js 20+
- Google Cloud SDK (`gcloud`)
- a Google Cloud project with the required APIs enabled
- FFmpeg available either through `imageio-ffmpeg` or a system install

### Google Cloud services used

Chronicle expects these services at the project level:

- Cloud Run
- Cloud Build
- Artifact Registry
- Vertex AI
- Cloud Storage
- Firestore
- Cloud Text-to-Speech

Optional:

- Knowledge Graph Search API

## Configuration

Chronicle reads its backend configuration from:

- [`backend/.env.example`](backend/.env.example)

Create a local file at:

- `backend/.env`

and populate it with your own project values.

### Minimum important values

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=1
GCS_BUCKET=your-gcs-bucket-name
FIRESTORE_COLLECTION=your_firestore_collection
FIRESTORE_REQUIRED=true
```

Optional values:

- `GOOGLE_API_KEY`
- `KNOWLEDGE_GRAPH_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` if you are using a local service-account JSON instead of ADC

## Running Chronicle locally

> **Windows users:** use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or Git Bash so the commands below work as written. If you prefer native PowerShell, replace `source venv/bin/activate` with `.\venv\Scripts\Activate.ps1` and replace `export VAR=value` with `$env:VAR="value"`.

### 1. Authenticate with Google Cloud

For local development, the simplest path is Application Default Credentials:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### 2. Make sure cloud resources exist

Before starting locally, make sure your Google Cloud project already has:

- a Firestore database
- a Cloud Storage bucket matching `GCS_BUCKET`
- Vertex AI enabled

### 3. Install backend dependencies

From the project root:

```bash
# Linux / macOS / WSL / Git Bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

```powershell
# Windows PowerShell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Run the backend

From the project root:

```bash
# Linux / macOS / WSL / Git Bash
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

Backend health endpoint:

- [http://localhost:8080/health](http://localhost:8080/health)

### 6. Run the frontend

In a second terminal:

```bash
# Linux / macOS / WSL / Git Bash
cd frontend
export BACKEND_URL="http://localhost:8080"
export NEXT_PUBLIC_BACKEND_URL="http://localhost:8080"
npm run dev
```

```powershell
# Windows PowerShell
cd frontend
$env:BACKEND_URL="http://localhost:8080"
$env:NEXT_PUBLIC_BACKEND_URL="http://localhost:8080"
npm run dev
```

Frontend:

- [http://localhost:3000](http://localhost:3000)

## Local verification checklist

Before trying a full generation flow, check:

1. `GET /health` returns `status: ok`
2. Firestore reports `ok`
3. GCS reports `ok`
4. the frontend loads and can start a session

If `/health` reports a degraded GCS or Firestore service, fix the cloud configuration first before testing the full pipeline.

## Deploying to Google Cloud

Chronicle includes an automated Cloud Build deployment pipeline.

### Deployment assets

- [`deploy/cloudbuild.yaml`](deploy/cloudbuild.yaml)
- [`deploy/DEPLOY_GCP.md`](deploy/DEPLOY_GCP.md)
- [`deploy/README.md`](deploy/README.md)

### What the deployment pipeline does

The Cloud Build config:

- builds the backend container
- deploys the backend to Cloud Run
- resolves the live backend URL
- builds the frontend against that backend URL
- deploys the frontend to Cloud Run

### Cloud deployment prerequisites

Before deploying, make sure your Google Cloud project has:

- required APIs enabled
- a Firestore database created
- a Cloud Storage bucket created
- Cloud Build permissions to build and deploy
- a Cloud Run runtime service account with access to:
  - Vertex AI
  - Firestore
  - Cloud Storage
  - Text-to-Speech if you want Cloud TTS fallback

If you use Knowledge Graph lookups in production, provide that API key through a secret or environment variable rather than committing it to the repository.

### Deploy command

From the project root:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud builds submit --config deploy/cloudbuild.yaml . \
  --substitutions=_GCS_BUCKET=YOUR_BUCKET_NAME
```

### Verify the deployment

After deployment:

```bash
gcloud run services list --region us-central1
```

Get the backend URL:

```bash
gcloud run services describe chronicle-backend --region us-central1 --format="value(status.url)"
```

Check health:

```bash
curl https://YOUR_BACKEND_URL/health
```

You want all major services to report `ok`.

## Notes for judges and reviewers

- Chronicle can run locally against real Google Cloud services.
- Chronicle can also be deployed end to end on Google Cloud Run using the included Cloud Build config.
- The deployment automation lives in [`deploy/cloudbuild.yaml`](deploy/cloudbuild.yaml).

## Common issues

### Firestore is degraded

This usually means:

- Firestore has not been created in the project
- ADC is not configured correctly
- the runtime service account does not have Firestore access

### GCS is degraded

This usually means:

- the configured bucket name does not exist
- the runtime service account does not have access to the bucket

### Video generation fails locally

Check:

- Vertex AI is enabled
- your ADC login is correct
- FFmpeg is available
- the required bucket and Firestore database exist

## Security notes

- Do not commit real `.env` files
- Do not commit API keys or service-account JSON files
- Keep only example configuration in [`backend/.env.example`](backend/.env.example)

## License

This repository is provided for hackathon demonstration and evaluation.
