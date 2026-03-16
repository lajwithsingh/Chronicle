# Deploy Chronicle to Google Cloud

This project is set up to deploy to Google Cloud Run with:

- `chronicle-backend` for FastAPI
- `chronicle-frontend` for Next.js
- Firestore for session state
- Google Cloud Storage for generated assets

## 1. Prerequisites

Make sure you are targeting the right project:

```powershell
gcloud config set project YOUR_PROJECT_ID
```

Enable required APIs:

```powershell
gcloud services enable run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  aiplatform.googleapis.com `
  firestore.googleapis.com `
  storage.googleapis.com `
  texttospeech.googleapis.com
```

## 2. Firestore

Create Firestore once if it does not already exist:

1. Open Firestore in Google Cloud Console
2. Create database
3. Use Native mode
4. Pick the same region as deployment, ideally `us-central1`

## 3. Bucket

Create the asset bucket once if it does not already exist. Choose any unique name — GCS bucket names are globally unique across all Google Cloud projects:

```powershell
gcloud storage buckets create gs://YOUR_BUCKET_NAME `
  --project=YOUR_PROJECT_ID `
  --location=us-central1
```

You will pass this name to the deploy command in step 6 using `--substitutions=_GCS_BUCKET=YOUR_BUCKET_NAME`.

## 4. Cloud Build Service Account Permissions

The Cloud Build service account needs permission to build and deploy.

Minimum practical roles:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/storage.admin` or a narrower bucket role
- `roles/artifactregistry.writer`

The Cloud Run runtime service account should have:

- `roles/aiplatform.user`
- `roles/datastore.user`
- `roles/storage.admin` or a narrower bucket role
- `roles/texttospeech.user`

## 5. Optional Secrets

If you want Google Knowledge Graph lookups in production, create a Secret Manager secret for `KNOWLEDGE_GRAPH_API_KEY` and attach it to the backend service after first deploy.

## 6. Deploy

Run the build, passing your bucket name from step 3:

```powershell
gcloud builds submit --config deploy/cloudbuild.yaml . `
  --substitutions=_GCS_BUCKET=YOUR_BUCKET_NAME
```

This pipeline will:

1. Build and deploy the backend
2. Read the real backend Cloud Run URL
3. Build the frontend using that backend URL
4. Deploy the frontend with matching runtime env vars

## 7. Verify

Check backend health:

```powershell
Invoke-RestMethod https://chronicle-backend-<hash>-uc.a.run.app/health
```

Open the frontend:

```text
https://chronicle-frontend-<hash>-uc.a.run.app
```

What to verify:

- `/health` reports Firestore `ok`
- storyboard images upload to `chronicle-output`
- generated clips appear in the same bucket
- frontend can stream pipeline events from backend

## 8. Optional Post-Deploy Secret Update

If you created a Knowledge Graph API secret, bind it like this:

```powershell
gcloud run services update chronicle-backend `
  --region=us-central1 `
  --update-secrets=KNOWLEDGE_GRAPH_API_KEY=KNOWLEDGE_GRAPH_API_KEY:latest
```
