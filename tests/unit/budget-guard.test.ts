import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import {
  fetchFalBalanceSnapshot,
  getAdminTelemetrySnapshot,
  getPublicQuotaSnapshot,
  isProviderCircuitBroken,
  reservePaidGenerationSlot,
  resetBudgetCaps,
  toggleEmergencyPause,
} from "@/lib/budget-guard";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ENTITLEMENT_COOKIE_NAME,
  signAdminSessionToken,
  signEntitlementToken,
} from "@/lib/server-secrets";
import { POST as modelSwapPost } from "@/app/api/model-swap/route";
import { POST as voicePost } from "@/app/api/voice/route";
import { POST as backgroundsPost } from "@/app/api/backgrounds/route";
import { GET as quotaStatusGet } from "@/app/api/quota-status/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/route";

const TINY_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TINY_WAV_BASE64 =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

let tempDir = "";
let ledgerPath = "";

function restoreEnvAndSetBase() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);

  ledgerPath = path.join(
    tempDir,
    `budget-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  process.env.VOKALOOM_BUDGET_LEDGER_PATH = ledgerPath;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.RATE_LIMIT_REDIS_REST_URL;
  delete process.env.RATE_LIMIT_REDIS_REST_TOKEN;

  process.env.ADMIN_MASTER_KEY = "UNIT-TEST-MASTER-KEY";
  process.env.VIP_CLIENT_CODES = "UNIT-VIP-PASS";
  process.env.GEMINI_API_KEY = "AIzaUnitTestGeminiKey123456";
  process.env.FAL_KEY = "fal_unit_test_secret_key_123456";
  process.env.PEXELS_API_KEY = "pexels_unit_test_key_123456";
  process.env.UNSPLASH_ACCESS_KEY = "unsplash_unit_test_key_123456";

  delete process.env.HARD_CAP_IMAGE_LIMIT;
  delete process.env.HARD_CAP_AUDIO_LIMIT;
  delete process.env.HARD_CAP_VISION_LIMIT;
  delete process.env.HARD_CAP_WINDOW;
  delete process.env.DISABLE_PAID_MODEL_FALLBACK;
  delete process.env.PAID_AI_EMERGENCY_PAUSE;
  delete process.env.BUDGET_REQUIRE_DURABLE_STORE;
  delete process.env.PRO_CLIENT_DAILY_IMAGE_LIMIT;
  delete process.env.PRO_CLIENT_DAILY_AUDIO_LIMIT;
  delete process.env.FAL_LOW_BALANCE_WARN_USD;
  delete process.env.FAL_MIN_BALANCE_USD;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
}

function makeOperatorCookieHeader(): string {
  const token = signAdminSessionToken();
  assert.ok(token);
  return `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function makeProClientCookieHeader(): string {
  const token = signEntitlementToken("pro_client");
  assert.ok(token);
  return `${ENTITLEMENT_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("Vokaloom Budget Guard, Telemetry & Hard-Cap Enforcement", () => {
  beforeEach(async () => {
    if (!tempDir) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vokaloom-budget-"));
    }
    restoreEnvAndSetBase();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  after(async () => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, ORIGINAL_ENV);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("enforces HARD_CAP_IMAGE_LIMIT=1 & HARD_CAP_AUDIO_LIMIT=1 even in Operator mode and persists across reloads", async () => {
    process.env.HARD_CAP_IMAGE_LIMIT = "1";
    process.env.HARD_CAP_AUDIO_LIMIT = "1";
    process.env.HARD_CAP_VISION_LIMIT = "1";
    process.env.HARD_CAP_WINDOW = "lifetime";

    let geminiImageCalls = 0;
    let geminiVisionCalls = 0;
    let falSubscribeCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("images.pexels.com/photos/123/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }

      if (url.includes("api.pexels.com/v1/search")) {
        return new Response(
          JSON.stringify({
            photos: [
              {
                id: 901,
                alt: "Coastal balcony",
                photographer: "Pexels Tester",
                src: {
                  portrait: "https://images.pexels.com/photos/901/portrait.jpg",
                  large2x: "https://images.pexels.com/photos/901/large2x.jpg",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-limit": "200",
              "x-ratelimit-remaining": "195",
              "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
            },
          }
        );
      }

      if (url.includes("api.unsplash.com/search/photos")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "u-902",
                alt_description: "Coffee aesthetic",
                user: { name: "Unsplash Tester" },
                urls: {
                  regular: "https://images.unsplash.com/photo-902-regular",
                  full: "https://images.unsplash.com/photo-902-full",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-limit": "50",
              "x-ratelimit-remaining": "48",
            },
          }
        );
      }

      if (url.includes("generativelanguage.googleapis.com")) {
        if (url.includes("gemini-2.5-flash-image")) {
          geminiImageCalls += 1;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "image/png",
                          data: TINY_PNG_BASE64.split(",")[1],
                        },
                      },
                    ],
                  },
                },
              ],
              usageMetadata: {
                promptTokenCount: 150,
                candidatesTokenCount: 1290,
                totalTokenCount: 1440,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        if (url.includes("gemini-2.5-flash:")) {
          geminiVisionCalls += 1;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [{ text: "warm coastal cafe vertical sunlight" }],
                  },
                },
              ],
              usageMetadata: {
                promptTokenCount: 300,
                candidatesTokenCount: 12,
                totalTokenCount: 312,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }

      if (url.includes("queue.fal.run")) {
        const method = (init?.method || "GET").toUpperCase();
        if (method === "POST") {
          falSubscribeCalls += 1;
          return new Response(
            JSON.stringify({
              request_id: "req-fal-1",
              response_url: "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-1",
              status_url:
                "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-1/status",
              cancel_url:
                "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-1/cancel",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/status/stream")) {
          return new Response(
            'data: {"status":"COMPLETED"}\n\n',
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }
          );
        }
        if (new URL(url).pathname.endsWith("/status")) {
          return new Response(JSON.stringify({ status: "COMPLETED" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            audio_url: "https://cdn.fal.media/unit-test-audio.mp3",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("api.fal.ai/v1/account/billing")) {
        return new Response(
          JSON.stringify({
            credits: { current_balance: 18.42, currency: "USD" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch in test: ${url}`);
    }) as typeof fetch;

    const operatorCookie = makeOperatorCookieHeader();

    // 1. Model swap Call 1 succeeds
    const swapRes1 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
          sceneTitle: "Beach balcony",
        }),
      })
    );
    assert.equal(swapRes1.status, 200);
    const swapData1 = (await swapRes1.json()) as {
      resultImageUrl: string;
      budget: {
        resources: {
          image: { used: number; limit: number; remaining: number; status: string };
        };
      };
    };
    assert.ok(swapData1.resultImageUrl.startsWith("data:image/png;base64,"));
    assert.equal(geminiImageCalls, 1);
    assert.equal(swapData1.budget.resources.image.used, 1);
    assert.equal(swapData1.budget.resources.image.remaining, 0);
    assert.equal(swapData1.budget.resources.image.status, "exhausted");

    // Verify ledger persisted on disk
    const persistedJson = JSON.parse(
      await fs.readFile(ledgerPath, "utf8")
    ) as { counters: { image: { used: number } } };
    assert.equal(persistedJson.counters.image.used, 1);

    // Simulate module reload via dynamic query-busted import of budget-guard
    const reloadedGuard = (await import(
      `@/lib/budget-guard?reload=${Date.now()}`
    )) as typeof import("@/lib/budget-guard");
    const reloadedSnap = await reloadedGuard.getPublicQuotaSnapshot();
    assert.equal(reloadedSnap.resources.image.used, 1);
    assert.equal(reloadedSnap.resources.image.remaining, 0);

    // 2. Model swap Call 2 MUST return 429 WITHOUT calling Gemini SDK again
    const swapRes2 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(swapRes2.status, 429);
    const swapData2 = (await swapRes2.json()) as {
      capReached: boolean;
      resource: string;
      budget: { resources: { image: { remaining: number } } };
    };
    assert.equal(swapData2.capReached, true);
    assert.equal(swapData2.resource, "image");
    assert.equal(swapData2.budget.resources.image.remaining, 0);
    assert.equal(geminiImageCalls, 1);

    // 3. Voice Call 1 succeeds, Call 2 blocked with 429 without calling Fal
    const voiceRes1 = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          text: "Hola mundo Vokaloom.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(voiceRes1.status, 200);
    const voiceData1 = (await voiceRes1.json()) as {
      audioUrl: string;
      budget: { resources: { audio: { used: number; status: string } } };
    };
    assert.equal(voiceData1.audioUrl, "https://cdn.fal.media/unit-test-audio.mp3");
    assert.equal(falSubscribeCalls, 1);
    assert.equal(voiceData1.budget.resources.audio.used, 1);
    assert.equal(voiceData1.budget.resources.audio.status, "exhausted");

    const voiceRes2 = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          text: "Segunda llamada bloqueada.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(voiceRes2.status, 429);
    const voiceData2 = (await voiceRes2.json()) as {
      capReached: boolean;
      resource: string;
    };
    assert.equal(voiceData2.capReached, true);
    assert.equal(voiceData2.resource, "audio");
    assert.equal(falSubscribeCalls, 1);

    // 4. Backgrounds Vision Call 1 uses Gemini + captures stock headers; Call 2 falls back gracefully
    const bgRes1 = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          vibe: "Luxury Travel",
          batchSize: 5,
          referenceImageBase64: TINY_PNG_BASE64,
        }),
      })
    );
    assert.equal(bgRes1.status, 200);
    const bgData1 = (await bgRes1.json()) as {
      visionUsed: boolean;
      resolvedQuery: string;
      visionCapNotice?: string;
    };
    assert.equal(bgData1.visionUsed, true);
    assert.equal(bgData1.resolvedQuery, "warm coastal cafe vertical sunlight");
    assert.equal(geminiVisionCalls, 1);

    const bgRes2 = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
        },
        body: JSON.stringify({
          vibe: "Luxury Travel",
          query: "mediterranean morning",
          batchSize: 5,
          referenceImageBase64: TINY_PNG_BASE64,
        }),
      })
    );
    assert.equal(bgRes2.status, 200);
    const bgData2 = (await bgRes2.json()) as {
      visionUsed: boolean;
      visionCapNotice?: string;
    };
    assert.equal(bgData2.visionUsed, false);
    assert.ok(bgData2.visionCapNotice && bgData2.visionCapNotice.length > 0);
    assert.equal(geminiVisionCalls, 1);

    // 5. Privacy check: /api/quota-status NEVER exposes balance or secrets
    const publicRes = await quotaStatusGet(
      new Request("http://localhost/api/quota-status")
    );
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.headers.get("cache-control"), "no-store");
    const publicText = await publicRes.text();
    assert.equal(publicText.includes("18.42"), false);
    assert.equal(publicText.includes("fal_unit_test"), false);
    assert.equal(publicText.includes("AIzaUnitTest"), false);

    // 6. Auth check: /api/admin rejects unauthenticated and pro_client, exposes full telemetry to operator
    const proCookie = makeProClientCookieHeader();
    const unauthAdminRes = await adminGet(
      new Request("http://localhost/api/admin", {
        headers: { cookie: proCookie },
      })
    );
    const unauthAdminJson = (await unauthAdminRes.json()) as {
      authenticated: boolean;
      telemetry?: unknown;
    };
    assert.equal(unauthAdminJson.authenticated, false);
    assert.equal(unauthAdminJson.telemetry, undefined);

    const authAdminRes = await adminGet(
      new Request("http://localhost/api/admin", {
        headers: { "x-admin-key": "UNIT-TEST-MASTER-KEY" },
      })
    );
    assert.equal(authAdminRes.status, 200);
    const authAdminJson = (await authAdminRes.json()) as {
      authenticated: boolean;
      telemetry: {
        fal: { balance: { currentBalance: number } };
        stock: {
          pexels: { limit: number; remaining: number };
          unsplash: { limit: number; remaining: number };
        };
        gemini: { totals: { calls: number; totalTokens: number; estimatedUsd: number } };
      };
    };
    assert.equal(authAdminJson.authenticated, true);
    assert.equal(authAdminJson.telemetry.fal.balance.currentBalance, 18.42);
    assert.equal(authAdminJson.telemetry.stock.pexels.limit, 200);
    assert.equal(authAdminJson.telemetry.stock.pexels.remaining, 195);
    assert.equal(authAdminJson.telemetry.stock.unsplash.limit, 50);
    assert.equal(authAdminJson.telemetry.stock.unsplash.remaining, 48);
    assert.equal(authAdminJson.telemetry.gemini.totals.calls, 2);
    assert.equal(authAdminJson.telemetry.gemini.totals.totalTokens, 1440 + 312);
    assert.ok(authAdminJson.telemetry.gemini.totals.estimatedUsd > 0);
  });

  it("prevents silent double-spend fallback calls when DISABLE_PAID_MODEL_FALLBACK=true and trips 429 circuit breaker", async () => {
    process.env.HARD_CAP_IMAGE_LIMIT = "5";
    process.env.HARD_CAP_AUDIO_LIMIT = "5";
    process.env.DISABLE_PAID_MODEL_FALLBACK = "true";

    const calledModels: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("images.pexels.com/photos/123/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }

      if (url.includes("gemini-2.5-flash-image")) {
        calledModels.push("gemini-2.5-flash-image");
        return new Response(
          JSON.stringify({
            error: { code: 429, message: "429 RESOURCE_EXHAUSTED" },
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("gemini-2.0-flash-exp-image-generation")) {
        calledModels.push("gemini-2.0-flash-exp-image-generation");
        throw new Error("Fallback model must NOT be called!");
      }

      if (url.includes("queue.fal.run")) {
        calledModels.push("fal-kokoro");
        return new Response(JSON.stringify({ detail: "Upstream error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("gemini-2.5-flash-preview-tts")) {
        calledModels.push("gemini-2.5-flash-preview-tts");
        throw new Error("Gemini TTS fallback must NOT be called!");
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const operatorCookie = makeOperatorCookieHeader();

    // Primary image model fails with 429 -> fallback model MUST NOT run, circuit breaker MUST trip
    const swapRes1 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(swapRes1.status, 200);
    const swapJson1 = (await swapRes1.json()) as {
      isFallback: boolean;
      fallbackComposite: boolean;
    };
    assert.equal(swapJson1.fallbackComposite, true);
    assert.deepEqual(calledModels, ["gemini-2.5-flash-image"]);
    assert.equal(await isProviderCircuitBroken("gemini"), true);

    // Subsequent model-swap call is blocked immediately at 429 by circuit breaker
    const swapRes2 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(swapRes2.status, 429);
    const swapJson2 = (await swapRes2.json()) as {
      capReached: boolean;
      reason: string;
    };
    assert.equal(swapJson2.capReached, true);
    assert.equal(swapJson2.reason, "circuit_breaker");
    assert.deepEqual(calledModels, ["gemini-2.5-flash-image"]);

    // Voice call with Fal failing MUST NOT fall through to Gemini TTS
    const voiceRes = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Test no fallback to Gemini TTS.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(voiceRes.status, 200);
    const voiceJson = (await voiceRes.json()) as { isFallback: boolean };
    assert.equal(voiceJson.isFallback, true);
    assert.equal(calledModels.includes("gemini-2.5-flash-preview-tts"), false);
  });

  it("handles Fal 403 permissionRestricted gracefully and hard-blocks when balance <= FAL_MIN_BALANCE_USD", async () => {
    process.env.HARD_CAP_AUDIO_LIMIT = "5";
    process.env.FAL_MIN_BALANCE_USD = "1.0";

    let billingStatus = 403;
    let billingBalance = 0;
    let falInferCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.fal.ai/v1/account/billing")) {
        if (billingStatus === 403) {
          return new Response("Forbidden", { status: 403 });
        }
        return new Response(
          JSON.stringify({
            credits: { current_balance: billingBalance, currency: "USD" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("queue.fal.run")) {
        const method = (init?.method || "GET").toUpperCase();
        if (method === "POST") {
          falInferCalls += 1;
          return new Response(
            JSON.stringify({
              request_id: "req-fal-bal",
              response_url:
                "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-bal",
              status_url:
                "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-bal/status",
              cancel_url:
                "https://queue.fal.run/fal-ai/kokoro/requests/req-fal-bal/cancel",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/status/stream")) {
          return new Response(
            'data: {"status":"COMPLETED"}\n\n',
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }
          );
        }
        if (new URL(url).pathname.endsWith("/status")) {
          return new Response(JSON.stringify({ status: "COMPLETED" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            audio_url: "https://cdn.fal.media/bal-ok.mp3",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const snap403 = await fetchFalBalanceSnapshot(process.env.FAL_KEY, {
      force: true,
    });
    assert.ok(snap403);
    assert.equal(snap403.permissionRestricted, true);
    assert.equal(snap403.currentBalance, null);

    const operatorCookie = makeOperatorCookieHeader();
    const resAllowed = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Allowed when 403 permissionRestricted.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(resAllowed.status, 200);
    assert.equal(falInferCalls, 1);

    // Now set live balance below FAL_MIN_BALANCE_USD (0.50 <= 1.00)
    billingStatus = 200;
    billingBalance = 0.5;
    const snapLow = await fetchFalBalanceSnapshot(process.env.FAL_KEY, {
      force: true,
    });
    assert.ok(snapLow);
    assert.equal(snapLow.permissionRestricted, false);
    assert.equal(snapLow.currentBalance, 0.5);

    const resBlocked = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Should block due to low Fal balance floor.",
          voiceId: "sofia-es",
          language: "es",
          referenceAudioBase64: TINY_WAV_BASE64,
        }),
      })
    );
    assert.equal(resBlocked.status, 429);
    const blockedData = (await resBlocked.json()) as {
      capReached: boolean;
      reason: string;
    };
    assert.equal(blockedData.capReached, true);
    assert.equal(blockedData.reason, "fal_min_balance");
    assert.equal(falInferCalls, 1);
  });

  it("enforces pro_client daily fair-use limits while letting operator bypass when global hard cap is unset", async () => {
    process.env.PRO_CLIENT_DAILY_IMAGE_LIMIT = "2";
    const proCookie = makeProClientCookieHeader();
    const operatorCookie = makeOperatorCookieHeader();

    let geminiCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("images.pexels.com/photos/123/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: TINY_PNG_BASE64.split(",")[1],
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    for (let i = 0; i < 2; i += 1) {
      const okRes = await modelSwapPost(
        new Request("http://localhost/api/model-swap", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: proCookie,
            "x-forwarded-for": "198.51.100.42",
          },
          body: JSON.stringify({
            modelImageBase64: TINY_PNG_BASE64,
            backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
          }),
        })
      );
      assert.equal(okRes.status, 200);
    }
    assert.equal(geminiCalls, 2);

    const blockedProRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: proCookie,
          "x-forwarded-for": "198.51.100.42",
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(blockedProRes.status, 429);
    const blockedProJson = (await blockedProRes.json()) as {
      capReached: boolean;
      reason: string;
    };
    assert.equal(blockedProJson.capReached, true);
    assert.equal(blockedProJson.reason, "pro_daily_cap");
    assert.equal(geminiCalls, 2);

    // Operator is NOT subject to pro_client daily fair-use cap
    const opRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: operatorCookie,
          "x-forwarded-for": "198.51.100.42",
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(opRes.status, 200);
    assert.equal(geminiCalls, 3);
  });

  it("supports admin emergency-pause toggle & reset-budget-caps actions with strict auth", async () => {
    process.env.HARD_CAP_IMAGE_LIMIT = "1";
    const operatorCookie = makeOperatorCookieHeader();
    const proCookie = makeProClientCookieHeader();

    // Unauthenticated / pro_client POST must return 401
    const unauthPause = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: proCookie },
        body: JSON.stringify({ action: "toggle-emergency-pause" }),
      })
    );
    assert.equal(unauthPause.status, 401);

    // Operator toggles emergency pause ON
    const pauseOnRes = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "UNIT-TEST-MASTER-KEY",
        },
        body: JSON.stringify({ action: "toggle-emergency-pause" }),
      })
    );
    assert.equal(pauseOnRes.status, 200);
    const pauseOnJson = (await pauseOnRes.json()) as {
      success: boolean;
      paidAiPaused: boolean;
    };
    assert.equal(pauseOnJson.success, true);
    assert.equal(pauseOnJson.paidAiPaused, true);

    // Paid generation is blocked while paused
    const pausedSwapRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/123/bg.png",
        }),
      })
    );
    assert.equal(pausedSwapRes.status, 429);
    const pausedSwapJson = (await pausedSwapRes.json()) as { reason: string };
    assert.equal(pausedSwapJson.reason, "emergency_pause");

    // Resume and consume 1 image slot, then reset caps
    await toggleEmergencyPause(false);
    const r1 = await reservePaidGenerationSlot("image");
    assert.equal(r1.allowed, true);
    const r2 = await reservePaidGenerationSlot("image");
    assert.equal(r2.allowed, false);

    const resetRes = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "UNIT-TEST-MASTER-KEY",
        },
        body: JSON.stringify({ action: "reset-budget-caps" }),
      })
    );
    assert.equal(resetRes.status, 200);
    const snapAfterReset = await getPublicQuotaSnapshot();
    assert.equal(snapAfterReset.resources.image.used, 0);
    assert.equal(snapAfterReset.resources.image.remaining, 1);

    await resetBudgetCaps();
  });

  it("fails closed in production without Redis when BUDGET_REQUIRE_DURABLE_STORE=true and warns when false", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.BUDGET_REQUIRE_DURABLE_STORE = "false";

    const warnSnap = await getAdminTelemetrySnapshot({
      falKey: "",
      geminiKey: "",
    });
    assert.equal(warnSnap.storage.backend, "memory");
    assert.equal(warnSnap.storage.durableStoreWarning, true);

    process.env.BUDGET_REQUIRE_DURABLE_STORE = "true";
    const blocked = await reservePaidGenerationSlot("image");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.statusCode, 503);
    assert.equal(blocked.reason, "durable_store_unavailable");
  });

  it("executes atomic EVAL Lua scripts when Redis REST config is active", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-upstash-token";
    process.env.HARD_CAP_IMAGE_LIMIT = "1";

    const seenCommands: string[] = [];
    let evalCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://mock-upstash.example.com/pipeline") {
        const body = JSON.parse(String(init?.body || "[]")) as Array<
          Array<string | number>
        >;
        for (const cmd of body) {
          seenCommands.push(String(cmd[0]));
        }
        if (body[0]?.[0] === "GET") {
          return new Response(JSON.stringify([{ result: "1" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (body[0]?.[0] === "EVAL") {
          evalCalls += 1;
          return new Response(
            JSON.stringify([
              {
                result:
                  evalCalls === 1
                    ? [1, "ok", 1, -1, 0, -1]
                    : [0, "hard_cap", 1, -1],
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
      throw new Error(`Unexpected fetch in Redis test: ${url}`);
    }) as typeof fetch;

    const first = await reservePaidGenerationSlot("image");
    assert.equal(first.allowed, true);
    assert.equal(first.used, 1);
    assert.equal(first.remaining, 0);

    const second = await reservePaidGenerationSlot("image");
    assert.equal(second.allowed, false);
    assert.equal(second.reason, "hard_cap");
    assert.ok(seenCommands.includes("EVAL"));
  });

  it("serializes concurrent reservations atomically and surfaces low-quota & stock 429 advisories", async () => {
    process.env.HARD_CAP_IMAGE_LIMIT = "1";
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () => reservePaidGenerationSlot("image"))
    );
    const allowedCount = parallel.filter((r) => r.allowed).length;
    const blockedCount = parallel.filter((r) => !r.allowed).length;
    assert.equal(allowedCount, 1);
    assert.equal(blockedCount, 4);

    // Test low-quota threshold (5 limit, 0.2 ratio -> 1 remaining is low)
    await resetBudgetCaps();
    process.env.HARD_CAP_IMAGE_LIMIT = "5";
    process.env.LOW_QUOTA_WARN_RATIO = "0.2";
    for (let i = 0; i < 4; i += 1) {
      const r = await reservePaidGenerationSlot("image");
      assert.equal(r.allowed, true);
    }
    const lowSnap = await getPublicQuotaSnapshot();
    assert.equal(lowSnap.resources.image.remaining, 1);
    assert.equal(lowSnap.resources.image.status, "low");
    assert.ok(
      lowSnap.advisories.some((a) => a.code === "image_cap_low" && a.severity === "warning")
    );

    // Test stock 429 tracking from /api/backgrounds
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.pexels.com/v1/search")) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: {
            "x-ratelimit-limit": "200",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600),
          },
        });
      }
      if (url.includes("api.unsplash.com/search/photos")) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: {
            "x-ratelimit-limit": "50",
            "x-ratelimit-remaining": "49",
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const bgRes = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: makeOperatorCookieHeader(),
        },
        body: JSON.stringify({ vibe: "Luxury Travel", batchSize: 5 }),
      })
    );
    assert.equal(bgRes.status, 200);
    const bgJson = (await bgRes.json()) as {
      budget: {
        stockLow: boolean;
        advisories: Array<{ code: string }>;
      };
    };
    assert.equal(bgJson.budget.stockLow, true);
    assert.ok(
      bgJson.budget.advisories.some((a) => a.code === "stock_rate_limited")
    );
  });
});
