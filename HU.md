# HU.md — Vokaloom Studio Agile Backlog & Phased Execution Plan

* **Project:** `vokaloom-studio`
* **License:** **MIT License** (100% Commercial & Service-Safe)
* **Target Timeline:** 1-Week Sprint (5 Working Days — Solo Developer)
* **Business Model:** Daily Content Fulfillment Workstation + $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Client Access / Service Gate

---

## 1. Executive Summary & Unit Economics

`vokaloom-studio` unifies aesthetic background discovery and realistic voiceover synthesis into a single installable Progressive Web App (PWA). It is engineered under the **MIT License** using exclusively commercially permissive components (`shadcn/ui`, Pexels/Unsplash APIs, Gemini 2.5 Flash Vision, and Apache-2.0/MIT TTS models `Kokoro-82M` and `F5-TTS`).

### Cost & Profit Model per $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Pass
$$
\text{Monthly Compute Cost} = \$0.00\text{ (Hosting)} + \$0.00\text{ (Stock APIs)} + \$0.45\text{ (150 TTS Runs)} = \$0.45\text{ USD}
$$
$$
\text{Net Margin} = \frac{\$15.00 - \$0.45}{\$15.00} \times 100 = 97.0\%
$$

---

## 2. Formal Agile Backlog — User Stories (HU) & Acceptance Criteria (CA)

### **HU-01: Unified Studio Shell, PWA Installability & Operator/Client Quota Guard [MUST HAVE]**
> **As a** content producer or agency operator,  
> **I want to** open a single web application (or install it locally as a desktop/mobile app) that tracks usage credits and supports an Operator Master Key,  
> **So that** I can use the tool without limits for my daily work while gating external clients behind a trial counter.

#### **Acceptance Criteria (CA):**
* **CA-01.1 (Unified 2-Tab Layout):** Built with `shadcn/ui` (`Tabs`, `Card`, `Badge`). Top header displays the brand (`Vokaloom Studio`), active mode badge (`Trial: 3 Credits`, `Pro Pass`, or `Operator Mode`), and switches instantly between **"1. Aesthetic Backgrounds"** and **"2. Realistic Voice Studio"**.
* **CA-01.2 (Local Installability via PWA):** Includes `src/app/manifest.ts` so desktop and mobile browsers (Ubuntu, Windows, macOS, Android, iOS) allow 1-click **"Install Vokaloom Studio"** as a standalone window without Electron bloat.
* **CA-01.3 (Dual-Mode Quota Guard):** Guest users start with $3$ free image batches and $3$ free audio generations. Entering the Operator Master Key (or activating a Pro Pass) unlocks unlimited daily fulfillment.

---

### **HU-02: One-Click 15-Batch Aesthetic Background Finder & ZIP Exporter [MUST HAVE]**
> **As a** social media creator,  
> **I want to** click a lifestyle/travel vibe or type a topic and receive 15 real, vertical background photos in one click,  
> **So that** I can download organic-looking base layers for Instagram posts in seconds.

#### **Acceptance Criteria (CA):**
* **CA-02.1 (Vibe Presets & Search Bar):** Provides a keyword input and 5 instant preset chips: *Luxury Travel*, *Candid Cafe POV*, *Minimalist Lifestyle*, *Moody Street*, and *Nature Escape*.
* **CA-02.2 (Batch of 15 Real Vertical Photos):** Clicking **"Fetch 15 Backgrounds"** calls `/api/backgrounds`, which enriches the query with candid photography modifiers, filters for portrait orientation ($9:16$ / $4:5$), and fetches $15$ real high-resolution photos from Pexels and Unsplash APIs.
* **CA-02.3 (Shuffle / Load 15 More):** Clicking **"Shuffle 15 More"** increments the pagination page to deliver $15$ fresh, non-duplicate photos for the same aesthetic.
* **CA-02.4 (Client-Side Batch ZIP Download):** Users can download any single photo in HD ($1080\text{px}+$) or click **"Download All 15 (.ZIP)"** to bundle all 15 photos directly in the browser via `jszip`.

---

### **HU-03: Boss Reference Image Aesthetic Matcher [MUST HAVE]**
> **As a** content creator who receives reference images from my boss,  
> **I want to** drop a reference screenshot into the app and automatically get 15 matching real background photos,  
> **So that** I can replicate my boss's desired visual style immediately.

