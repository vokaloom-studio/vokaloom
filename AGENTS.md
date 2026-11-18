<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Vokaloom Studio Engineering Constitution

* **Project Name:** `vokaloom-studio`
* **Repository Path:** `~/dev/fb-dev/vokaloom-s`
* **License:** **MIT License** (100% Commercial & Service-Fulfillment Safe)
* **Architecture Target:** Solo-Developer Maintainable Next.js App Router + PWA

---

## 1. Mission & Product Context

`vokaloom-studio` is a high-speed **Content & Voiceover Fulfillment Workstation** designed for social media production and micro-service monetization. It solves two core daily bottlenecks inside one unified interface:
1. **Aesthetic Background Discovery:** Pulls batches of 15 real, candid, vertical Instagram-style photos (travel, lifestyle, POV) in one click from a keyword, preset vibe, or a boss/client reference image.
2. **Realistic AI Voiceover Studio:** Synthesizes natural Spanish and English voiceovers (plus optional zero-shot voice cloning) without high monthly SaaS overhead.

The application operates in two modes:
* **Operator / Fulfillment Mode:** Unlocked via an Admin Master Key (`VOKALOOM_MASTER_KEY`) for unrestricted daily agency production.
* **Client / Monetization Mode:** Offers a 3-run free trial followed by a $\$15\text{ USD}$ ($\sim \$60,000\text{ COP}$) monthly access / service pack paywall.

---

## 2. Strict Commercial Licensing Firewall (NON-NEGOTIABLE)

Every dependency, UI component, API, and AI model weight integrated into `vokaloom-studio` **MUST** permit commercial use and commercial service fulfillment.

### ✅ Approved Licenses & Components
* **Code & UI Libraries:** `MIT`, `Apache-2.0`, `BSD`, `ISC` (Next.js, React, Tailwind CSS, `shadcn/ui`, `lucide-react`, `jszip`, `@google/genai`).
* **AI Voice Models:**
  * `Kokoro-82M` (**Apache-2.0** license — 100% legal for commercial audio sales).
  * `F5-TTS` / `Chatterbox` (**MIT** license — 100% legal for commercial zero-shot voice cloning).
* **Visual & Vision APIs:**
  * **Pexels API & Unsplash API** (Free commercial photo usage; attribute photographer in UI metadata).
  * **Google Gemini 2.5 Flash API** (Used strictly for extracting aesthetic search queries from reference images).

### ❌ Strictly Forbidden (Copyleft & Non-Commercial)
* **NO `AGPL-3.0` or `GPL` Code:** Never copy, import, or adapt code from `debpalash/voicestudio` or any other AGPL-3.0 repository.
* **NO `CC-BY-NC` Model Weights:** Never use `OmniVoice` default non-commercial weights or any TTS checkpoint restricted to research/non-commercial use.
* **NO Unauthorized Scraping:** Never use Puppeteer/Playwright to scrape private Instagram profiles.

---

## 3. Solo-Developer Architectural Guardrails

To ensure a single developer can build, deploy, and maintain `vokaloom-studio` in a 1-week sprint with zero operational debt:

1. **Single Codebase (Next.js App Router + PWA):**
   * All frontend UI and backend API routes live in a single Next.js TypeScript project.
   * Local desktop/mobile installation is achieved via a native Web App Manifest (`src/app/manifest.ts`), completely avoiding Electron build bloat.
2. **Stateless Media Pipeline:**
   * Never store or zip multi-megabyte image batches on the server. Fetch image URLs via `/api/backgrounds` and compress `.zip` archives in the client browser using `jszip`.
3. **Zero Idle Infrastructure Cost:**
   * All AI inference (Vision + TTS) runs via serverless API endpoints (Gemini Flash Free Tier + Fal.ai / Replicate serverless GPU calls). Fixed monthly server cost must remain $\$0.00$.
4. **Flat Directory Structure:**
   ```text
   src/
   ├── app/
   │   ├── api/
   │   │   ├── backgrounds/route.ts   # HU-02 & HU-03 (Pexels/Unsplash + Gemini Vision)
   │   │   └── voice/route.ts         # HU-04 & HU-05 (Kokoro-82M / F5-TTS)
   │   ├── layout.tsx
   │   ├── manifest.ts                # HU-01 (PWA Desktop/Mobile Installability)
   │   └── page.tsx                   # HU-01 (Unified 2-Tab Studio Workspace)
   ├── components/
   │   ├── ui/                        # shadcn/ui primitives (MIT)
   │   ├── background-finder.tsx      # Module 1 UI
   │   ├── voice-studio.tsx           # Module 2 UI
   │   └── paywall-modal.tsx          # HU-06 ($15 USD / $60,000 COP Gate)
   └── lib/
       ├── quota.ts                   # Credit counter & Master Key guard
       └── utils.ts
   ```

---

## 4. Agile Backlog & HU-Driven Development Protocol

All coding tasks and AI agent prompts must follow a strict User Story (`HU`) workflow:

1. **Single Source of Truth:** `HU.md` defines the active scope. Do not invent features outside `HU-01` through `HU-06`.
2. **Sequential Execution:** Complete and verify all Acceptance Criteria (`CA`) of the current `HU` before starting the next one.
3. **Commit Convention:** Every Git commit must reference its User Story ID:
   * `chore(init): scaffold vokaloom-studio nextjs app with AGENTS.md and HU.md`
   * `feat(HU-01): implement unified studio shell, pwa manifest, and quota guard`
   * `feat(HU-02): add 15-image aesthetic batch fetcher and client-side zip export`
   * `feat(HU-03): integrate gemini-2.5-flash vision reference image analyzer`
   * `feat(HU-04): build realistic tts studio with kokoro-82m serverless route`
   * `feat(HU-05): add zero-shot voice cloning sample upload via f5-tts`
   * `feat(HU-06): add $15 USD / 60k COP paywall modal and master key bypass`
4. **Definition of Done (DoD) per HU:**
   * TypeScript compiles with zero errors (`npm run build`).
   * Responsive UI using `shadcn/ui` components.
   * Error states (missing API key, quota exceeded, network timeout) return clean toast messages.
