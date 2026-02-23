# ARFab

ARFab lets construction fabricators upload 3D models (GLB format) and generate QR codes for augmented reality viewing directly in mobile browsers — no app install required.

Scan a QR code on a job site, open the link in Chrome or Safari, and tap the AR button to overlay the model in the real world.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database + Storage**: Supabase (PostgreSQL + object storage)
- **AR Viewer**: [`<model-viewer>`](https://modelviewer.dev/) web component
- **QR Codes**: `qrcode` npm package
- **Deploy Target**: Vercel

---

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- A [Supabase](https://supabase.com) account (free tier works)
- Git

---

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd arfab
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the `arfab/` project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

See the **Environment Variables** section below for details on each variable.

### 4. Set up Supabase

Follow the [Supabase Setup](#supabase-setup) section below.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL, found in Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key, found in Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key — used server-side only for uploads; keep secret |
| `NEXT_PUBLIC_BASE_URL` | Base URL for QR code generation. Use `http://localhost:3000` for local dev, your Vercel URL in production |

> `NEXT_PUBLIC_` variables are exposed to the browser. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed client-side.

---

## Supabase Setup

### 1. Create a new Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and note your project URL and API keys.

### 2. Create the `models` table

In the Supabase dashboard, go to **SQL Editor** and run:

```sql
CREATE TABLE models (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3. Create the storage bucket

In the Supabase dashboard, go to **Storage** and create a new bucket:

- **Name**: `models`
- **Public**: enabled (so model URLs are accessible without authentication)

Or run via SQL:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', true);
```

### 4. Set Row Level Security (RLS) policies

ARFab MVP has no authentication — all models are publicly readable and anyone can upload. Enable RLS and add the following policies:

```sql
-- Enable RLS on the models table
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read models
CREATE POLICY "Public read access"
  ON models FOR SELECT
  USING (true);

-- Allow anyone to insert models (service role is used server-side)
CREATE POLICY "Public insert access"
  ON models FOR INSERT
  WITH CHECK (true);
```

For storage, allow public access to the `models` bucket objects:

```sql
-- Allow public read of storage objects in the models bucket
CREATE POLICY "Public read storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'models');

-- Allow authenticated and anon insert (uploads go through service role in API route)
CREATE POLICY "Allow uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'models');
```

---

## Project Structure

```
arfab/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/route.ts       # POST: upload GLB, save metadata
│   │   │   └── models/route.ts       # GET: list all models
│   │   ├── (pages)/
│   │   │   ├── dashboard/page.tsx    # Model list with QR codes
│   │   │   └── model/[id]/page.tsx   # AR viewer page
│   │   ├── page.tsx                  # Upload page (home)
│   │   └── layout.tsx
│   ├── components/                   # Shared UI components
│   ├── lib/
│   │   └── supabase.ts               # Supabase client setup
│   ├── types/                        # TypeScript type definitions
│   └── styles/
├── docs/
│   └── revit-export-guide.md         # How to export GLB from Revit 2025
├── .env.local                        # Local environment variables (not committed)
└── package.json
```

---

## Usage

### Upload a model

1. Open the app at `http://localhost:3000`
2. Enter a name for your model
3. Select a GLB file using the file picker
4. Click **Upload** — the app stores the file in Supabase and generates a QR code
5. Download or print the QR code

### View in AR

1. Scan the QR code with a mobile device
2. The link opens the model viewer page in the browser
3. Tap the **AR** button in the viewer to launch AR mode
4. Point your camera at a flat surface to place the model

AR is supported on:
- **Android**: Chrome 81+ with ARCore
- **iOS**: Safari 15+ with QuickLook (iOS 12+)

### Dashboard

Go to `/dashboard` to see all uploaded models, preview their QR codes, and download them for printing.

---

## Deploying to Vercel

### 1. Push your code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Import the project in Vercel

1. Go to [vercel.com](https://vercel.com) and log in
2. Click **Add New Project** and import your GitHub repository
3. Set the **Root Directory** to `arfab` (the Next.js project root)
4. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_BASE_URL` — set this to your Vercel deployment URL (e.g., `https://arfab.vercel.app`)
5. Click **Deploy**

Vercel automatically rebuilds and redeploys on every push to `main`.

---

## Supported File Formats

ARFab supports **GLB and GLTF** files only. These are the web-native 3D formats supported by `<model-viewer>`.

For Revit users, see [docs/revit-export-guide.md](./docs/revit-export-guide.md) for export instructions.

---

## License

MIT
