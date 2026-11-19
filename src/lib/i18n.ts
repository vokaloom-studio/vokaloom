export type Locale = "en" | "es";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "vokaloom_locale_v1";
export const LOCALE_HEADER = "x-vokaloom-locale";

export type TranslationVars = Record<string, string | number | undefined>;

const en = {
  // Language switcher & shared UI
  "switcher.ariaLabel": "Language selector",
  "switcher.enTitle": "Switch to English",
  "switcher.esTitle": "Switch to Spanish",
  "common.close": "Close",

  // Shared Quota
  "quota.exhaustedToast":
    "Free trial credits exhausted ({remaining}/{max}). Unlock Vokaloom Pro or enter your Operator Key!",

  // Main Studio Shell (src/app/page.tsx)
  "page.brandName": "Vokaloom Studio",
  "page.badgeOperator": "Operator",
  "page.badgeProPass": "Pro Pass",
  "page.creditsBadge": "{remaining}/{max} credits",
  "page.adminLink": "Admin",
  "page.adminTitle": "Open Admin Control Center",
  "page.upgradeButton": "Upgrade",
  "page.installAppButton": "Install",
  "page.installAcceptedToast":
    "Installing Vokaloom Studio as a standalone app...",
  "page.installHintToast":
    "Install PWA: Click the Install icon in your browser's address bar (or 'Add to Home Screen' on iOS/Android) to run Vokaloom Studio as a standalone app.",
  "page.vipUnlockedToast":
    "VIP Access unlocked via invite link! Unlimited generations active.",
  "page.tabBackgrounds": "Aesthetic Backgrounds",
  "page.tabVoice": "Realistic Voice Studio",
  "page.footerNotice":
    "Vokaloom Studio · MIT Commercial License",

  // Background Finder (src/components/background-finder.tsx)
  "bg.section.queryVibe": "Query & Vibe",
  "bg.section.modelReference": "Model & Reference",
  "bg.batch.label": "Batch Mode",
  "bg.batch.fast5": "5x Mobile Fast",
  "bg.batch.full15": "15x Full Pack",
  "bg.batch.short5": "5x",
  "bg.batch.short15": "15x",
  "bg.vibePresets": "Vibe",
  "bg.vibe.luxuryTravel": "Luxury Travel",
  "bg.vibe.candidLifestyle": "Candid Lifestyle",
  "bg.vibe.minimalistCafe": "Minimalist Cafe",
  "bg.vibe.urbanStreetPov": "Urban Street POV",
  "bg.vibe.natureSunset": "Nature Sunset",
  "bg.sceneLabel": "Scene / Keyword",
  "bg.searchPlaceholder": "Mediterranean balcony morning sunlight...",
  "bg.clearSearchAria": "Clear search query",
  "bg.generateButton": "Generate {count}",
  "bg.shuffleButton": "Shuffle #{page}",
  "bg.shuffleTitle": "Load {count} more photos (Page #{page})",
  "bg.referenceTitle": "Reference Image",
  "bg.uploadReference": "Upload reference image",
  "bg.referencePreviewAlt": "Reference Image Preview",
  "bg.referenceFallbackName": "Reference Image",
  "bg.removeReferenceTitle": "Remove reference image",
  "bg.visionDna": "Vision DNA:",
  "bg.extractedDna": "Search DNA:",
  "bg.model.title": "My Model",
  "bg.model.uploadTitle": "Upload model photo",
  "bg.model.previewAlt": "Saved Model Reference Preview",
  "bg.model.fallbackName": "Model Photo",
  "bg.model.removeTitle": "Remove saved model photo",
  "bg.placeModelButton": "Place Model",
  "bg.placeModelShort": "Model",
  "bg.placeModelTitle": "Place my model into #{index}",
  "bg.placeModelAria": "Place my model into scene #{index} by {photographer}",
  "bg.swapModal.title": "Model Scene Compositor",
  "bg.swapModal.generating": "Compositing model into 9:16 scene...",
  "bg.swapModal.fallbackNote":
    "Local canvas preview generated. Add GEMINI_API_KEY in /admin for neural relighting.",
  "bg.swapModal.downloadButton": "Download 9:16 Composite",
  "bg.swapModal.previewAlt": "Composited 9:16 scene preview",
  "bg.swapModal.beforeLabel": "Before",
  "bg.swapModal.afterLabel": "After",
  "bg.swapModal.compareAria": "Before and after scene comparison slider",
  "bg.resolvedLabel": "Query:",
  "bg.canvasTitle": "Canvas",
  "bg.pageBadge": "Page #{page}",
  "bg.source.liveStock": "LIVE STOCK",
  "bg.source.curatedArchive": "CURATED ARCHIVE",
  "bg.safeZonesButton": "Safe Zones",
  "bg.safeZonesTitle":
    "Toggle TikTok & Instagram Reels 9:16 UI safe-zone guides",
  "bg.selectFrameTitle": "Select frame for custom .ZIP pack",
  "bg.selectFrameRemoveTitle": "Deselect frame",
  "bg.selectFrameAria": "Select frame #{index}",
  "bg.selectFrameRemoveAria": "Deselect frame #{index}",
  "bg.clearSelectionButton": "Clear selection ({count})",
  "bg.downloadZipButton": "Download .ZIP",
  "bg.downloadSelectedZipButton": "Download Selected ({count}) .ZIP",
  "bg.zipPackaging": "Packaging {count} vertical HD photos into",
  "bg.loadingOverlay": "Curating {count} vertical backgrounds...",
  "bg.downloadSingleTitle": "Download #{index} HD",
  "bg.hdButton": "HD",
  "bg.downloadSingleAria": "Download photo #{index} by {photographer}",
  "bg.fallbackCanvasTitle": "Vokaloom 9:16 Aesthetic #{index}",
  "bg.fallbackCanvasCredit": "Photo by {photographer}",
  "bg.toast.loadedBatch":
    "Loaded {count} vertical (9:16) backgrounds for \"{query}\"",
  "bg.toast.fetchError":
    "Network error fetching backgrounds. Please try again in a moment.",
  "bg.toast.invalidImageType":
    "Please upload a .JPG, .PNG, or .WEBP reference image.",
  "bg.toast.imageTooLarge": "Reference image must be 5 MB or smaller.",
  "bg.toast.analyzingReference":
    "Analyzing Boss Reference Image aesthetic & matching {count} backgrounds...",
  "bg.toast.processImageError": "Could not process reference image.",
  "bg.toast.clearedReference": "Cleared reference image filter.",
  "bg.toast.savedModel":
    "Saved My Model photo locally for 1-tap scene placement.",
  "bg.toast.clearedModel": "Removed saved model photo.",
  "bg.toast.uploadModelFirst":
    "Upload a \"My Model Reference\" photo in the left panel first.",
  "bg.toast.modelSwapReady": "Scene composite ready via {engine}!",
  "bg.toast.modelSwapError":
    "Could not generate scene composite. Please try again.",
  "bg.toast.downloadedComposite": "Downloaded 9:16 model composite!",
  "bg.toast.downloadedSingle": "Downloaded #{index} ({photographer})",
  "bg.toast.downloadSingleFallback":
    "Upstream image unavailable for #{index}; saved offline placeholder instead.",
  "bg.toast.downloadSingleError": "Could not download photo.",
  "bg.toast.generateFirst": "Generate a batch of backgrounds first.",
  "bg.toast.downloadedZip":
    "Downloaded vokaloom-backgrounds.zip ({count} HD photos)!",
  "bg.toast.downloadedZipPartial":
    "Downloaded ZIP with {realCount}/{totalCount} real photos ({placeholderCount} used offline placeholders after proxy failures).",
  "bg.toast.downloadedZipAllFallback":
    "Downloaded ZIP contains {count} offline placeholder images only — upstream proxy downloads failed.",
  "bg.toast.zipError":
    "Failed to package ZIP archive. Try individual downloads.",
  "bg.readme.header": "VOKALOOM STUDIO — {count}x AESTHETIC BACKGROUND BATCH",
  "bg.readme.query": "Generated Query: {query}",
  "bg.readme.vibe": "Vibe Preset: {vibe}",
  "bg.readme.aspect":
    "Aspect Ratio: 9:16 Vertical (Instagram Reels / Stories / Posts)",
  "bg.readme.attributionsHeader":
    "PHOTOGRAPHER ATTRIBUTIONS (Pexels / Unsplash Commercial Safe):",
  "bg.readme.itemLine": "{num}. \"{title}\" — Photo by {photographer} ({source})",
  "bg.readme.placeholderNotice":
    "NOTICE: Upstream image download failed for frame(s) {frames}; synthetic offline placeholder JPEGs were included instead.",

  // Voice Studio (src/components/voice-studio.tsx)
  "voice.configTitle": "Script & Voice",
  "voice.templatesLabel": "Quick Viral Hook Templates",
  "voice.sample.sofiaEs": "ES · Lifestyle & Travel Hook",
  "voice.sample.mateoEs": "ES · Business & Brand Hook",
  "voice.sample.abellaEn": "EN · Creator Reel Hook",
  "voice.scriptLabel": "Voiceover Script",
  "voice.readTime": "~{seconds}s read",
  "voice.charCount": "{count} / {max} chars",
  "voice.scriptPlaceholder": "Paste your Spanish or English reel script here...",
  "voice.presetLabel": "Voice Preset",
  "voice.preset.mateo.label": "Mateo — LatAm Narrator",
  "voice.preset.mateo.badge": "ES · LatAm",
  "voice.preset.sofia.label": "Sofía — Lifestyle & Travel",
  "voice.preset.sofia.badge": "ES · Natural",
  "voice.preset.lucas.label": "Lucas — Dynamic Commercial",
  "voice.preset.lucas.badge": "ES · Reels",
  "voice.preset.abella.label": "Abella — English Creator",
  "voice.preset.abella.badge": "EN · Creator",
  "voice.preset.adam.label": "Adam — Documentary & Tech",
  "voice.preset.adam.badge": "EN · Deep",
  "voice.cloneSectionLabel": "Voice Cloning",
  "voice.cloneToggleLabel": "Clone Custom Voice",
  "voice.toggleOn": "ON",
  "voice.toggleOff": "OFF",
  "voice.dropzoneTitle":
    "Drop or select WhatsApp voice note (.OGG, .MP3, .WAV)",
  "voice.sampleReady": "Ready for zero-shot F5-TTS synthesis",
  "voice.removeAudioAria": "Remove reference audio sample",
  "voice.synthesizingButton": "Synthesizing Neural Voiceover...",
  "voice.generateCloneButton": "Generate Zero-Shot Cloned Voiceover (F5-TTS)",
  "voice.generatePresetButton": "Generate Voiceover ({name})",
  "voice.cloneVoiceLabel": "Zero-Shot Clone ({name})",
  "voice.outputTitle": "Master Output",
  "voice.playAria": "Play voiceover",
  "voice.pauseAria": "Pause voiceover",
  "voice.skipBackAria": "Rewind 5 seconds",
  "voice.skipBackLabel": "-5s",
  "voice.skipForwardAria": "Forward 5 seconds",
  "voice.skipForwardLabel": "+5s",
  "voice.speedTitle": "Playback speed: {speed}x (click to cycle)",
  "voice.muteAria": "Mute audio output",
  "voice.unmuteAria": "Unmute audio output",
  "voice.waveformAria": "Interactive audio waveform scrubber",
  "voice.seekAria": "Seek to {percent}%",
  "voice.downloadAudioButton": "Download Broadcast Audio",
  "voice.emptyTitle": "No active voiceover output",
  "voice.historyTitle": "Session History",
  "voice.clearHistory": "Clear",
  "voice.historyEmpty":
    "Your last 10 synthesized voiceovers will be logged here for instant replay and export.",
  "voice.replayClipTitle": "Replay clip",
  "voice.downloadClipTitle": "Download clip",
  "voice.toast.loadedSample": "Loaded sample script: {label}",
  "voice.toast.invalidAudioType":
    "Please upload a .OGG (WhatsApp), .MP3, .WAV, or .M4A voice reference file.",
  "voice.toast.audioTooLarge":
    "Reference voice sample must be under 3 MB. Tip: upload a 10-to-20 second .OGG, .MP3, or .WAV clip under 3 MB.",
  "voice.toast.loadedAudioSample":
    "Loaded voice sample \"{name}\" for MIT F5-TTS zero-shot cloning.",
  "voice.toast.emptyScript": "Please enter a voiceover script first.",
  "voice.toast.scriptTooLong": "Script cannot exceed 1,500 characters.",
  "voice.toast.missingCloneAudio":
    "Please upload a WhatsApp .OGG, .MP3, or .WAV reference clip for Zero-Shot Voice Cloning, or disable Clone Mode.",
  "voice.toast.synthFailed": "Could not synthesize voiceover.",
  "voice.toast.ready": "Voiceover ready via {engine}!",
  "voice.toast.downloaded": "Downloaded voiceover audio file!",
  "voice.toast.clearedHistory": "Cleared voiceover session history.",

  // Paywall Modal (src/components/paywall-modal.tsx)
  "paywall.badgeTitle": "Vokaloom Pro Pass",
  "paywall.badgeActive": "Active",
  "paywall.badgeTrial": "Trial: {remaining}/{max} left",
  "paywall.title": "Upgrade to Vokaloom Pro",
  "paywall.perMonthShort": "/ mo",
  "paywall.currencyAria": "Select checkout currency",
  "paywall.currency.cop": "COP · Colombia (Nequi / PSE / Wompi)",
  "paywall.currency.usd": "USD · Global (Stripe)",
  "paywall.benefit1":
    "Unlimited 15-photo vertical batches & ZIP export",
  "paywall.benefit2":
    "Vision reference matching & 9:16 model compositing",
  "paywall.benefit3":
    "Spanish & English neural voiceovers with F5-TTS cloning",
  "paywall.checkoutCopButton":
    "Subscribe for {priceCop} / month (Nequi / PSE / Wompi)",
  "paywall.checkoutUsdButton":
    "Subscribe for {priceUsd} / month (Stripe Global)",
  "paywall.checkoutCopLabel": "Wompi / Nequi / PSE ({priceCop})",
  "paywall.checkoutUsdLabel": "Stripe Global ({priceUsd})",
  "paywall.dividerLabel": "Or Instant Key Activation",
  "paywall.codeLabel": "Have a Pro Pass or Client Access Code?",
  "paywall.codePlaceholder": "Enter your access code...",
  "paywall.unlockButton": "Unlock Unlimited",
  "paywall.toast.openedCheckout": "Opened {label} checkout in a new tab.",
  "paywall.toast.enterCode": "Please enter your access code.",
  "paywall.toast.operatorActivated":
    "Operator Mode Activated! Unlimited generations unlocked.",
  "paywall.toast.proActivated":
    "Pro Pass Activated! Unlimited generations unlocked.",
  "paywall.toast.invalidCode":
    "Invalid Access Code. Please verify your Pro Pass code or complete checkout above.",

  // Admin Console (src/app/admin/page.tsx)
  "admin.headerTitle": "Vokaloom Admin Control Center",
  "admin.operatorConsoleBadge": "Operator Console",
  "admin.headerSubtitle":
    "Server-Side API Engine Diagnostics, Paywall Configuration & VIP Client Invite Generator",
  "admin.browserModeOperator": "Browser Mode: Unlimited Operator",
  "admin.browserModeTrial": "Browser Mode: Client Trial ({remaining}/{max})",
  "admin.returnToStudio": "Return to Studio (/)",
  "admin.loginTitle": "Operator Authentication Required",
  "admin.loginDescBefore": "Enter your server-side",
  "admin.loginDescAfter":
    "to access engine diagnostics, paywall settings, and VIP invite links.",
  "admin.passwordLabel": "Master Admin Password",
  "admin.passwordPlaceholder": "Enter ADMIN_MASTER_KEY...",
  "admin.verifyingButton": "Verifying with Server...",
  "admin.unlockButton": "Unlock Admin Control Center",
  "admin.card1Title": "1. API & AI Engine Health Status",
  "admin.refreshHealth": "Refresh Health Status",
  "admin.card1Desc":
    "Live server-side check of .env.local / Vercel environment variables without exposing secret keys to the browser.",
  "admin.engine.geminiVision":
    "Gemini 2.5 Flash Vision (Boss Reference Matcher)",
  "admin.engine.geminiTts": "Gemini 2.5 Native Neural TTS (Voiceover Engine)",
  "admin.engine.pexels": "Pexels Portrait Stock API",
  "admin.engine.unsplash": "Unsplash Portrait Stock API",
  "admin.engine.fal":
    "Fal.ai Serverless GPU (Kokoro-82M & F5-TTS Voice Cloning)",
  "admin.envLabel": "Env: {envVar}",
  "admin.statusActive": "Live Neural / API Active",
  "admin.statusFallback": "Zero-Key Fallback Active",
  "admin.card2Title": "3. Commercial & Paywall Configuration",
  "admin.card2Desc":
    "Customize the Pro Pass pricing, Wompi/Stripe checkout links, and guest trial credit limit.",
  "admin.priceCopLabel": "Price (COP)",
  "admin.priceUsdLabel": "Price (USD)",
  "admin.trialCreditsLabel": "Free Trial Credits",
  "admin.checkoutCopLabel": "Wompi / Nequi / PSE Checkout URL (COP)",
  "admin.checkoutUsdLabel": "Stripe Global Checkout URL (USD)",
  "admin.saveSettingsButton": "Save Paywall & Pricing Settings",
  "admin.card3Title": "4. Client Access Links & WhatsApp Invite Generator",
  "admin.card3Desc":
    "Generate 1-click auto-unlock links (/?key=...) for paying clients or VIP testers on WhatsApp.",
  "admin.vipCodesLabelBefore": "Active Server-Side VIP Client Codes (",
  "admin.vipCodesLabelAfter": ")",
  "admin.copyInviteButton": "Copy VIP Invite Link",
  "admin.customInviteLabel": "Custom Invite Code Link Builder",
  "admin.customInvitePlaceholder": "Enter access code...",
  "admin.card4Title": "5. Operator Sandbox & Device Controls",
  "admin.card4Desc":
    "Switch this browser between Unlimited Operator Mode and Normal Client View to test the trial counter and paywall experience.",
  "admin.enableOperatorButton":
    "Enable Unlimited Operator Mode on This Browser",
  "admin.switchClientButton": "Switch to Normal Client View (Test Paywall)",
  "admin.resetTrialButton": "Reset Local Trial Credits to {max}/{max}",
  "admin.toast.enterPassword": "Please enter the Master Admin Password.",
  "admin.toast.invalidPassword": "Invalid Master Admin Password.",
  "admin.toast.authenticated":
    "Authenticated into Vokaloom Admin Control Center.",
  "admin.toast.verifyFailed": "Failed to verify admin credentials.",
  "admin.toast.savedConfig":
    "Saved Commercial & Paywall Configuration for this workstation.",
  "admin.toast.copiedInvite": "Copied VIP Invite Link: {url}",
  "admin.toast.inviteFallback": "Invite Link: {url}",
  "admin.toast.operatorEnabled":
    "Unlimited Operator Mode enabled on this browser.",
  "admin.toast.clientViewEnabled":
    "Switched to Normal Client View. You can now test the trial counter and paywall.",
  "admin.toast.trialReset":
    "Reset local trial credits to {remaining}/{max}.",
  "admin.vault.title": "2. Runtime API Keys Vault (AES-256-GCM)",
  "admin.vault.desc":
    "Paste API keys directly from this browser. Secrets are encrypted in an HttpOnly cookie (and persisted to .env.local in local dev) and never exposed to client JS or localStorage.",
  "admin.vault.activeBadge": "Active: {masked}",
  "admin.vault.unsetBadge": "Not configured",
  "admin.vault.placeholder": "Paste new key to update (or CLEAR to remove)...",
  "admin.vault.saveButton": "Save & Encrypt Keys",
  "admin.vault.savingButton": "Encrypting Keys...",
  "admin.vault.clearButton": "Clear Vault",
  "admin.vault.clearSingleTitle": "Remove {keyName} from vault",
  "admin.vault.toast.savedCookie":
    "Encrypted API keys saved to HttpOnly Vault cookie.",
  "admin.vault.toast.savedDisk":
    "Encrypted API keys saved to HttpOnly Vault and persisted to .env.local.",
  "admin.vault.toast.noInput":
    "Enter at least one API key (or CLEAR) before saving.",
  "admin.vault.toast.clearedSingle":
    "Removed {keyName} from the active HttpOnly Vault session.",
  "admin.vault.toast.cleared":
    "Cleared the HttpOnly API Keys Vault cookie.",
  "admin.vault.toast.saveError": "Could not update API Keys Vault.",
  "admin.vault.toast.clearError": "Could not clear API Keys Vault.",

  // API Route Messages
  "api.quota.exhausted":
    "Free trial credits exhausted. Unlock Vokaloom Pro or sign in as Operator to continue.",
  "api.bg.invalidProxyOrigin": "Invalid or disallowed proxyUrl origin.",
  "api.bg.upstreamStatus": "Upstream image returned {status}",
  "api.bg.proxyFailed": "Failed to proxy image download.",
  "api.bg.proxyBusy":
    "Image proxy is temporarily busy. Please retry shortly.",
  "api.bg.proxyTooLarge": "Upstream image exceeds 15 MB proxy limit.",
  "api.bg.invalidUpstreamContentType":
    "Upstream resource did not return a supported image Content-Type.",
  "api.bg.invalidReferenceImage":
    "Reference image must be a valid base64 JPEG, PNG, or WebP payload.",
  "api.bg.referenceImageTooLarge":
    "Reference image exceeds the 5 MB maximum size limit.",
  "api.bg.fallbackNotice":
    "Curated fallback batch served because live search encountered an issue.",
  "api.modelSwap.missingInputs":
    "Both model reference image and background URL are required.",
  "api.modelSwap.invalidBackgroundOrigin":
    "Invalid or disallowed backgroundUrl origin.",
  "api.modelSwap.invalidModelImage":
    "Model image must be a valid base64 JPEG, PNG, or WebP payload.",
  "api.modelSwap.modelImageTooLarge":
    "Model image exceeds the 5 MB maximum size limit.",
  "api.modelSwap.geminiEngine": "Gemini 2.5 Visual Compositor",
  "api.modelSwap.fallbackEngine": "Client Canvas Compositor",
  "api.modelSwap.processError": "Unable to process model scene placement.",
  "api.voice.invalidLength":
    "Script text must be between 1 and 1,500 characters in length.",
  "api.voice.invalidReferenceAudio":
    "Reference audio must be a valid base64 audio data URI (.ogg, .opus, .mp3, .wav, .m4a, .aac, .webm).",
  "api.voice.referenceAudioTooLarge":
    "Reference audio exceeds the 3 MB maximum size limit.",
  "api.voice.engine.f5tts": "F5-TTS (MIT Clone)",
  "api.voice.engine.kokoro": "Kokoro-82M (Apache-2.0)",
  "api.voice.engine.geminiTts": "Gemini 2.5 Neural TTS",
  "api.voice.demoFallbackEngine":
    "Demo Fallback (Add FAL_KEY or GEMINI_API_KEY for Live Neural TTS)",
  "api.voice.processError": "Unable to process voice synthesis request.",
  "api.admin.unauthenticated": "Admin authentication required.",
  "api.admin.authenticated": "Admin session verified.",
  "api.admin.loggedOut": "Admin session closed.",
  "api.admin.missingCode": "Please provide an access code.",
  "api.admin.invalidAdminKey": "Invalid Master Admin Password.",
  "api.admin.invalidAccessCode": "Invalid Pro Pass or Operator access code.",
  "api.admin.tooManyAttempts":
    "Too many attempts. Try again in 10 minutes.",
  "api.admin.operatorGranted": "Operator access granted.",
  "api.admin.proGranted": "Pro Pass access granted.",
  "api.admin.invalidRequest": "Invalid admin verification request.",
  "api.admin.payloadTooLarge": "Admin request body exceeds maximum size limit.",
  "api.admin.invalidKeyLength":
    "Key {keyName} must be longer than 5 characters (or CLEAR).",
  "api.admin.missingServerKey":
    "Server configuration error: ADMIN_MASTER_KEY is required in production.",
  "api.admin.noKeysProvided": "No key updates were provided.",
  "api.admin.vaultUpdated": "API Key Vault encrypted and updated.",
  "api.admin.vaultCleared": "API Key Vault cookie cleared.",
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  // Language switcher & shared UI
  "switcher.ariaLabel": "Selector de idioma",
  "switcher.enTitle": "Cambiar a inglés",
  "switcher.esTitle": "Cambiar a español",
  "common.close": "Cerrar",

  // Shared Quota
  "quota.exhaustedToast":
    "Créditos de prueba agotados ({remaining}/{max}). ¡Desbloquea Vokaloom Pro o ingresa tu clave de operador!",

  // Main Studio Shell (src/app/page.tsx)
  "page.brandName": "Vokaloom Studio",
  "page.badgeOperator": "Operador",
  "page.badgeProPass": "Pase Pro",
  "page.creditsBadge": "{remaining}/{max} créditos",
  "page.adminLink": "Admin",
  "page.adminTitle": "Abrir Centro de Control Admin",
  "page.upgradeButton": "Mejorar",
  "page.installAppButton": "Instalar",
  "page.installAcceptedToast":
    "Instalando Vokaloom Studio como aplicación independiente...",
  "page.installHintToast":
    "Instalar PWA: Haz clic en el ícono de Instalar en la barra de direcciones de tu navegador (o 'Añadir a pantalla de inicio' en iOS/Android) para ejecutar Vokaloom Studio como aplicación independiente.",
  "page.vipUnlockedToast":
    "¡Acceso VIP desbloqueado mediante enlace de invitación! Generaciones ilimitadas activas.",
  "page.tabBackgrounds": "Fondos Estéticos",
  "page.tabVoice": "Estudio de Voz Realista",
  "page.footerNotice":
    "Vokaloom Studio · Licencia Comercial MIT",

  // Background Finder (src/components/background-finder.tsx)
  "bg.section.queryVibe": "Consulta y Estilo",
  "bg.section.modelReference": "Modelo y Referencia",
  "bg.batch.label": "Modo de Lote",
  "bg.batch.fast5": "5x Móvil Rápido",
  "bg.batch.full15": "15x Pack Completo",
  "bg.batch.short5": "5x",
  "bg.batch.short15": "15x",
  "bg.vibePresets": "Estilo",
  "bg.vibe.luxuryTravel": "Viajes de Lujo",
  "bg.vibe.candidLifestyle": "Estilo de Vida Real",
  "bg.vibe.minimalistCafe": "Café Minimalista",
  "bg.vibe.urbanStreetPov": "Calle Urbana POV",
  "bg.vibe.natureSunset": "Atardecer Natural",
  "bg.sceneLabel": "Escena / Palabra Clave",
  "bg.searchPlaceholder": "Balcón mediterráneo luz de mañana...",
  "bg.clearSearchAria": "Limpiar consulta de búsqueda",
  "bg.generateButton": "Generar {count}",
  "bg.shuffleButton": "Mezclar #{page}",
  "bg.shuffleTitle": "Cargar {count} fotos más (Página #{page})",
  "bg.referenceTitle": "Imagen de Referencia",
  "bg.uploadReference": "Subir imagen de referencia",
  "bg.referencePreviewAlt": "Vista previa de referencia",
  "bg.referenceFallbackName": "Imagen de referencia",
  "bg.removeReferenceTitle": "Quitar imagen de referencia",
  "bg.visionDna": "ADN Vision:",
  "bg.extractedDna": "ADN Búsqueda:",
  "bg.model.title": "Mi Modelo",
  "bg.model.uploadTitle": "Subir foto de modelo",
  "bg.model.previewAlt": "Vista previa del modelo guardado",
  "bg.model.fallbackName": "Foto de Modelo",
  "bg.model.removeTitle": "Quitar foto de modelo guardada",
  "bg.placeModelButton": "Colocar Modelo",
  "bg.placeModelShort": "Modelo",
  "bg.placeModelTitle": "Colocar mi modelo en #{index}",
  "bg.placeModelAria": "Colocar mi modelo en escena #{index} de {photographer}",
  "bg.swapModal.title": "Compositor de Modelo en Escena",
  "bg.swapModal.generating": "Integrando modelo en escena 9:16...",
  "bg.swapModal.fallbackNote":
    "Vista previa local generada en Canvas. Agrega GEMINI_API_KEY en /admin para reiluminación neural.",
  "bg.swapModal.downloadButton": "Descargar Composición 9:16",
  "bg.swapModal.previewAlt": "Vista previa compuesta 9:16",
  "bg.swapModal.beforeLabel": "Antes",
  "bg.swapModal.afterLabel": "Después",
  "bg.swapModal.compareAria":
    "Control deslizable de comparación antes y después",
  "bg.resolvedLabel": "Consulta:",
  "bg.canvasTitle": "Lienzo",
  "bg.pageBadge": "Página #{page}",
  "bg.source.liveStock": "STOCK EN VIVO",
  "bg.source.curatedArchive": "ARCHIVO CURADO",
  "bg.safeZonesButton": "Zonas Seguras",
  "bg.safeZonesTitle":
    "Mostrar guías de zona segura 9:16 para TikTok e Instagram Reels",
  "bg.selectFrameTitle": "Seleccionar cuadro para pack .ZIP personalizado",
  "bg.selectFrameRemoveTitle": "Quitar cuadro de selección",
  "bg.selectFrameAria": "Seleccionar cuadro #{index}",
  "bg.selectFrameRemoveAria": "Quitar selección del cuadro #{index}",
  "bg.clearSelectionButton": "Limpiar ({count})",
  "bg.downloadZipButton": "Descargar .ZIP",
  "bg.downloadSelectedZipButton": "Descargar Sel. ({count}) .ZIP",
  "bg.zipPackaging": "Empaquetando {count} fotos verticales HD en",
  "bg.loadingOverlay": "Curando {count} fondos verticales...",
  "bg.downloadSingleTitle": "Descargar #{index} HD",
  "bg.hdButton": "HD",
  "bg.downloadSingleAria": "Descargar foto #{index} de {photographer}",
  "bg.fallbackCanvasTitle": "Fondo Estético Vokaloom 9:16 #{index}",
  "bg.fallbackCanvasCredit": "Foto por {photographer}",
  "bg.toast.loadedBatch":
    "Se cargaron {count} fondos verticales (9:16) para \"{query}\"",
  "bg.toast.fetchError":
    "Error de red al obtener los fondos. Inténtalo de nuevo en un momento.",
  "bg.toast.invalidImageType":
    "Sube una imagen de referencia .JPG, .PNG o .WEBP.",
  "bg.toast.imageTooLarge":
    "La imagen de referencia debe pesar 5 MB o menos.",
  "bg.toast.analyzingReference":
    "Analizando estética de referencia y emparejando {count} fondos...",
  "bg.toast.processImageError":
    "No se pudo procesar la imagen de referencia.",
  "bg.toast.clearedReference": "Filtro de imagen de referencia eliminado.",
  "bg.toast.savedModel":
    "Foto de Mi Modelo guardada localmente para colocar en 1 toque.",
  "bg.toast.clearedModel": "Foto de modelo guardada eliminada.",
  "bg.toast.uploadModelFirst":
    "Sube primero una foto en \"Mi Modelo de Referencia\" en el panel izquierdo.",
  "bg.toast.modelSwapReady": "¡Composición lista con {engine}!",
  "bg.toast.modelSwapError":
    "No se pudo generar la composición de escena. Intenta de nuevo.",
  "bg.toast.downloadedComposite": "¡Composición 9:16 descargada!",
  "bg.toast.downloadedSingle": "Descargada #{index} ({photographer})",
  "bg.toast.downloadSingleFallback":
    "Imagen de origen no disponible para #{index}; se guardó marcador offline.",
  "bg.toast.downloadSingleError": "No se pudo descargar la foto.",
  "bg.toast.generateFirst": "Genera primero un lote de fondos.",
  "bg.toast.downloadedZip":
    "¡Descargado vokaloom-backgrounds.zip ({count} fotos HD)!",
  "bg.toast.downloadedZipPartial":
    "ZIP descargado con {realCount}/{totalCount} fotos reales ({placeholderCount} usaron marcadores offline tras fallos del proxy).",
  "bg.toast.downloadedZipAllFallback":
    "El ZIP descargado solo contiene {count} imágenes de marcador offline; fallaron todas las descargas del proxy.",
  "bg.toast.zipError":
    "Error al empaquetar el archivo ZIP. Prueba las descargas individuales.",
  "bg.readme.header": "VOKALOOM STUDIO — LOTE DE {count} FONDOS ESTÉTICOS",
  "bg.readme.query": "Consulta Generada: {query}",
  "bg.readme.vibe": "Estilo Predefinido: {vibe}",
  "bg.readme.aspect":
    "Relación de Aspecto: 9:16 Vertical (Instagram Reels / Historias / Publicaciones)",
  "bg.readme.attributionsHeader":
    "ATRIBUCIÓN DE FOTÓGRAFOS (Pexels / Unsplash Uso Comercial Seguro):",
  "bg.readme.itemLine": "{num}. \"{title}\" — Foto por {photographer} ({source})",
  "bg.readme.placeholderNotice":
    "AVISO: Falló la descarga original en el cuadro(s) {frames}; se incluyeron marcadores sintéticos offline.",

  // Voice Studio (src/components/voice-studio.tsx)
  "voice.configTitle": "Guion y Voz",
  "voice.templatesLabel": "Plantillas Rápidas de Ganchos Virales",
  "voice.sample.sofiaEs": "ES · Hook Estilo de Vida y Viajes",
  "voice.sample.mateoEs": "ES · Hook Negocios y Marca",
  "voice.sample.abellaEn": "EN · Hook Creador en Inglés",
  "voice.scriptLabel": "Guion de Locución",
  "voice.readTime": "~{seconds}s lect.",
  "voice.charCount": "{count} / {max} car.",
  "voice.scriptPlaceholder":
    "Pega aquí tu guion para reel en español o inglés...",
  "voice.presetLabel": "Voz Predefinida",
  "voice.preset.mateo.label": "Mateo — Narrador LatAm",
  "voice.preset.mateo.badge": "ES · LatAm",
  "voice.preset.sofia.label": "Sofía — Estilo de Vida y Viajes",
  "voice.preset.sofia.badge": "ES · Natural",
  "voice.preset.lucas.label": "Lucas — Dinámico Comercial",
  "voice.preset.lucas.badge": "ES · Reels",
  "voice.preset.abella.label": "Abella — Creadora en Inglés",
  "voice.preset.abella.badge": "EN · Creadora",
  "voice.preset.adam.label": "Adam — Documental y Tech",
  "voice.preset.adam.badge": "EN · Grave",
  "voice.cloneSectionLabel": "Clonación de Voz",
  "voice.cloneToggleLabel": "Clonar Voz Personalizada",
  "voice.toggleOn": "ACTIVO",
  "voice.toggleOff": "INACTIVO",
  "voice.dropzoneTitle":
    "Sube o arrastra nota de voz de WhatsApp (.OGG, .MP3, .WAV)",
  "voice.sampleReady": "Lista para síntesis zero-shot con F5-TTS",
  "voice.removeAudioAria": "Quitar muestra de audio de referencia",
  "voice.synthesizingButton": "Sintetizando locución neural...",
  "voice.generateCloneButton":
    "Generar Locución Clonada Zero-Shot (F5-TTS)",
  "voice.generatePresetButton": "Generar Locución ({name})",
  "voice.cloneVoiceLabel": "Clon Zero-Shot ({name})",
  "voice.outputTitle": "Salida Maestra",
  "voice.playAria": "Reproducir locución",
  "voice.pauseAria": "Pausar locución",
  "voice.skipBackAria": "Retroceder 5 segundos",
  "voice.skipBackLabel": "-5s",
  "voice.skipForwardAria": "Adelantar 5 segundos",
  "voice.skipForwardLabel": "+5s",
  "voice.speedTitle": "Velocidad de reproducción: {speed}x (clic para cambiar)",
  "voice.muteAria": "Silenciar salida de audio",
  "voice.unmuteAria": "Activar sonido de salida",
  "voice.waveformAria": "Control interactivo de onda de audio",
  "voice.seekAria": "Ir al {percent}%",
  "voice.downloadAudioButton": "Descargar Audio Maestro",
  "voice.emptyTitle": "Sin locución activa",
  "voice.historyTitle": "Historial de Sesión",
  "voice.clearHistory": "Limpiar",
  "voice.historyEmpty":
    "Tus últimas 10 locuciones sintetizadas aparecerán aquí para reproducirlas y exportarlas al instante.",
  "voice.replayClipTitle": "Reproducir clip",
  "voice.downloadClipTitle": "Descargar clip",
  "voice.toast.loadedSample": "Guion de ejemplo cargado: {label}",
  "voice.toast.invalidAudioType":
    "Sube un archivo de voz .OGG (WhatsApp), .MP3, .WAV o .M4A.",
  "voice.toast.audioTooLarge":
    "La muestra de voz debe pesar menos de 3 MB. Consejo: sube un clip .OGG, .MP3 o .WAV de 10 a 20 segundos.",
  "voice.toast.loadedAudioSample":
    "Muestra de voz \"{name}\" cargada para clonación zero-shot con MIT F5-TTS.",
  "voice.toast.emptyScript": "Ingresa primero un guion para la locución.",
  "voice.toast.scriptTooLong": "El guion no puede superar los 1,500 caracteres.",
  "voice.toast.missingCloneAudio":
    "Sube una nota de voz .OGG de WhatsApp, .MP3 o .WAV para clonación zero-shot o desactiva el modo clonación.",
  "voice.toast.synthFailed": "No se pudo sintetizar la locución.",
  "voice.toast.ready": "¡Locución lista con {engine}!",
  "voice.toast.downloaded": "¡Archivo de audio de locución descargado!",
  "voice.toast.clearedHistory": "Historial de locuciones borrado.",

  // Paywall Modal (src/components/paywall-modal.tsx)
  "paywall.badgeTitle": "Pase Vokaloom Pro",
  "paywall.badgeActive": "Activo",
  "paywall.badgeTrial": "Prueba: {remaining}/{max} rest.",
  "paywall.title": "Mejorar a Vokaloom Pro",
  "paywall.perMonthShort": "/ mes",
  "paywall.currencyAria": "Seleccionar moneda de pago",
  "paywall.currency.cop": "COP · Colombia (Nequi / PSE / Wompi)",
  "paywall.currency.usd": "USD · Global (Stripe)",
  "paywall.benefit1":
    "Lotes verticales ilimitados de 15 fotos y exportación ZIP",
  "paywall.benefit2":
    "Emparejamiento visual y composición de modelo 9:16",
  "paywall.benefit3":
    "Locuciones neurales ES/EN con clonación zero-shot F5-TTS",
  "paywall.checkoutCopButton":
    "Suscribirse por {priceCop} / mes (Nequi / PSE / Wompi)",
  "paywall.checkoutUsdButton":
    "Suscribirse por {priceUsd} / mes (Stripe Global)",
  "paywall.checkoutCopLabel": "Wompi / Nequi / PSE ({priceCop})",
  "paywall.checkoutUsdLabel": "Stripe Global ({priceUsd})",
  "paywall.dividerLabel": "O Activación Instantánea con Clave",
  "paywall.codeLabel": "¿Tienes un Pase Pro o Código de Acceso?",
  "paywall.codePlaceholder": "Ingresa tu código de acceso...",
  "paywall.unlockButton": "Desbloquear Ilimitado",
  "paywall.toast.openedCheckout":
    "Se abrió la pasarela {label} en una nueva pestaña.",
  "paywall.toast.enterCode": "Por favor ingresa tu código de acceso.",
  "paywall.toast.operatorActivated":
    "¡Modo Operador activado! Generaciones ilimitadas desbloqueadas.",
  "paywall.toast.proActivated":
    "¡Pase Pro activado! Generaciones ilimitadas desbloqueadas.",
  "paywall.toast.invalidCode":
    "Código de acceso inválido. Verifica tu código Pase Pro o completa el pago arriba.",

  // Admin Console (src/app/admin/page.tsx)
  "admin.headerTitle": "Centro de Control Admin Vokaloom",
  "admin.operatorConsoleBadge": "Consola de Operador",
  "admin.headerSubtitle":
    "Diagnóstico de Motores API en Servidor, Configuración de Paywall y Generador de Invitaciones VIP",
  "admin.browserModeOperator": "Modo Navegador: Operador Ilimitado",
  "admin.browserModeTrial": "Modo Navegador: Prueba Cliente ({remaining}/{max})",
  "admin.returnToStudio": "Volver al Estudio (/)",
  "admin.loginTitle": "Autenticación de Operador Requerida",
  "admin.loginDescBefore": "Ingresa tu clave de servidor",
  "admin.loginDescAfter":
    "para acceder al diagnóstico de motores, configuración de paywall y enlaces VIP.",
  "admin.passwordLabel": "Contraseña Maestra de Admin",
  "admin.passwordPlaceholder": "Ingresa ADMIN_MASTER_KEY...",
  "admin.verifyingButton": "Verificando con el servidor...",
  "admin.unlockButton": "Desbloquear Centro de Control",
  "admin.card1Title": "1. Estado de Motores API e IA",
  "admin.refreshHealth": "Actualizar Estado",
  "admin.card1Desc":
    "Verificación en vivo desde el servidor de variables .env.local / Vercel sin exponer claves secretas al navegador.",
  "admin.engine.geminiVision":
    "Gemini 2.5 Flash Vision (Coincidencia por Referencia)",
  "admin.engine.geminiTts":
    "Gemini 2.5 TTS Neural Nativo (Motor de Locución)",
  "admin.engine.pexels": "API Stock Retrato Pexels",
  "admin.engine.unsplash": "API Stock Retrato Unsplash",
  "admin.engine.fal":
    "Fal.ai GPU Serverless (Kokoro-82M y Clonación F5-TTS)",
  "admin.envLabel": "Var: {envVar}",
  "admin.statusActive": "API / Neural Activa",
  "admin.statusFallback": "Respaldo Sin Clave Activo",
  "admin.card2Title": "3. Configuración Comercial y de Paywall",
  "admin.card2Desc":
    "Personaliza los precios del Pase Pro, enlaces de pago Wompi/Stripe y el límite de créditos de prueba.",
  "admin.priceCopLabel": "Precio (COP)",
  "admin.priceUsdLabel": "Precio (USD)",
  "admin.trialCreditsLabel": "Créditos de Prueba",
  "admin.checkoutCopLabel": "URL de Pago Wompi / Nequi / PSE (COP)",
  "admin.checkoutUsdLabel": "URL de Pago Stripe Global (USD)",
  "admin.saveSettingsButton": "Guardar Ajustes de Paywall y Precios",
  "admin.card3Title":
    "4. Enlaces de Acceso y Generador de Invitaciones WhatsApp",
  "admin.card3Desc":
    "Genera enlaces de autodesbloqueo en 1 clic (/?key=...) para clientes de pago o testers VIP por WhatsApp.",
  "admin.vipCodesLabelBefore": "Códigos VIP Activos en el Servidor (",
  "admin.vipCodesLabelAfter": ")",
  "admin.copyInviteButton": "Copiar Enlace VIP",
  "admin.customInviteLabel": "Constructor de Enlace con Código Personalizado",
  "admin.customInvitePlaceholder": "Ingresa un código de acceso...",
  "admin.card4Title": "5. Sandbox de Operador y Controles del Dispositivo",
  "admin.card4Desc":
    "Alterna este navegador entre Modo Operador Ilimitado y Vista de Cliente Normal para probar los créditos gratuitos y el paywall.",
  "admin.enableOperatorButton":
    "Activar Modo Operador Ilimitado en Este Navegador",
  "admin.switchClientButton":
    "Cambiar a Vista de Cliente Normal (Probar Paywall)",
  "admin.resetTrialButton": "Reiniciar Créditos de Prueba a {max}/{max}",
  "admin.toast.enterPassword":
    "Por favor ingresa la contraseña maestra de administrador.",
  "admin.toast.invalidPassword": "Contraseña maestra de administrador inválida.",
  "admin.toast.authenticated":
    "Autenticado en el Centro de Control Admin de Vokaloom.",
  "admin.toast.verifyFailed":
    "Error al verificar las credenciales de administrador.",
  "admin.toast.savedConfig":
    "Configuración comercial y de paywall guardada para esta estación.",
  "admin.toast.copiedInvite": "Enlace de invitación VIP copiado: {url}",
  "admin.toast.inviteFallback": "Enlace de invitación: {url}",
  "admin.toast.operatorEnabled":
    "Modo Operador ilimitado activado en este navegador.",
  "admin.toast.clientViewEnabled":
    "Cambiado a Vista de Cliente Normal. Ya puedes probar el contador de prueba y el paywall.",
  "admin.toast.trialReset":
    "Créditos locales de prueba reiniciados a {remaining}/{max}.",
  "admin.vault.title": "2. Bóveda de Claves API en Tiempo Real (AES-256-GCM)",
  "admin.vault.desc":
    "Pega tus claves API directamente desde este navegador. Se cifran en una cookie HttpOnly (y se guardan en .env.local en desarrollo local) sin exponerse al JS del cliente ni a localStorage.",
  "admin.vault.activeBadge": "Activa: {masked}",
  "admin.vault.unsetBadge": "Sin configurar",
  "admin.vault.placeholder":
    "Pega una clave nueva para actualizar (o CLEAR para quitar)...",
  "admin.vault.saveButton": "Guardar y Cifrar Claves",
  "admin.vault.savingButton": "Cifrando Claves...",
  "admin.vault.clearButton": "Vaciar Bóveda",
  "admin.vault.clearSingleTitle": "Quitar {keyName} de la bóveda",
  "admin.vault.toast.savedCookie":
    "Claves API cifradas y guardadas en la cookie HttpOnly de la bóveda.",
  "admin.vault.toast.savedDisk":
    "Claves API cifradas en la bóveda HttpOnly y guardadas en .env.local.",
  "admin.vault.toast.noInput":
    "Ingresa al menos una clave API (o CLEAR) antes de guardar.",
  "admin.vault.toast.clearedSingle":
    "Se quitó {keyName} de la sesión activa HttpOnly de la bóveda.",
  "admin.vault.toast.cleared":
    "Cookie cifrada de la bóveda API vaciada.",
  "admin.vault.toast.saveError":
    "No se pudo actualizar la bóveda de claves API.",
  "admin.vault.toast.clearError":
    "No se pudo vaciar la bóveda de claves API.",

  // API Route Messages
  "api.quota.exhausted":
    "Créditos de prueba agotados. Desbloquea Vokaloom Pro o inicia sesión como Operador para continuar.",
  "api.bg.invalidProxyOrigin": "Origen de proxyUrl no válido o no permitido.",
  "api.bg.upstreamStatus": "La imagen de origen devolvió el estado {status}",
  "api.bg.proxyFailed": "No se pudo obtener la imagen a través del proxy.",
  "api.bg.proxyBusy":
    "El proxy de imágenes está ocupado temporalmente. Reintenta en unos segundos.",
  "api.bg.proxyTooLarge":
    "La imagen de origen supera el límite de 15 MB del proxy.",
  "api.bg.invalidUpstreamContentType":
    "El recurso de origen no devolvió un Content-Type de imagen válido.",
  "api.bg.invalidReferenceImage":
    "La imagen de referencia debe ser un payload base64 JPEG, PNG o WebP válido.",
  "api.bg.referenceImageTooLarge":
    "La imagen de referencia supera el límite máximo de 5 MB.",
  "api.bg.fallbackNotice":
    "Se sirvió el lote curado de respaldo porque la búsqueda en vivo tuvo un problema.",
  "api.modelSwap.missingInputs":
    "Se requieren tanto la foto del modelo como la URL de fondo.",
  "api.modelSwap.invalidBackgroundOrigin":
    "Origen de backgroundUrl no válido o no permitido.",
  "api.modelSwap.invalidModelImage":
    "La foto del modelo debe ser un payload base64 JPEG, PNG o WebP válido.",
  "api.modelSwap.modelImageTooLarge":
    "La foto del modelo supera el límite máximo de 5 MB.",
  "api.modelSwap.geminiEngine": "Compositor Visual Gemini 2.5",
  "api.modelSwap.fallbackEngine": "Compositor Canvas Local",
  "api.modelSwap.processError":
    "No se pudo procesar la colocación del modelo en escena.",
  "api.voice.invalidLength":
    "El texto del guion debe tener entre 1 y 1,500 caracteres.",
  "api.voice.invalidReferenceAudio":
    "El audio de referencia debe ser un URI de datos base64 de audio válido (.ogg, .opus, .mp3, .wav, .m4a, .aac, .webm).",
  "api.voice.referenceAudioTooLarge":
    "El audio de referencia supera el límite máximo de 3 MB.",
  "api.voice.engine.f5tts": "F5-TTS (Clonación MIT)",
  "api.voice.engine.kokoro": "Kokoro-82M (Apache-2.0)",
  "api.voice.engine.geminiTts": "Gemini 2.5 TTS Neural",
  "api.voice.demoFallbackEngine":
    "Respaldo Demo (Agrega FAL_KEY o GEMINI_API_KEY para Voz Neural Real)",
  "api.voice.processError":
    "No se pudo procesar la solicitud de síntesis de voz.",
  "api.admin.unauthenticated": "Se requiere autenticación de administrador.",
  "api.admin.authenticated": "Sesión de administrador verificada.",
  "api.admin.loggedOut": "Sesión de administrador cerrada.",
  "api.admin.missingCode": "Por favor proporciona un código de acceso.",
  "api.admin.invalidAdminKey": "Contraseña maestra de administrador inválida.",
  "api.admin.invalidAccessCode": "Código de Pase Pro u Operador inválido.",
  "api.admin.tooManyAttempts":
    "Demasiados intentos. Intenta de nuevo en 10 minutos.",
  "api.admin.operatorGranted": "Acceso de operador concedido.",
  "api.admin.proGranted": "Acceso de Pase Pro concedido.",
  "api.admin.invalidRequest":
    "Solicitud de verificación de administrador inválida.",
  "api.admin.payloadTooLarge":
    "El cuerpo de la solicitud de administrador excede el límite permitido.",
  "api.admin.invalidKeyLength":
    "La clave {keyName} debe tener más de 5 caracteres (o CLEAR).",
  "api.admin.missingServerKey":
    "Error de configuración del servidor: ADMIN_MASTER_KEY es obligatoria en producción.",
  "api.admin.noKeysProvided": "No se enviaron actualizaciones de claves.",
  "api.admin.vaultUpdated": "Bóveda de claves API cifrada y actualizada.",
  "api.admin.vaultCleared": "Cookie de bóveda de claves API eliminada.",
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  es,
};

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslationVars
): string {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  const template = dict[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key];
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = vars[token];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

export function resolveApiLocale(reqLocale?: unknown): Locale {
  if (typeof reqLocale !== "string") {
    return DEFAULT_LOCALE;
  }

  const normalized = reqLocale.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }

  const primary = normalized.split(",")[0]?.split(";")[0]?.trim() || "";
  if (
    primary === "es" ||
    primary.startsWith("es-") ||
    primary.startsWith("es_")
  ) {
    return "es";
  }
  if (
    primary === "en" ||
    primary.startsWith("en-") ||
    primary.startsWith("en_")
  ) {
    return "en";
  }

  return DEFAULT_LOCALE;
}

export function resolveRequestLocale(
  request: Request,
  bodyLocale?: unknown
): Locale {
  if (typeof bodyLocale === "string" && bodyLocale.trim().length > 0) {
    return resolveApiLocale(bodyLocale);
  }

  const headerLocale = request.headers.get(LOCALE_HEADER);
  if (headerLocale && headerLocale.trim().length > 0) {
    return resolveApiLocale(headerLocale);
  }

  const acceptLang = request.headers.get("accept-language");
  if (acceptLang && acceptLang.trim().length > 0) {
    return resolveApiLocale(acceptLang);
  }

  return DEFAULT_LOCALE;
}

export function getStoredClientLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "es") {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_LOCALE;
}
