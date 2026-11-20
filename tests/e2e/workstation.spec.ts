import { expect, test } from "@playwright/test";

test.describe("Vokaloom Studio Workbench E2E", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("renders desktop (1440x900) and mobile (390x844) with zero horizontal overflow in EN and ES", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const homeResponse = await page.goto("/");
    expect(homeResponse?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(homeResponse?.headers()["x-frame-options"]).toBe("DENY");
    expect(homeResponse?.headers()["content-security-policy"]).toContain(
      "default-src 'self'"
    );

    const manifestRes = await page.request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as {
      icons?: Array<{ src: string; type?: string }>;
    };
    expect(
      manifestJson.icons?.some(
        (icon) => icon.src === "/icons/icon-192.png" && icon.type === "image/png"
      )
    ).toBe(true);
    expect((await page.request.get("/icons/icon-192.png")).status()).toBe(200);
    expect((await page.request.get("/icons/icon-512.png")).status()).toBe(200);
    expect(
      (await page.request.get("/icons/apple-touch-icon.png")).status()
    ).toBe(200);

    await expect(page.getByTestId("tab-backgrounds")).toBeVisible();
    await expect(page.getByTestId("tab-voice")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("lang-en")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const desktopEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEnOverflow).toBe(false);

    // Toggle ES on desktop and check zero overflow + <html lang="es">
    await page.getByTestId("lang-es").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("lang-es")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const desktopEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEsOverflow).toBe(false);

    // Check mobile viewport (390x844) in ES then switch back to EN
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEsOverflow).toBe(false);

    await page.getByTestId("lang-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("lang-en")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const mobileEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEnOverflow).toBe(false);
  });

  test("toggles 5x / 15x batch mode, frame selection, and Safe Zones guide toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Wait for initial 15-card showcase preload and ensure no duplicate batch toggle in inspector
    await expect(page.getByTestId("bg-card")).toHaveCount(15, {
      timeout: 15000,
    });
    await expect(page.getByTestId("canvas-count")).toHaveText("15/15");
    await expect(page.locator('aside [data-testid="batch-5"]')).toHaveCount(0);

    // Multi-frame selection & dynamic ZIP clear control
    const check1 = page.getByTestId("select-frame-1");
    const check2 = page.getByTestId("select-frame-2");
    await check1.click();
    await check2.click();
    await expect(check1).toHaveAttribute("aria-checked", "true");
    await expect(check2).toHaveAttribute("aria-checked", "true");

    const clearBtn = page.getByTestId("btn-clear-selection");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(clearBtn).toBeHidden();
    await expect(check1).toHaveAttribute("aria-checked", "false");

    // 9:16 Safe Zones overlay toggle
    const safeZonesBtn = page.getByTestId("btn-safe-zones");
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(0);

    await safeZonesBtn.click();
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(15);

    await safeZonesBtn.click();
    await expect(safeZonesBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("safe-zone-guide")).toHaveCount(0);

    // Switch to 5x batch mode and fetch 5 photos (consuming 1 of 3 credits)
    await page.getByTestId("batch-5").click();
    await expect(page.getByTestId("batch-5")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("batch-15")).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await page.getByTestId("btn-generate").click();
    await expect(page.getByTestId("bg-card")).toHaveCount(5, {
      timeout: 15000,
    });
    await expect(page.getByTestId("canvas-count")).toHaveText("5/5");
    await expect(page.getByTestId("status-quota")).toContainText(/^2\/3/);
  });

  test("switches tabs, synthesizes voiceover with unified custom transport, and logs to Session History", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const voiceTab = page.getByTestId("tab-voice");
    await voiceTab.click();
    await expect(voiceTab).toHaveAttribute("aria-selected", "true");

    // Disable zero-shot clone mode so preset Kokoro-82M / fallback synthesizes immediately
    const cloneToggle = page.getByTestId("btn-clone-toggle");
    await expect(cloneToggle).toHaveAttribute("aria-expanded", "true");
    await cloneToggle.click();
    await expect(cloneToggle).toHaveAttribute("aria-expanded", "false");

    await page.getByTestId("btn-synthesize").click();
    await expect(page.getByTestId("voice-history-count")).toHaveText("(1/10)", {
      timeout: 15000,
    });

    // Confirm unified custom transport deck (zero native <audio controls>)
    await expect(page.locator("audio[controls]")).toHaveCount(0);
    const audioEl = page.locator("audio");
    await expect(audioEl).toHaveCount(1);
    await expect(audioEl).toHaveAttribute("src", /.+/);
    await expect(
      page.locator('[data-testid="voice-waveform"] button')
    ).toHaveCount(48);

    const speedBtn = page.getByTestId("btn-speed-toggle");
    await expect(speedBtn).toHaveText("1.0x");
    await speedBtn.click();
    await expect(speedBtn).toHaveText("1.15x");

    const muteBtn = page.getByTestId("btn-mute-toggle");
    expect(await audioEl.evaluate((el: HTMLAudioElement) => el.muted)).toBe(
      false
    );
    await muteBtn.click();
    expect(await audioEl.evaluate((el: HTMLAudioElement) => el.muted)).toBe(
      true
    );

    await expect(page.getByTestId("voice-timecode")).toBeVisible();
    await expect(page.getByTestId("btn-download-audio")).toBeVisible();
    await expect(page.getByTestId("btn-replay-0")).toBeVisible();
  });

  test("opens Upgrade modal, unlocks pro_client Pro Pass without exposing /admin link, and enforces /admin auth gate", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByTestId("btn-upgrade").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("paywall-title")).toBeVisible();

    // Verify currency selector toggles COP vs USD headline cleanly
    await expect(page.getByTestId("currency-cop")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("paywall-price")).toHaveText("$60,000 COP");

    await page.getByTestId("currency-usd").click();
    await expect(page.getByTestId("currency-usd")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("paywall-price")).toHaveText("$15 USD");

    // Activate pro_client code and verify strict role isolation
    const codeInput = page.getByTestId("input-access-code");
    await expect(codeInput).toBeVisible();
    await codeInput.fill("VOKALOOM-PRO-2026");
    await page.getByTestId("btn-unlock-code").click();

    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId("badge-pro-pass")).toBeVisible();
    await expect(page.getByTestId("btn-upgrade")).toHaveCount(0);
    await expect(page.getByTestId("link-admin")).toHaveCount(0);
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

    const storedQuota = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("vokaloom_quota_v1") || "{}")
    );
    expect(storedQuota.role).toBe("pro_client");
    expect(storedQuota.isPro).toBe(true);
    expect(storedQuota.isOperator).toBe(false);

    // /admin must still require operator authentication even with pro_client entitlement cookie
    await page.goto("/admin");
    await expect(page.locator("#admin-master-password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("renders API Quota Meter & low-quota advisory banner without overflow in EN/ES and handles 429 cap cleanly without opening paywall", async ({
    page,
  }) => {
    const lowSnapshot = {
      window: "lifetime",
      paidAiPaused: false,
      stockLow: false,
      hasAnyHardCap: true,
      resources: {
        image: { used: 0, limit: 1, remaining: 1, status: "low", resetAt: null },
        audio: { used: 0, limit: 1, remaining: 1, status: "low", resetAt: null },
        vision: {
          used: 0,
          limit: null,
          remaining: null,
          status: "healthy",
          resetAt: null,
        },
      },
      advisories: [
        {
          code: "image_cap_low",
          severity: "warning",
          resource: "image",
          remaining: 1,
          limit: 1,
        },
        {
          code: "audio_cap_low",
          severity: "warning",
          resource: "audio",
          remaining: 1,
          limit: 1,
        },
      ],
      updatedAt: Date.now(),
    };

    const exhaustedSnapshot = {
      ...lowSnapshot,
      resources: {
        ...lowSnapshot.resources,
        audio: {
          used: 1,
          limit: 1,
          remaining: 0,
          status: "exhausted",
          resetAt: null,
        },
      },
      advisories: [
        {
          code: "image_cap_low",
          severity: "warning",
          resource: "image",
          remaining: 1,
          limit: 1,
        },
        {
          code: "audio_cap_exhausted",
          severity: "critical",
          resource: "audio",
          remaining: 0,
          limit: 1,
        },
      ],
    };

    await page.route("**/api/quota-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(lowSnapshot),
      });
    });

    await page.route("**/api/voice", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Audio AI generation hard cap reached (1/1).",
          capReached: true,
          resource: "audio",
          reason: "hard_cap",
          budget: exhaustedSnapshot,
        }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByTestId("quota-meter")).toBeVisible();
    await expect(page.getByTestId("quota-meter-image")).toContainText("1/1");
    await expect(page.getByTestId("quota-meter-audio")).toContainText("1/1");
    await expect(page.getByTestId("quota-advisory-banner")).toBeVisible();

    const desktopEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopEnOverflow).toBe(false);

    // Check Spanish + mobile 390x844 overflow with Quota Meter visible
    await page.getByTestId("lang-es").click();
    await expect(page.getByTestId("quota-advisory-banner")).toContainText(
      /Cuota baja/i
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEsOverflow).toBe(false);

    await page.getByTestId("lang-en").click();
    const mobileEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEnOverflow).toBe(false);

    // Trigger 429 cap response on Voice Studio and verify meter updates without opening Paywall modal
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("tab-voice").click();
    await page.getByTestId("btn-clone-toggle").click();
    await page.getByTestId("btn-synthesize").click();

    await expect(page.getByTestId("quota-meter-audio")).toContainText("0/1");
    await expect(page.getByTestId("quota-advisory-banner")).toContainText(
      /Audio AI cap reached/i
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("renders Admin Card 06 telemetry, durable warning badge, pause toggle & reset caps without overflow in EN/ES", async ({
    page,
  }) => {
    let paused = false;
    let imageUsed = 1;

    const buildTelemetry = () => ({
      storage: {
        backend: "memory",
        durable: false,
        durableStoreWarning: true,
        requireDurableStore: false,
      },
      config: {
        window: "24h",
        disablePaidModelFallback: true,
        lowQuotaWarnRatio: 0.2,
        falLowBalanceWarnUsd: 5,
        falMinBalanceUsd: 1,
        proClientDailyImageLimit: 25,
        proClientDailyAudioLimit: 100,
        proClientDailyVisionLimit: 50,
        usingDedicatedSigningSecret: false,
      },
      emergencyPause: {
        active: paused,
        envForced: false,
        runtimePaused: paused,
      },
      hardCaps: {
        image: {
          used: imageUsed,
          limit: 1,
          remaining: Math.max(0, 1 - imageUsed),
          status: imageUsed >= 1 ? "exhausted" : "low",
          resetAt: null,
        },
        audio: {
          used: 0,
          limit: 1,
          remaining: 1,
          status: "low",
          resetAt: null,
        },
        vision: {
          used: 0,
          limit: null,
          remaining: null,
          status: "healthy",
          resetAt: null,
        },
      },
      fal: {
        configured: true,
        billingKeyConfigured: true,
        balance: {
          currentBalance: 14.75,
          currency: "USD",
          permissionRestricted: false,
          fetchedAt: Date.now(),
        },
        lowBalanceWarning: false,
        belowMinFloor: false,
        circuitBreaker: null,
      },
      stock: {
        pexels: {
          provider: "pexels",
          limit: 200,
          remaining: 192,
          resetAt: Date.now() + 3600_000,
          rateLimited: false,
          updatedAt: Date.now(),
        },
        unsplash: {
          provider: "unsplash",
          limit: 50,
          remaining: 45,
          resetAt: null,
          rateLimited: false,
          updatedAt: Date.now(),
        },
      },
      gemini: {
        configured: true,
        circuitBreaker: null,
        usage: {
          image: {
            calls: 1,
            promptTokens: 120,
            candidatesTokens: 1290,
            totalTokens: 1410,
            estimatedUsd: 0.039,
            lastCallAt: Date.now(),
          },
          audio: {
            calls: 0,
            promptTokens: 0,
            candidatesTokens: 0,
            totalTokens: 0,
            estimatedUsd: 0,
            lastCallAt: null,
          },
          vision: {
            calls: 0,
            promptTokens: 0,
            candidatesTokens: 0,
            totalTokens: 0,
            estimatedUsd: 0,
            lastCallAt: null,
          },
        },
        totals: {
          calls: 1,
          promptTokens: 120,
          candidatesTokens: 1290,
          totalTokens: 1410,
          estimatedUsd: 0.039,
        },
      },
      publicSnapshot: {
        window: "24h",
        paidAiPaused: paused,
        stockLow: false,
        hasAnyHardCap: true,
        resources: {
          image: {
            used: imageUsed,
            limit: 1,
            remaining: Math.max(0, 1 - imageUsed),
            status: imageUsed >= 1 ? "exhausted" : "low",
            resetAt: null,
          },
          audio: {
            used: 0,
            limit: 1,
            remaining: 1,
            status: "low",
            resetAt: null,
          },
          vision: {
            used: 0,
            limit: null,
            remaining: null,
            status: "healthy",
            resetAt: null,
          },
        },
        advisories: [],
        updatedAt: Date.now(),
      },
      generatedAt: Date.now(),
    });

    let businessConfig = {
      priceCop: "$60,000 COP",
      priceUsd: "$15 USD",
      maxTrialCredits: 3,
      checkoutUrlCop: "https://checkout.wompi.co/l/your_60000_cop_link",
      checkoutUrlUsd: "https://buy.stripe.com/your_15_usd_link",
    };

    await page.route("**/api/admin*", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: true,
            isProduction: true,
            config: businessConfig,
            health: {
              geminiConfigured: true,
              pexelsConfigured: true,
              unsplashConfigured: true,
              falConfigured: true,
              falBillingConfigured: true,
            },
            maskedKeys: {
              GEMINI_API_KEY: "AIza••••5678",
              FAL_KEY: "fal_••••1234",
              FAL_BILLING_KEY: "falb••••9012",
            },
            vipClientCodes: ["VOKALOOM-PRO-2026"],
            telemetry: buildTelemetry(),
          }),
        });
        return;
      }

      const body = JSON.parse(req.postData() || "{}") as {
        action?: string;
        config?: typeof businessConfig;
      };
      if (body.action === "update-business-config" && body.config) {
        businessConfig = { ...businessConfig, ...body.config };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            config: businessConfig,
          }),
        });
        return;
      }

      if (body.action === "admin-logout") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            loggedOut: true,
          }),
        });
        return;
      }

      if (body.action === "toggle-emergency-pause") {
        paused = !paused;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            paidAiPaused: paused,
            telemetry: buildTelemetry(),
          }),
        });
        return;
      }

      if (body.action === "reset-budget-caps") {
        imageUsed = 0;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            telemetry: buildTelemetry(),
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");

    const card6 = page.getByTestId("admin-card-telemetry");
    await expect(card6).toBeVisible();
    await expect(page.getByTestId("telemetry-durable-warning")).toBeVisible();
    await expect(
      page.getByTestId("telemetry-signing-secret-warning")
    ).toBeVisible();
    await expect(page.getByTestId("vault-prod-notice")).toBeVisible();
    await expect(page.getByTestId("telemetry-fal-panel")).toContainText("$14.75");
    await expect(page.getByTestId("telemetry-stock-panel")).toContainText(
      "192 / 200"
    );
    await expect(page.getByTestId("telemetry-gemini-panel")).toContainText(
      "1/1 used"
    );

    // Save server-backed commercial paywall config cleanly
    await page.locator("#admin-price-cop").fill("$75,000 COP");
    await page.getByTestId("btn-save-business-config").click();
    expect(businessConfig.priceCop).toBe("$75,000 COP");

    // Toggle Emergency Pause ON and Reset Caps
    await page.getByTestId("btn-toggle-emergency-pause").click();
    await expect(page.getByTestId("telemetry-paused-badge")).toBeVisible();

    await page.getByTestId("btn-reset-budget-caps").click();
    await expect(page.getByTestId("telemetry-gemini-panel")).toContainText(
      "0/1 used"
    );

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    // Check ES & 390x844 mobile viewport overflow
    await page.getByTestId("lang-es").click();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEsOverflow).toBe(false);

    await page.getByTestId("lang-en").click();
    const mobileEnOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileEnOverflow).toBe(false);

    // Verify Sign Out button returns to operator login gate
    await page.getByTestId("btn-admin-logout").click();
    await expect(page.locator("#admin-master-password")).toBeVisible();
  });
});
