# ARFab SaaS + Revit Plugin Design

**Date:** 2026-02-23

---

## Goal

Transform ARFab from a single-tenant tool into a multi-tenant SaaS product with company accounts, subscription billing, and a Revit plugin that lets engineers upload directly from Revit and place QR codes on sheets.

---

## Two-Phase Plan

### Phase 1 — SaaS Web App
Auth, company accounts, pricing, and Stripe billing added to the existing Next.js app.

### Phase 2 — Revit Plugin
C# plugin for Revit 2024/2025/2026 that exports GLB + IFC, uploads to ARFab, and places QR codes on Revit sheets.

---

## Phase 1: SaaS Web App

### Architecture

**Auth:** Supabase Auth (email + password). Session managed via Supabase client.

**Multi-tenancy:** Each company has one row in a `companies` table. Users belong to one company via `company_id` on their profile. All models are scoped to a company — users only see their company's models.

**Billing:** Stripe Checkout for plan selection. Stripe webhooks update the company's `plan` and `subscription_status` in Supabase.

### Database Schema (additions)

```sql
-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',          -- 'free' | 'pro' | 'enterprise'
  subscription_status TEXT DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  company_id UUID REFERENCES companies(id),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Models get company_id
ALTER TABLE models ADD COLUMN company_id UUID REFERENCES companies(id);
```

### Pages (additions)

| Page | Description |
|------|-------------|
| `/` | Marketing landing page with pricing section |
| `/pricing` | Pricing plans (Free, Pro, Enterprise) |
| `/signup` | Create account + company name |
| `/login` | Email + password login |
| `/dashboard` | Existing dashboard, scoped to company models |
| `/api/stripe/checkout` | Create Stripe Checkout session |
| `/api/stripe/webhook` | Handle Stripe subscription events |

### Plans

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0 | 5 models, no Revit plugin |
| Pro | $99/month | Unlimited models, Revit plugin access |
| Enterprise | Custom | Custom limits, SSO, priority support |

### Auth Flow

1. User visits `/signup`
2. Enters name, company name, email, password
3. Supabase Auth creates user
4. App creates `companies` row + `profiles` row
5. User redirected to `/pricing` to choose a plan
6. Stripe Checkout completes → webhook updates company plan
7. User can now access full dashboard + Revit plugin API key

### RLS Policies

All models, uploads, and data scoped to `company_id` via Supabase Row Level Security. Users can only read/write rows where `company_id` matches their profile.

---

## Phase 2: Revit Plugin

### Architecture

```
ARFab.Revit.Plugin (C# Solution)
├── ARFab.Plugin.Core          — shared logic (export, upload, QR placement)
├── ARFab.Plugin.Revit2024     — targets net48, references Revit 2024 API
├── ARFab.Plugin.Revit2025     — targets net48, references Revit 2025 API
├── ARFab.Plugin.Revit2026     — targets net8,  references Revit 2026 API
└── ARFab.Plugin.Installer     — WiX MSI installer
```

**Bundled:** `FBX2glTF.exe` for FBX → GLB conversion.

### User Workflow

1. Click **ARFab** button in Revit ribbon
2. Log in with ARFab email + password (stored securely in Windows Credential Manager)
3. Pick a **3D view** from dropdown
4. Enter a **model name** (pre-filled from view name)
5. Click **Upload** — plugin:
   - Exports view to FBX (Revit API)
   - Converts FBX → GLB (FBX2glTF.exe)
   - Exports IFC (Revit API)
   - POSTs both to `/api/upload`
6. Pick a **sheet** for QR placement
7. Click **Place QR** — QR image appears on sheet

### Data Flow

```
Revit → FBX (Revit API) → FBX2glTF.exe → GLB
Revit → IFC (Revit API)
GLB + IFC → POST /api/upload → { id, annotations[] }
QR URL: https://app.arfab.io/model/{id}
QR PNG → ImageInstance.Create() on selected sheet
```

### Configuration

```
C:\ProgramData\ARFab\config.json
{
  "apiUrl": "https://app.arfab.io"
}
```

Set during MSI install. Supports self-hosted instances.

### MSI Installer

- Detects installed Revit versions (2024/2025/2026)
- Installs correct DLL + `.addin` manifest per version
- Installs `FBX2glTF.exe` to `C:\ProgramData\ARFab\`
- Prompts for ARFab URL during install

---

## Success Criteria

### Phase 1
- [ ] User can sign up, create a company, and choose a plan
- [ ] Stripe billing works end-to-end
- [ ] Models are scoped to company — users cannot see other companies' models
- [ ] Free plan limits enforced (5 models)
- [ ] Existing upload + AR viewer flow unchanged

### Phase 2
- [ ] Plugin installs cleanly on Revit 2024, 2025, 2026
- [ ] Login works from inside Revit
- [ ] GLB + IFC export and upload completes successfully
- [ ] QR code placed correctly on selected sheet
- [ ] Temp files cleaned up after upload
