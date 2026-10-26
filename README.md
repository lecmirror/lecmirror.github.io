# LecMirror Web

Public React/Vite annotator portal deployed at `https://lecmirror.github.io`.

Every authenticated user can upload a pre-lecture PDF, edit the lecture name (defaulting to the filename), monitor the pipeline, view pre/post reports, and label every feedback item for lectures they own or were assigned. Administrators can see all lectures, retry failures, and grant labeler access.

The browser uploads PDFs directly to Cloudflare R2 using short-lived presigned write URLs. Files of 100 MiB or more use 16 MiB multipart chunks with per-part retry. When `VITE_R2_PUBLIC_BASE_URL` is configured, PDFs and generated images use direct public read URLs; otherwise the app falls back to ten-minute signed reads. Final feedback is loaded directly from Supabase JSONB. Supabase Storage is not used.

## Local development

1. Copy `.env.example` to `.env` and set the Supabase URL and publishable key.
2. Run `pnpm install` and `pnpm dev`.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may enter the browser bundle. Supabase service credentials and Cloudflare credentials must never be placed in GitHub Pages variables.
