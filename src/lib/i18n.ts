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
  "page.brandSubtitle": "Content & AI Voice Workstation",
  "page.licenseBadge": "MIT",
  "page.licenseTitle": "MIT Commercial-Safe License",
  "page.badgeOperator": "Operator",
  "page.badgeProPass": "Pro Pass",
  "page.creditsBadge": "{remaining}/{max} credits",
  "page.adminLink": "Admin",
  "page.adminTitle": "Open Admin Control Center",
  "page.upgradeButton": "Upgrade",
  "page.installAppButton": "Install App",
  "page.installAcceptedToast":
    "Installing Vokaloom Studio as a standalone app...",
  "page.installHintToast":
    "Install PWA: Click the Install icon in your browser's address bar (or 'Add to Home Screen' on iOS/Android) to run Vokaloom Studio as a standalone app.",
  "page.vipUnlockedToast":
    "VIP Access unlocked via invite link! Unlimited generations active.",
  "page.tabBackgrounds": "Aesthetic Backgrounds (15x)",
  "page.tabVoice": "Realistic Voice Studio",
  "page.engineStrip":
    "Engines: Pexels · Unsplash · Gemini 2.5 · Kokoro-82M · F5-TTS",
  "page.footerNotice":
    "Vokaloom Studio · MIT Commercial License · Stateless Client-Side Media Pipeline",

  // Background Finder (src/components/background-finder.tsx)
  "bg.inspectorTitle": "Aesthetic Inspector",
  "bg.inspectorBadge": "{count}x · 9:16 HD",
  "bg.batch.label": "Batch Mode",
  "bg.batch.fast5": "5x Mobile Fast",
  "bg.batch.full15": "15x Full Pack",
  "bg.batch.short5": "5x",
  "bg.batch.short15": "15x",
  "bg.vibePresets": "Vibe Presets",
  "bg.vibe.luxuryTravel": "Luxury Travel",
  "bg.vibe.candidLifestyle": "Candid Lifestyle",
  "bg.vibe.minimalistCafe": "Minimalist Cafe",
  "bg.vibe.urbanStreetPov": "Urban Street POV",
  "bg.vibe.natureSunset": "Nature Sunset",
  "bg.sceneLabel": "Scene / Keyword Modifier",
  "bg.searchPlaceholder": "Mediterranean balcony morning sunlight...",
  "bg.clearSearchAria": "Clear search query",
  "bg.generateButton": "Generate {count} Backgrounds",
  "bg.shuffleButton": "Shuffle #{page}",
  "bg.shuffleTitle": "Load {count} more photos (Page #{page})",
  "bg.referenceTitle": "Boss Reference Matcher",
  "bg.uploadReference": "Upload reference image",
  "bg.uploadReferenceHint": "JPG, PNG, WEBP · auto-matches {count} photos",
  "bg.referencePreviewAlt": "Boss Reference Preview",
  "bg.referenceFallbackName": "Reference Image",
  "bg.removeReferenceTitle": "Remove reference image",
  "bg.visionDna": "Gemini 2.5 Vision DNA:",
  "bg.extractedDna": "Extracted Search DNA:",
  "bg.model.title": "My Model Reference",
  "bg.model.badge": "9:16 Swap",
  "bg.model.uploadTitle": "Upload your model photo",
  "bg.model.uploadHint": "Saved locally · used by \"Place Model\"",
  "bg.model.previewAlt": "Saved Model Reference Preview",
  "bg.model.fallbackName": "Model Photo",
  "bg.model.savedStatus": "Saved locally for 1-tap scene placement",
  "bg.model.removeTitle": "Remove saved model photo",
  "bg.placeModelButton": "Place Model",
  "bg.placeModelShort": "Model",
  "bg.placeModelTitle": "Place my model into #{index}",
  "bg.placeModelAria": "Place my model into scene #{index} by {photographer}",
  "bg.swapModal.title": "Model Scene Compositor",
  "bg.swapModal.subtitle":
    "9:16 vertical composite ready for Instagram Reels & Stories.",
  "bg.swapModal.generating": "Compositing model into 9:16 scene...",
  "bg.swapModal.generatingHint":
    "Matching lighting, shadows & candid smartphone realism",
  "bg.swapModal.fallbackNote":
    "Local canvas preview generated. Add GEMINI_API_KEY in /admin for full neural relighting.",
  "bg.swapModal.downloadButton": "Download 9:16 Composite",
  "bg.swapModal.previewAlt": "Composited 9:16 scene preview",
  "bg.resolvedLabel": "Resolved:",
  "bg.canvasTitle": "Aesthetic Canvas:",
  "bg.pageBadge": "Page #{page}",
  "bg.downloadZipButton": "Download All (.ZIP)",
  "bg.zipPackaging": "Packaging {count} vertical HD photos into",
  "bg.loadingOverlay": "Curating {count} vertical backgrounds...",
  "bg.sourceCurated": "curated",
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
  "bg.toast.downloadSingleError": "Could not download photo.",
  "bg.toast.generateFirst": "Generate a batch of backgrounds first.",
  "bg.toast.downloadedZip":
    "Downloaded vokaloom-backgrounds.zip ({count} HD photos)!",
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

  // Voice Studio (src/components/voice-studio.tsx)
  "voice.configTitle": "Script & Neural Voice Configuration",
  "voice.configSubtitle":
    "Write or paste your Spanish or English script, select a neural voice, or expand zero-shot cloning.",
  "voice.licenseBadge": "Apache-2.0 & MIT",
  "voice.templatesLabel": "Quick Viral Hook Templates",
  "voice.sample.sofiaEs": "ES · Lifestyle & Travel Hook",
  "voice.sample.mateoEs": "ES · Business & Brand Hook",
  "voice.sample.abellaEn": "EN · Creator Reel Hook",
  "voice.scriptLabel": "Voiceover Script",
  "voice.readTime": "~{seconds}s read",
  "voice.charCount": "{count} / {max} chars",
  "voice.scriptPlaceholder": "Paste your Spanish or English reel script here...",
  "voice.presetLabel": "Neural Voice Preset (Kokoro-82M)",
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
  "voice.cloneSectionLabel": "Zero-Shot Voice Cloning (MIT F5-TTS)",
  "voice.cloneToggleLabel": "Clone Custom Voice",
  "voice.toggleOn": "ON",
  "voice.toggleOff": "OFF",
  "voice.dropzoneTitle":
    "Drop or select WhatsApp voice note (.OGG, .MP3, .WAV · 10–20s)",
  "voice.dropzoneHint":
    "Powered by MIT F5-TTS · 100% commercial-safe zero-shot cloning",
  "voice.sampleReady": "Ready for zero-shot F5-TTS synthesis",
  "voice.removeAudioAria": "Remove reference audio sample",
  "voice.synthesizingButton": "Synthesizing Neural Voiceover...",
  "voice.generateCloneButton": "Generate Zero-Shot Cloned Voiceover (F5-TTS)",
  "voice.generatePresetButton": "Generate Voiceover ({name})",
  "voice.cloneVoiceLabel": "Zero-Shot Clone ({name})",
  "voice.outputTitle": "Master Audio Output",
  "voice.outputSubtitle":
    "Inspect waveform, preview playback, and export broadcast audio.",
  "voice.licenseMitSafe": "MIT Safe",
  "voice.playAria": "Play voiceover",
  "voice.pauseAria": "Pause voiceover",
  "voice.waveformAria": "Interactive audio waveform scrubber",
  "voice.seekAria": "Seek to {percent}%",
  "voice.downloadAudioButton": "Download Broadcast Audio",
  "voice.emptyTitle": "No active voiceover output",
  "voice.emptyDescBefore": "Configure your script and click",
  "voice.emptyDescAction": "Generate Voiceover",
  "voice.emptyDescAfter": "to preview audio.",
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
  "paywall.title": "Unlimited Aesthetic Batches & AI Voiceovers",
  "paywall.description":
    "Unlock full agency production speed with unlimited 15-image vertical batches, Gemini Vision aesthetic matching, and neural Spanish & English voice synthesis.",
  "paywall.planName": "All-In-One Fulfillment Pass",
  "paywall.planSubtitle": "Commercial & Agency License",
  "paywall.perMonthShort": "/ mo",
  "paywall.approxCopPerMonth": "~{priceCop} · mo",
  "paywall.benefit1":
    "Unlimited 15-Image Aesthetic Batches (9:16 Vertical HD + ZIP Export)",
  "paywall.benefit2":
    "Unlimited Boss Reference Image Matching (Gemini 2.5 Flash Vision)",
  "paywall.benefit3":
    "Unlimited Realistic AI Voiceovers (Spanish & English Neural TTS)",
  "paywall.benefit4":
    "Unlimited Zero-Shot Custom Voice Cloning (10–20s Audio via MIT F5-TTS)",
  "paywall.benefit5": "100% Commercial & Agency Service-Fulfillment License",
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
  "admin.vault.toast.cleared":
    "Cleared the HttpOnly API Keys Vault cookie.",
  "admin.vault.toast.saveError": "Could not update API Keys Vault.",
  "admin.vault.toast.clearError": "Could not clear API Keys Vault.",

  // API Route Messages
  "api.bg.invalidProxyOrigin": "Invalid or disallowed proxyUrl origin.",
  "api.bg.upstreamStatus": "Upstream image returned {status}",
  "api.bg.proxyFailed": "Failed to proxy image download.",
  "api.bg.fallbackNotice":
    "Curated fallback batch served because live search encountered an issue.",
  "api.modelSwap.missingInputs":
    "Both model reference image and background URL are required.",
  "api.modelSwap.invalidBackgroundOrigin":
    "Invalid or disallowed backgroundUrl origin.",
  "api.modelSwap.fallbackEngine": "Client Canvas Compositor",
  "api.modelSwap.processError": "Unable to process model scene placement.",
  "api.voice.invalidLength":
    "Script text must be between 1 and 1,500 characters in length.",
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
  "api.admin.invalidKeyLength":
    "Key {keyName} must be longer than 5 characters (or CLEAR).",
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
  "page.brandSubtitle": "Estación de Contenido y Voz IA",
  "page.licenseBadge": "MIT",
  "page.licenseTitle": "Licencia Comercial Abierta MIT",
  "page.badgeOperator": "Operador",
  "page.badgeProPass": "Pase Pro",
  "page.creditsBadge": "{remaining}/{max} créditos",
  "page.adminLink": "Admin",
  "page.adminTitle": "Abrir Centro de Control Admin",
  "page.upgradeButton": "Mejorar",
  "page.installAppButton": "Instalar App",
  "page.installAcceptedToast":
    "Instalando Vokaloom Studio como aplicación independiente...",
  "page.installHintToast":
    "Instalar PWA: Haz clic en el ícono de Instalar en la barra de direcciones de tu navegador (o 'Añadir a pantalla de inicio' en iOS/Android) para ejecutar Vokaloom Studio como aplicación independiente.",
  "page.vipUnlockedToast":
    "¡Acceso VIP desbloqueado mediante enlace de invitación! Generaciones ilimitadas activas.",
  "page.tabBackgrounds": "Fondos Estéticos (15x)",
  "page.tabVoice": "Estudio de Voz Realista",
  "page.engineStrip":
    "Motores: Pexels · Unsplash · Gemini 2.5 · Kokoro-82M · F5-TTS",
  "page.footerNotice":
    "Vokaloom Studio · Licencia Comercial MIT · Flujo Multimedia Sin Almacenamiento en Servidor",

  // Background Finder (src/components/background-finder.tsx)
  "bg.inspectorTitle": "Inspector Estético",
  "bg.inspectorBadge": "{count}x · 9:16 HD",
  "bg.batch.label": "Modo de Lote",
  "bg.batch.fast5": "5x Móvil Rápido",
  "bg.batch.full15": "15x Pack Completo",
  "bg.batch.short5": "5x",
  "bg.batch.short15": "15x",
  "bg.vibePresets": "Estilos Predefinidos",
  "bg.vibe.luxuryTravel": "Viajes de Lujo",
  "bg.vibe.candidLifestyle": "Estilo de Vida Real",
  "bg.vibe.minimalistCafe": "Café Minimalista",
  "bg.vibe.urbanStreetPov": "Calle Urbana POV",
  "bg.vibe.natureSunset": "Atardecer Natural",
  "bg.sceneLabel": "Escena / Palabra Clave",
  "bg.searchPlaceholder": "Balcón mediterráneo luz de mañana...",
  "bg.clearSearchAria": "Limpiar consulta de búsqueda",
  "bg.generateButton": "Generar {count} Fondos",
  "bg.shuffleButton": "Mezclar #{page}",
  "bg.shuffleTitle": "Cargar {count} fotos más (Página #{page})",
  "bg.referenceTitle": "Coincidencia por Referencia",
  "bg.uploadReference": "Subir imagen de referencia",
  "bg.uploadReferenceHint": "JPG, PNG, WEBP · empareja {count} fotos al instante",
  "bg.referencePreviewAlt": "Vista previa de imagen de referencia",
  "bg.referenceFallbackName": "Imagen de referencia",
  "bg.removeReferenceTitle": "Quitar imagen de referencia",
  "bg.visionDna": "ADN Gemini 2.5 Vision:",
  "bg.extractedDna": "ADN de Búsqueda Extraído:",
  "bg.model.title": "Mi Modelo de Referencia",
  "bg.model.badge": "Swap 9:16",
  "bg.model.uploadTitle": "Sube foto de tu modelo",
  "bg.model.uploadHint": "Guardada localmente · para \"Colocar Modelo\"",
  "bg.model.previewAlt": "Vista previa del modelo guardado",
  "bg.model.fallbackName": "Foto de Modelo",
  "bg.model.savedStatus": "Guardada localmente para colocar en 1 toque",
  "bg.model.removeTitle": "Quitar foto de modelo guardada",
  "bg.placeModelButton": "Colocar Modelo",
  "bg.placeModelShort": "Modelo",
  "bg.placeModelTitle": "Colocar mi modelo en #{index}",
  "bg.placeModelAria": "Colocar mi modelo en escena #{index} de {photographer}",
  "bg.swapModal.title": "Compositor de Modelo en Escena",
  "bg.swapModal.subtitle":
    "Composición vertical 9:16 lista para Instagram Reels e Historias.",
  "bg.swapModal.generating": "Integrando modelo en escena 9:16...",
  "bg.swapModal.generatingHint":
    "Igualando iluminación, sombras y realismo fotográfico",
  "bg.swapModal.fallbackNote":
    "Vista previa local generada en Canvas. Agrega GEMINI_API_KEY en /admin para reiluminación neural completa.",
  "bg.swapModal.downloadButton": "Descargar Composición 9:16",
  "bg.swapModal.previewAlt": "Vista previa compuesta 9:16",
  "bg.resolvedLabel": "Consulta:",
  "bg.canvasTitle": "Lienzo Estético:",
  "bg.pageBadge": "Página #{page}",
  "bg.downloadZipButton": "Descargar Todo (.ZIP)",
  "bg.zipPackaging": "Empaquetando {count} fotos verticales HD en",
  "bg.loadingOverlay": "Curando {count} fondos verticales...",
  "bg.sourceCurated": "curado",
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
  "bg.toast.downloadSingleError": "No se pudo descargar la foto.",
  "bg.toast.generateFirst": "Genera primero un lote de fondos.",
  "bg.toast.downloadedZip":
    "¡Descargado vokaloom-backgrounds.zip ({count} fotos HD)!",
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

  // Voice Studio (src/components/voice-studio.tsx)
  "voice.configTitle": "Guion y Configuración de Voz Neural",
  "voice.configSubtitle":
    "Escribe o pega tu guion en español o inglés, elige una voz neural o activa la clonación zero-shot.",
  "voice.licenseBadge": "Apache-2.0 y MIT",
  "voice.templatesLabel": "Plantillas Rápidas de Ganchos Virales",
  "voice.sample.sofiaEs": "ES · Hook Estilo de Vida y Viajes",
  "voice.sample.mateoEs": "ES · Hook Negocios y Marca",
  "voice.sample.abellaEn": "EN · Hook Creador en Inglés",
  "voice.scriptLabel": "Guion de Locución",
  "voice.readTime": "~{seconds}s lect.",
  "voice.charCount": "{count} / {max} car.",
  "voice.scriptPlaceholder":
    "Pega aquí tu guion para reel en español o inglés...",
  "voice.presetLabel": "Voz Neural Predefinida (Kokoro-82M)",
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
  "voice.cloneSectionLabel": "Clonación de Voz Zero-Shot (MIT F5-TTS)",
  "voice.cloneToggleLabel": "Clonar Voz Personalizada",
  "voice.toggleOn": "ACTIVO",
  "voice.toggleOff": "INACTIVO",
  "voice.dropzoneTitle":
    "Sube o arrastra nota de voz de WhatsApp (.OGG, .MP3, .WAV · 10–20s)",
  "voice.dropzoneHint":
    "Impulsado por MIT F5-TTS · clonación zero-shot 100% apta para uso comercial",
  "voice.sampleReady": "Lista para síntesis zero-shot con F5-TTS",
  "voice.removeAudioAria": "Quitar muestra de audio de referencia",
  "voice.synthesizingButton": "Sintetizando locución neural...",
  "voice.generateCloneButton":
    "Generar Locución Clonada Zero-Shot (F5-TTS)",
  "voice.generatePresetButton": "Generar Locución ({name})",
  "voice.cloneVoiceLabel": "Clon Zero-Shot ({name})",
  "voice.outputTitle": "Salida de Audio Maestra",
  "voice.outputSubtitle":
    "Inspecciona la onda, previsualiza la reproducción y exporta audio listo para publicar.",
  "voice.licenseMitSafe": "MIT Comercial",
  "voice.playAria": "Reproducir locución",
  "voice.pauseAria": "Pausar locución",
  "voice.waveformAria": "Control interactivo de onda de audio",
  "voice.seekAria": "Ir al {percent}%",
  "voice.downloadAudioButton": "Descargar Audio Maestro",
  "voice.emptyTitle": "Sin locución activa",
  "voice.emptyDescBefore": "Configura tu guion y haz clic en",
  "voice.emptyDescAction": "Generar Locución",
  "voice.emptyDescAfter": "para previsualizar el audio.",
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
  "paywall.title": "Lotes Estéticos y Locuciones IA Ilimitadas",
  "paywall.description":
    "Desbloquea velocidad de producción de agencia con lotes verticales ilimitados de 15 imágenes, emparejamiento visual Gemini Vision y síntesis de voz neural en español e inglés.",
  "paywall.planName": "Pase Todo-en-Uno de Producción",
  "paywall.planSubtitle": "Licencia Comercial y de Agencia",
  "paywall.perMonthShort": "/ mes",
  "paywall.approxCopPerMonth": "~{priceCop} · mes",
  "paywall.benefit1":
    "Lotes ilimitados de 15 imágenes estéticas (HD vertical 9:16 + exportación ZIP)",
  "paywall.benefit2":
    "Coincidencia ilimitada por imagen de referencia (Gemini 2.5 Flash Vision)",
  "paywall.benefit3":
    "Locuciones IA realistas ilimitadas (TTS neural en español e inglés)",
  "paywall.benefit4":
    "Clonación zero-shot de voz personalizada ilimitada (audio 10–20s con MIT F5-TTS)",
  "paywall.benefit5": "Licencia 100% comercial y apta para servicios de agencia",
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
  "admin.vault.toast.cleared":
    "Cookie cifrada de la bóveda API vaciada.",
  "admin.vault.toast.saveError":
    "No se pudo actualizar la bóveda de claves API.",
  "admin.vault.toast.clearError":
    "No se pudo vaciar la bóveda de claves API.",

  // API Route Messages
  "api.bg.invalidProxyOrigin": "Origen de proxyUrl no válido o no permitido.",
  "api.bg.upstreamStatus": "La imagen de origen devolvió el estado {status}",
  "api.bg.proxyFailed": "No se pudo obtener la imagen a través del proxy.",
  "api.bg.fallbackNotice":
    "Se sirvió el lote curado de respaldo porque la búsqueda en vivo tuvo un problema.",
  "api.modelSwap.missingInputs":
    "Se requieren tanto la foto del modelo como la URL de fondo.",
  "api.modelSwap.invalidBackgroundOrigin":
    "Origen de backgroundUrl no válido o no permitido.",
  "api.modelSwap.fallbackEngine": "Compositor Canvas Local",
  "api.modelSwap.processError":
    "No se pudo procesar la colocación del modelo en escena.",
  "api.voice.invalidLength":
    "El texto del guion debe tener entre 1 y 1,500 caracteres.",
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
  "api.admin.invalidKeyLength":
    "La clave {keyName} debe tener más de 5 caracteres (o CLEAR).",
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