#### **Acceptance Criteria (CA):**
* **CA-03.1 (Reference Image Dropzone):** Accepts `.jpg`, `.png`, or `.webp` reference images up to $5\text{ MB}$ with an instant thumbnail preview.
* **CA-03.2 (Vision Aesthetic Extraction):** Sends the image to `gemini-2.5-flash` to extract a concise 4-to-6 word English photographic aesthetic query (e.g., `"warm sunset coastal balcony candid vertical"`).
* **CA-03.3 (Auto-Populate & Fetch):** Populates the extracted query into the search bar and automatically fetches a batch of $15$ matching backgrounds.

---

### **HU-04: Realistic AI Voiceover Studio (Commercial-Safe TTS) [MUST HAVE]**
> **As a** content creator,  
> **I want to** paste a script, select a realistic Spanish or English voice, and download a natural-sounding audio file,  
> **So that** I can produce professional voiceovers fast without paying ElevenLabs subscription prices.

#### **Acceptance Criteria (CA):**
* **CA-04.1 (Script Editor & Voice Presets):** Provides a `Textarea` with a live character counter (up to $1,200\text{ characters}$) and a `Select` menu of realistic Spanish (LatAm/Spain) and English neural voices.
* **CA-04.2 (Permissive TTS Execution):** Calls `/api/voice` backed by Apache-2.0 / MIT licensed models (`Kokoro-82M` or `F5-TTS` via serverless endpoint, with a built-in zero-key fallback during local dev) and returns audio in under $6\text{ seconds}$.
* **CA-04.3 (Audio Player & Session History):** Renders a clean audio player with 1-click `.mp3` / `.wav` download and saves the last $10$ generated clips in a session history list.

---

### **HU-05: Zero-Shot Voice Cloning Mode [SHOULD HAVE]**
> **As a** content creator,  
> **I want to** upload a 10-to-15 second clean voice sample and generate speech in that voice,  
> **So that** I can create custom voiceovers for specific clients or brands.

#### **Acceptance Criteria (CA):**
* **CA-05.1 (Voice Sample Uploader):** Toggling **"Clone Custom Voice"** reveals an audio dropzone accepting `.mp3` or `.wav` reference clips ($5\text{–}15\text{ seconds}$).
* **CA-05.2 (MIT Zero-Shot Synthesis):** Passes the reference audio and target script to the `F5-TTS` / `Chatterbox` (MIT-licensed) serverless endpoint and returns the cloned audio file.

---

### **HU-06: $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) Monetization Gate & Pass Activation [MUST HAVE]**
> **As the** workspace owner,  
> **I want to** display a $\$15\text{ USD}$ / $\$60,000\text{ COP}$ checkout modal when a guest user exhausts their 3 free trial credits and allow instant pass activation,  
> **So that** I can charge clients for tool access or content fulfillment packages.

#### **Acceptance Criteria (CA):**
* **CA-06.1 (Paywall Trigger):** When a guest user reaches $0$ credits, attempting a generation opens a `shadcn/ui` `Dialog` showcasing the **Vokaloom Pro Pass ($\$15\text{ USD}$ / $\$60,000\text{ COP}$)**.
* **CA-06.2 (Checkout & Key Unlock):** Includes a primary button redirecting to a Wompi / Nequi / Stripe payment link, plus an **"Enter Access / Operator Key"** input that unlocks Pro/Operator mode immediately.

---

### **HU-07: Dedicated Admin Control Panel & Server-Side Access Verification [MUST HAVE]**
> **As the** workspace operator,  
> **I want a** protected `/admin` control center and server-side access code verification (`/api/admin`),  
> **So that** master keys are never leaked in the public UI, I can inspect live AI engine health (`GEMINI_API_KEY`, `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `FAL_KEY`), configure pricing/checkout links, and copy 1-click VIP invite links for clients.

#### **Acceptance Criteria (CA):**
* **CA-07.1 (Zero Client Key Leakage):** Public UI removes all demo master key hints and `"Reset Demo"` buttons; access codes are verified server-side via `POST /api/admin`.
* **CA-07.2 (Protected `/admin` Dashboard):** Provides an Admin Login Gate and 4 control cards: API & AI Engine Health Status, Commercial & Paywall Configuration, Client Access Links & WhatsApp Invite Generator, and Operator Sandbox & Device Controls.

---
