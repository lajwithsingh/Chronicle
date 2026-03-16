# Reproducing Chronicle on Google Cloud

This guide covers everything a judge or reviewer needs to deploy Chronicle end-to-end from this repository into their own Google Cloud project.

---

## Prerequisites

Before you begin, make sure you have:

| Tool | Version | Notes |
|---|---|---|
| `gcloud` CLI | Latest | [Install guide](https://cloud.google.com/sdk/docs/install) |
| Docker | 20+ | Required for `gcloud builds submit` |
| A GCP project | — | Billing must be enabled |

Chronicle uses **Veo 3.1** and **Gemini 2.5 Flash Image**. Your GCP project must have access to these models through Vertex AI. Veo 3.1 is currently available in `us-central1` — do not change the region unless you have confirmed access elsewhere.

---

## Step 1 — Point gcloud at your project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

---

## Step 2 — Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  texttospeech.googleapis.com
```

---

## Step 3 — Create the Firestore database

Chronicle uses Firestore for ADK session state. Create it once:

1. Open [Firestore in Cloud Console](https://console.cloud.google.com/firestore)
2. Click **Create database**
3. Select **Native mode**
4. Choose region **us-central1**

---

## Step 4 — Create the GCS bucket

Chronicle stores generated clips and storyboard images here. GCS bucket names are globally unique across all Google Cloud projects, so choose your own name:

```bash
gcloud storage buckets create gs://YOUR_BUCKET_NAME \
  --project=YOUR_PROJECT_ID \
  --location=us-central1
```

You will pass this name to the deploy command in Step 7.

---

## Step 5 — Grant IAM roles

### Cloud Build service account

Find your Cloud Build service account in Cloud Console under **Cloud Build → Settings**, then grant:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/artifactregistry.writer`
- `roles/storage.admin`

### Cloud Run runtime service account

The default Compute service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) needs:

- `roles/aiplatform.user`
- `roles/datastore.user`
- `roles/storage.admin`
- `roles/texttospeech.user`

---

## Step 6 — (Optional) Knowledge Graph API key

If you want the Era Research step to use Google Knowledge Graph for richer era lookups, create a Secret Manager secret:

```bash
echo -n "YOUR_API_KEY" | gcloud secrets create KNOWLEDGE_GRAPH_API_KEY \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

Then bind it to the backend service after first deploy (see Step 8).

---

## Step 7 — Deploy

From the repository root, passing the bucket name you created in Step 4:

```bash
gcloud builds submit --config deploy/cloudbuild.yaml . \
  --substitutions=_GCS_BUCKET=YOUR_BUCKET_NAME
```

**What the pipeline does — in order:**

1. Builds and pushes the backend Docker image
2. Deploys backend to Cloud Run (`chronicle-backend`)
3. Resolves the live backend URL
4. Builds the frontend with that URL baked in as `NEXT_PUBLIC_BACKEND_URL`
5. Pushes and deploys frontend to Cloud Run (`chronicle-frontend`)

**Expected build time: 8–15 minutes.**

### Substitution defaults

| Variable | Default | Override if needed |
|---|---|---|
| `_REGION` | `us-central1` | Only if you have Veo 3.1 access elsewhere |
| `_BACKEND_SERVICE` | `chronicle-backend` | — |
| `_FRONTEND_SERVICE` | `chronicle-frontend` | — |
| `_GCS_BUCKET` | — | **Required** — pass your own bucket name |

---

## Step 8 — Verify the deployment

List both services:

```bash
gcloud run services list --region us-central1
```

Get the backend URL:

```bash
gcloud run services describe chronicle-backend \
  --region us-central1 \
  --format="value(status.url)"
```

Check health:

```bash
curl https://YOUR_BACKEND_URL/health
```

A healthy response looks like:

```json
{ "status": "ok", "firestore": "ok", "gcs": "ok" }
```

If Firestore or GCS is degraded, recheck the IAM roles from Step 5 before testing the full pipeline.

Get the frontend URL:

```bash
gcloud run services describe chronicle-frontend \
  --region us-central1 \
  --format="value(status.url)"
```

Open that URL in a browser, enter a topic, and Chronicle will stream the full pipeline live.

> **Generation time:** A single end-to-end documentary takes **25–30 minutes** to complete. The majority of this time is spent in image generation (Gemini 2.5 Flash Image) and video generation (Veo 3.1), which are sequential and cannot be parallelised beyond Chronicle's built-in concurrency settings. The frontend streams live progress for every step so you can follow along — the pipeline is not stalled if you see it running for an extended period.

---

## Step 9 — (Optional) Bind Knowledge Graph secret

If you created the secret in Step 6:

```bash
gcloud run services update chronicle-backend \
  --region=us-central1 \
  --update-secrets=KNOWLEDGE_GRAPH_API_KEY=KNOWLEDGE_GRAPH_API_KEY:latest
```

---

## Cost note

Chronicle calls Veo 3.1, Gemini 2.5 Flash Image, and Cloud TTS on every generation run. A single documentary generates multiple video clips and storyboard images. Review [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing) before running several test generations. Cloud Run, Cloud Build, Firestore, and GCS costs for evaluation purposes are minimal.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `gcs: degraded` in `/health` | Bucket does not exist or runtime SA lacks Storage access |
| `firestore: degraded` in `/health` | Firestore not created or runtime SA lacks Datastore access |
| Build fails on `deploy-backend` | Cloud Build SA missing `run.admin` or `iam.serviceAccountUser` |
| Video generation returns 403 | Runtime SA missing `aiplatform.user` |
| Frontend shows blank or CORS error | Backend URL not correctly resolved — check `resolve-backend-url` step in build logs |

Full setup walkthrough with screenshots: [DEPLOY_GCP.md](DEPLOY_GCP.md)
