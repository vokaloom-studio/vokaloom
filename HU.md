# HU.md — Vokaloom Studio Agile Backlog & Mobile-First Execution Spec

- **Project:** `vokaloom-studio`
- **License:** **MIT License** (100% Commercial & Service-Safe)
- **Primary User & Mode:** Solo Content Producer / AI Model Operator (Mobile-First PWA + Desktop)
- **Target Timeline:** 1-Week Sprint (5 Working Days — Solo Developer)
- **Business Model:** Daily Content Fulfillment Workstation to eliminate paid subscriptions & save hours, with an optional $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Pro Pass / Client Access Gate

---

## 1. Executive Summary, Workflow & Unit Economics

`vokaloom-studio` unifies vertical background discovery, subject placement, and realistic voiceover synthesis into a single installable Progressive Web App (PWA). It is engineered under the **MIT License** using exclusively commercially permissive components (`shadcn/ui`, Pexels/Unsplash APIs, `gemini-2.5-flash`, and Apache-2.0/MIT TTS models `Kokoro-82M` and `F5-TTS`).

### Validated Daily Workflow
1. **Mobile-First Context:** Operates primarily **from a mobile phone on the move** (`9:16` vertical format for Reels, TikTok, and Stories), while supporting desktop browsers.
2. **Primary Bottleneck (#1 Time-Waster):** Manually searching Instagram and the web for real, candid vertical backgrounds where the creator can **place/replace their consistent brand model** (*"fondos reales para reemplazar con mi modelo"*).
3. **Output Preference:** Delivers batches of **5 or 15 real vertical (`9:16`) backgrounds** downloadable in **one single `.ZIP` pack**, plus optional 1-click AI Model-in-Scene placement.
4. **Audio Bottleneck:** Needs **Zero-Shot Character/Creator Voice Cloning** using **existing WhatsApp voice notes (`.ogg` / `.mp3` / `.wav`)** so a digital model or brand character speaks Spanish and English scripts consistently without paying ElevenLabs subscription prices.

### Cost & Profit Model per $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Pass
$$
\text{Monthly Compute Cost} = \$0.00\text{ (Hosting)} + \$0.00\text{ (Stock APIs)} + \$0.45\text{ (150 TTS Runs)} = \$0.45\text{ USD}
$$
$$
\text{Net Margin} = \frac{\$15.00 - \$0.45}{\$15.00} \times 100 = 97.0\%
$$

---

## 2. Formal Agile Backlog — User Stories (HU) & Acceptance Criteria (CA)

### **HU-01: Mobile-First Unified Studio Shell, PWA Installability & Operator/Client Quota Guard [MUST HAVE]**
> **As a** content producer or agency operator working primarily from my phone on the go (or on desktop),  
> **I want to** open a thumb-friendly web application (installable on my phone home screen or desktop as a standalone app) that tracks usage credits and supports instant Operator Mode access,  
> **So that** I can produce backgrounds and voiceovers without limits for my daily work while gating external clients behind a trial counter.

#### **Acceptance Criteria (CA):**
- **CA-01.1 (Unified 2-Tab Layout & Mobile-First Ergonomics):** Built with `shadcn/ui` (`Tabs`, `Card`, `Badge`). Top header displays the brand (`Vokaloom Studio`), active mode badge (`Trial: 3 Credits`, `Pro Pass`, or `Operator Mode`), and switches instantly between **"1. Aesthetic Backgrounds"** and **"2. Realistic Voice Studio"**. All primary controls (vibe chips, generate button, download `.ZIP`, voice clone uploader, and audio player) are reachable with one thumb on mobile viewports (`360px–430px`) with zero horizontal overflow.
- **CA-01.2 (Mobile & Desktop PWA Installability):** Configured via `src/app/manifest.ts` with `display: "standalone"` and portrait orientation so Android, iOS, and desktop browsers (Ubuntu, Windows, macOS) allow 1-click **"Install Vokaloom Studio"** without Electron bloat.
- **CA-01.3 (Dual-Mode Quota Guard & Frictionless Operator Mode):** Guest users start with $3$ free image batches and $3$ free audio generations. Supports 1-click invite link activation (`/?key=...`) verified server-side via `/api/admin` as well as entering an Operator Master Key or activating a Pro Pass to unlock unlimited daily fulfillment.

---

### **HU-02: Vertical 9:16 Aesthetic Background Batch Engine & 1-Click .ZIP Exporter [MUST HAVE]**
> **As a** mobile social media creator,  
> **I want to** tap a lifestyle/travel vibe or type a topic to get 5 or 15 real vertical (`9:16`) background photos—and download the whole batch as a single `.ZIP` file in one tap,  
> **So that** I stop wasting hours searching Instagram for real scenes and can download organic base layers in seconds.

#### **Acceptance Criteria (CA):**
- **CA-02.1 (Vibe Presets & `5x`/`15x` Batch Toggle):** Provides a keyword input, `5x Mobile Fast` / `15x Full Pack` segmented toggle (in both Inspector and Canvas header), and 5 instant preset chips: *Luxury Travel*, *Candid Lifestyle*, *Minimalist Cafe*, *Urban Street POV*, and *Nature Sunset*.
- **CA-02.2 (Strict `9:16` Vertical Real Photography & Batch Size Toggle):** Allows toggling between a fast **5-photo pack** (`batchSize: 5`) and a full **15-photo batch** (`batchSize: 15`). Clicking **"Generate 5/15 Backgrounds"** calls `/api/backgrounds`, queries Pexels and Unsplash APIs with portrait orientation ($9:16$ / $4:5$, plus deduplicated curated `9:16` vertical fallback), and excludes illustrations/3D renders.
- **CA-02.3 (Shuffle / Load More):** Clicking **"Shuffle"** increments the pagination page to deliver fresh, non-duplicate photos for the same aesthetic and batch size.
- **CA-02.4 (CORS-Safe Single-Photo & Batch `.ZIP` Export):** Users can download any single photo in HD ($1080\text{px}+$) or bundle the batch directly in the browser via `jszip` using the server-side image proxy (`/api/backgrounds?proxyUrl=...`) into a single `.zip` download with `README-ATTRIBUTION.txt` for CapCut, Canva, or mobile editing.

---

### **HU-03: Boss Reference Image Aesthetic Matcher & "Place My Model" Studio [MUST HAVE]**
> **As a** creator who receives scene references or places a consistent model into real backgrounds,  
> **I want to** drop a reference screenshot to automatically get matching real vertical backgrounds OR upload a photo of **my model** to composite my model into a selected background,  
> **So that** I can replicate a desired visual style immediately and get ready-to-post scenes without manual Photoshop work.

#### **Acceptance Criteria (CA):**
- **CA-03.1 (Scene Reference Dropzone & Vision Aesthetic Extraction):** Accepts `.jpg`, `.png`, or `.webp` reference images up to $5\text{ MB}$ with an instant thumbnail preview, extracts a concise 4-to-6 word English photographic aesthetic query via `gemini-2.5-flash` (e.g., `"warm sunset coastal balcony candid vertical"`), populates the search bar, and automatically fetches matching `9:16` backgrounds.
- **CA-03.2 ("My Model" Persistent Subject Placement via `/api/model-swap`):** Users can save a compressed **"My Model Reference"** portrait once in `localStorage` (`vokaloom_my_model_v1`) and click **"Place Model"** on any `9:16` card to call `/api/model-swap` (`gemini-2.5-flash-image` with fallback to `gemini-2.0-flash-exp-image-generation`, plus a client Canvas compositor fallback when offline/keyless) and download the resulting `9:16` composite in 1 click.

---

### **HU-04: Realistic AI Voiceover & Zero-Shot WhatsApp Voice Cloning Studio [MUST HAVE]**
> **As a** content creator managing a brand or character voice,  
> **I want to** paste a script, select a realistic Spanish or English voice—or upload a 10-to-20 second WhatsApp voice note—and generate natural speech in that voice,  
> **So that** my character or presenter has a consistent, realistic voice on every Reel without paying ElevenLabs subscription prices.

#### **Acceptance Criteria (CA):**
- **CA-04.1 (Script Editor, Voice Presets & WhatsApp `.OGG` Voice Sample Uploader):** Provides a `Textarea` with a live character counter (up to $1,500\text{ characters}$) and a `Select` menu of realistic Spanish (LatAm/Spain) and English neural voices. **"Clone Custom Voice"** defaults to expanded (`ON`) for 1-tap mobile access and accepts WhatsApp voice notes (`.ogg` / `audio/ogg` / `audio/opus`) alongside `.mp3`, `.wav`, and `.m4a` clips ($5\text{–}20\text{ seconds}$, up to `3 MB`).
- **CA-04.2 (Commercial-Safe MIT / Apache-2.0 Pipeline):** Calls `/api/voice` using MIT-licensed `F5-TTS` (via Fal.ai) for zero-shot voice cloning when a reference clip is uploaded, and Apache-2.0 `Kokoro-82M` / `Gemini 2.5 Neural TTS` (with a built-in zero-key WAV synthesis fallback during local dev) for instant Spanish and English preset voices in under $6\text{ seconds}$.
- **CA-04.3 (Mobile Audio Player, Download & Session History):** Renders a touch-friendly audio player with waveform scrubber, 1-click `.mp3` / `.wav` download, and persistent session history of the last $10$ generated clips.

---

### **HU-05: $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Monetization Gate, Encrypted API Key Vault & Protected `/admin` Control Center [MUST HAVE]**
> **As the** workspace owner and operator,  
> **I want** a $\$15\text{ USD}$ / $\$60,000\text{ COP}$ pass modal when guest credits run out, while isolating all administrative diagnostics, encrypted runtime API key management, access verification, and invite controls inside `/admin` and `/api/admin`,  
> **So that** the public studio (`/`) stays clean and key-safe while I can configure API keys from the browser, monetize access, inspect API health, and generate client invite links.

#### **Acceptance Criteria (CA):**
- **CA-05.1 (Paywall Trigger & Checkout / Key Unlock):** When a guest user reaches $0$ credits, attempting a generation opens a `shadcn/ui` `Dialog` showcasing the **Vokaloom Pro Pass ($\$15\text{ USD}$ / $\$60,000\text{ COP}$)** with checkout buttons (Wompi / Nequi / PSE & Stripe) and an **"Enter Access / Operator Key"** input that unlocks Pro/Operator mode immediately.
- **CA-05.2 (Zero Client Key Leakage & Clean Public Studio):** Public UI (`/`) removes all demo master key hints, debug buttons, and `"Reset Demo"` controls; access codes are verified server-side via `POST /api/admin` using constant-time `crypto.timingSafeEqual` and brute-force rate limiting (HTTP `429` after `5` failed `admin-login` attempts from the same IP in 10 minutes).
- **CA-05.3 (Encrypted Server-Side API Key Vault `vokaloom_vault_v1`):** `src/lib/server-secrets.ts` encrypts runtime keys (`GEMINI_API_KEY`, `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `FAL_KEY`) with `AES-256-GCM` inside an `HttpOnly`, `SameSite=Lax` cookie (`vokaloom_vault_v1`), persists updates to `.env.local` in local development, and resolves secrets exclusively server-side via `resolveApiKey(...)` while returning only masked previews (`XXXX••••YYYY`) to `/admin`.
- **CA-05.4 (Protected `/admin` Control Center & Bilingual Support):** Protected by `ADMIN_MASTER_KEY` with 5 control cards—(1) Engine Health Status, (2) Runtime API Keys Vault, (3) Commercial & Paywall Configuration, (4) Client Access Links & WhatsApp Invite Generator, and (5) Operator Sandbox & Device Controls—plus full English (`en`) and Spanish (`es`) UI/API localization across the entire studio.