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
import { getRateLimitClientKey } from "@/lib/client-ip";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ENTITLEMENT_COOKIE_NAME,
  VAULT_COOKIE_NAME,
  encryptSecretsPayload,
  signAdminSessionToken,
  signEntitlementToken,
  verifyEntitlementToken,
} from "@/lib/server-secrets";
import { POST as modelSwapPost } from "@/app/api/model-swap/route";
import { POST as voicePost } from "@/app/api/voice/route";
import {
  GET as backgroundsGet,
  POST as backgroundsPost,
} from "@/app/api/backgrounds/route";
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

  delete process.env.FAL_BILLING_KEY;
  delete process.env.SESSION_SIGNING_SECRET;
  delete process.env.GEMINI_VISION_MODEL;
  delete process.env.GEMINI_IMAGE_MODEL;
  delete process.env.GEMINI_TTS_MODEL;
  delete process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY_HOPS;
  delete process.env.HARD_CAP_IMAGE_LIMIT;
  delete process.env.HARD_CAP_AUDIO_LIMIT;
  delete process.env.HARD_CAP_VISION_LIMIT;
  delete process.env.HARD_CAP_WINDOW;
  delete process.env.DISABLE_PAID_MODEL_FALLBACK;
  delete process.env.PAID_AI_EMERGENCY_PAUSE;
  delete process.env.BUDGET_REQUIRE_DURABLE_STORE;
  delete process.env.PRO_CLIENT_DAILY_IMAGE_LIMIT;
  delete process.env.PRO_CLIENT_DAILY_AUDIO_LIMIT;
  delete process.env.PRO_CLIENT_DAILY_VISION_LIMIT;
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
        if (url.includes("gemini-nano-banana-2.1")) {
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

        if (url.includes("gemini-3.5-flash-lite:")) {
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

      if (url.includes("gemini-nano-banana-2.1")) {
        calledModels.push("gemini-nano-banana-2.1");
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

      if (url.includes("gemini-3.8-flash-lite-tts")) {
        calledModels.push("gemini-3.8-flash-lite-tts");
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
    assert.deepEqual(calledModels, ["gemini-nano-banana-2.1"]);
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
    assert.deepEqual(calledModels, ["gemini-nano-banana-2.1"]);

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
    assert.equal(calledModels.includes("gemini-3.8-flash-lite-tts"), false);
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

  it("supports externalized Gemini model overrides and removes dead image fallback model", async () => {
    process.env.GEMINI_VISION_MODEL = "gemini-custom-vision-test";
    process.env.GEMINI_IMAGE_MODEL = "gemini-custom-image-test";
    process.env.GEMINI_TTS_MODEL = "gemini-custom-tts-test";
    process.env.DISABLE_PAID_MODEL_FALLBACK = "false";
    delete process.env.FAL_KEY;

    const hitUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      hitUrls.push(url);

      if (url.includes("images.pexels.com/photos/555/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("api.pexels.com/")) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.unsplash.com/")) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("gemini-2.0-flash-exp-image-generation")) {
        throw new Error("Removed dead fallback model must never be called");
      }
      if (url.includes("gemini-custom-vision-test")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "clean minimalist coffee studio" }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("gemini-custom-image-test")) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "no image returned" }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("gemini-custom-tts-test")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "audio/pcm",
                        data: Buffer.from([0, 0, 1, 0]).toString("base64"),
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

    const operatorCookie = makeOperatorCookieHeader();

    const bgRes = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          vibe: "Coffee",
          referenceImageBase64: TINY_PNG_BASE64,
        }),
      })
    );
    assert.equal(bgRes.status, 200);

    const swapRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/555/bg.png",
        }),
      })
    );
    assert.equal(swapRes.status, 200);
    const swapJson = (await swapRes.json()) as { fallbackComposite: boolean };
    assert.equal(swapJson.fallbackComposite, true);

    const voiceRes = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Testing configurable Gemini TTS model.",
          language: "en",
          voiceId: "bella-en",
        }),
      })
    );
    assert.equal(voiceRes.status, 200);

    assert.ok(hitUrls.some((u) => u.includes("gemini-custom-vision-test")));
    assert.ok(hitUrls.some((u) => u.includes("gemini-custom-image-test")));
    assert.ok(hitUrls.some((u) => u.includes("gemini-custom-tts-test")));
    assert.equal(
      hitUrls.some((u) => u.includes("gemini-2.0-flash-exp-image-generation")),
      false
    );
  });

  it("ignores spoofable IP headers when TRUST_PROXY is unset and stops IP-header trial bypass", async () => {
    delete process.env.FAL_KEY;
    delete process.env.GEMINI_API_KEY;

    const ua = `SpoofAgent/${Date.now()}`;
    const k1 = getRateLimitClientKey(
      new Request("http://localhost/api/voice", {
        headers: {
          "user-agent": ua,
          "accept-language": "en-US",
          "x-real-ip": "1.1.1.1",
          "x-forwarded-for": "2.2.2.2",
        },
      })
    );
    const k2 = getRateLimitClientKey(
      new Request("http://localhost/api/voice", {
        headers: {
          "user-agent": ua,
          "accept-language": "en-US",
          "x-real-ip": "9.9.9.9",
          "x-forwarded-for": "8.8.8.8",
        },
      })
    );
    assert.equal(k1.trusted, false);
    assert.ok(k1.key.startsWith("unverified:fp:"));
    assert.equal(k1.key, k2.key);

    // Exhaust 3 guest credits with changing spoofed IPs -> 4th MUST be rejected with 402
    for (let i = 0; i < 3; i += 1) {
      const ok = await voicePost(
        new Request("http://localhost/api/voice", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": ua,
            "accept-language": "en-US",
            "x-real-ip": `198.51.100.${i + 10}`,
            "x-forwarded-for": `203.0.113.${i + 10}`,
          },
          body: JSON.stringify({
            text: `Spoof check ${i}`,
            voiceId: "sofia-es",
            language: "es",
          }),
        })
      );
      assert.equal(ok.status, 200);
    }

    const blocked4 = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": ua,
          "accept-language": "en-US",
          "x-real-ip": "198.51.100.250",
          "x-forwarded-for": "203.0.113.250",
        },
        body: JSON.stringify({
          text: "4th request spoofing IP",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(blocked4.status, 402);
  });

  it("uses dedicated FAL_BILLING_KEY and enforces live Fal floor automatically in /api/voice", async () => {
    process.env.FAL_KEY = "fal_inference_only_key_12345";
    process.env.FAL_BILLING_KEY = "fal_readonly_billing_key_67890";
    process.env.FAL_MIN_BALANCE_USD = "1.0";
    process.env.HARD_CAP_AUDIO_LIMIT = "5";

    let billingAuthHeader = "";
    let inferCalled = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.fal.ai/v1/account/billing")) {
        const hdrs = new Headers(init?.headers);
        billingAuthHeader = hdrs.get("authorization") || "";
        return new Response(
          JSON.stringify({ credits: { current_balance: 0.4, currency: "USD" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("queue.fal.run")) {
        inferCalled = true;
        throw new Error("Fal inference must NOT execute when live floor triggers!");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const operatorCookie = makeOperatorCookieHeader();
    const res = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Voice call checks cold balance automatically.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(res.status, 429);
    const data = (await res.json()) as { reason: string; capReached: boolean };
    assert.equal(data.reason, "fal_min_balance");
    assert.equal(data.capReached, true);
    assert.equal(billingAuthHeader, "Key fal_readonly_billing_key_67890");
    assert.equal(inferCalled, false);

    const telemetry = await getAdminTelemetrySnapshot();
    assert.equal(telemetry.fal.billingKeyConfigured, true);
    assert.equal(telemetry.fal.belowMinFloor, true);
  });

  it("does not burn paid image cap slots on upstream 404/502 fetches and preserves guest credits on 429 blocks", async () => {
    process.env.HARD_CAP_IMAGE_LIMIT = "1";
    process.env.HARD_CAP_AUDIO_LIMIT = "5";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("images.pexels.com/photos/404/")) {
        return new Response("Not Found", { status: 404 });
      }
      if (url.includes("images.pexels.com/photos/502/")) {
        return new Response("<html>error</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("images.pexels.com/photos/200/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
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
      if (url.includes("queue.fal.run")) {
        const isPost = !url.includes("/requests/");
        if (isPost) {
          return new Response(
            JSON.stringify({
              request_id: "req-guest",
              response_url: "https://queue.fal.run/fal-ai/kokoro/requests/req-guest",
              status_url: "https://queue.fal.run/fal-ai/kokoro/requests/req-guest/status",
              cancel_url: "https://queue.fal.run/fal-ai/kokoro/requests/req-guest/cancel",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/status/stream")) {
          return new Response('data: {"status":"COMPLETED"}\n\n', {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (new URL(url).pathname.endsWith("/status")) {
          return new Response(JSON.stringify({ status: "COMPLETED" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ audio_url: "https://cdn.fal.media/ok.mp3" }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const guestUa = `CleanGuest-${Date.now()}`;
    const guestHeaders = {
      "content-type": "application/json",
      "user-agent": guestUa,
    };

    // 1. Upstream 404 & invalid MIME 502 MUST NOT consume HARD_CAP_IMAGE_LIMIT or guest credits
    const bg404Res = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: guestHeaders,
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/404/bg.png",
        }),
      })
    );
    assert.equal(bg404Res.status, 200);
    assert.equal((await bg404Res.json()).fallbackComposite, true);

    const bgHtmlRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: guestHeaders,
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/502/bg.png",
        }),
      })
    );
    assert.equal(bgHtmlRes.status, 502);

    const snapBeforeValid = await getPublicQuotaSnapshot();
    assert.equal(snapBeforeValid.resources.image.used, 0);

    // 2. Valid swap succeeds (1/1 cap used, 1/3 guest credit used)
    const validSwapRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: guestHeaders,
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/200/bg.png",
        }),
      })
    );
    assert.equal(validSwapRes.status, 200);
    assert.ok(validSwapRes.headers.get("set-cookie")?.includes("vokaloom_trial_v1="));

    // 3. Hard-capped 429 block MUST NOT attach trial cookie OR burn the guest's remaining 2 credits
    for (let i = 0; i < 3; i += 1) {
      const cappedSwap = await modelSwapPost(
        new Request("http://localhost/api/model-swap", {
          method: "POST",
          headers: guestHeaders,
          body: JSON.stringify({
            modelImageBase64: TINY_PNG_BASE64,
            backgroundUrl: "https://images.pexels.com/photos/200/bg.png",
          }),
        })
      );
      assert.equal(cappedSwap.status, 429);
      assert.equal(
        cappedSwap.headers.get("set-cookie")?.includes("vokaloom_trial_v1") ?? false,
        false
      );
    }

    // 4. Guest still has 2 remaining trial credits on /api/voice!
    for (let i = 0; i < 2; i += 1) {
      const voiceOk = await voicePost(
        new Request("http://localhost/api/voice", {
          method: "POST",
          headers: guestHeaders,
          body: JSON.stringify({
            text: `Remaining guest credit ${i}`,
            voiceId: "sofia-es",
            language: "es",
          }),
        })
      );
      assert.equal(voiceOk.status, 200);
    }

    // 5. Next request reaches true 3/3 guest quota -> 402
    const voice402 = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: guestHeaders,
        body: JSON.stringify({
          text: "Should now be 402.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(voice402.status, 402);
  });

  it("tracks pro_client daily fair-use caps by non-PII subjectId across changing IPs (including Vision)", async () => {
    process.env.TRUST_PROXY = "true";
    process.env.PRO_CLIENT_DAILY_IMAGE_LIMIT = "1";
    process.env.PRO_CLIENT_DAILY_VISION_LIMIT = "1";

    let visionCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("images.pexels.com/photos/777/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("api.pexels.com/")) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.unsplash.com/")) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("gemini-nano-banana-2.1")) {
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
      if (url.includes("gemini-3.5-flash-lite")) {
        visionCalls += 1;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "sunset coastal editorial" }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    // Issue VIP cookie via verify-code (case-insensitive VIP pass supported)
    const verifyRes = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.1",
        },
        body: JSON.stringify({
          action: "verify-code",
          code: "unit-vip-pass",
        }),
      })
    );
    assert.equal(verifyRes.status, 200);
    const setCookies = verifyRes.headers.getSetCookie();
    const entCookieLine = setCookies.find((c) =>
      c.startsWith(`${ENTITLEMENT_COOKIE_NAME}=`)
    );
    assert.ok(entCookieLine);
    const rawCookiePair = entCookieLine.split(";")[0]!;
    const rawToken = decodeURIComponent(rawCookiePair.split("=")[1]!);
    const verified = verifyEntitlementToken(rawToken);
    assert.ok(verified.subjectId);
    assert.equal(verified.subjectId.length, 16);

    // 1st image swap succeeds from IP .10
    const swap1 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: rawCookiePair,
          "x-forwarded-for": "198.51.100.10",
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/777/bg.png",
        }),
      })
    );
    assert.equal(swap1.status, 200);

    // 2nd image swap from DIFFERENT IP .99 STILL hits pro_daily_cap!
    const swap2 = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: rawCookiePair,
          "x-forwarded-for": "198.51.100.99",
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/777/bg.png",
        }),
      })
    );
    assert.equal(swap2.status, 429);
    assert.equal((await swap2.json()).reason, "pro_daily_cap");

    // 1st Vision search succeeds from IP .10
    const bg1 = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: rawCookiePair,
          "x-forwarded-for": "198.51.100.10",
        },
        body: JSON.stringify({
          vibe: "Travel",
          referenceImageBase64: TINY_PNG_BASE64,
        }),
      })
    );
    assert.equal(bg1.status, 200);
    assert.equal((await bg1.json()).visionUsed, true);
    assert.equal(visionCalls, 1);

    // 2nd Vision search from DIFFERENT IP .77 hits pro_daily_cap & falls back without calling Gemini
    const bg2 = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: rawCookiePair,
          "x-forwarded-for": "198.51.100.77",
        },
        body: JSON.stringify({
          vibe: "Travel",
          referenceImageBase64: TINY_PNG_BASE64,
        }),
      })
    );
    assert.equal(bg2.status, 200);
    const bg2Json = (await bg2.json()) as {
      visionUsed: boolean;
      visionCapNotice?: string;
    };
    assert.equal(bg2Json.visionUsed, false);
    assert.ok(bg2Json.visionCapNotice);
    assert.equal(visionCalls, 1);
  });

  it("enforces case-sensitive ADMIN_MASTER_KEY, SESSION_SIGNING_SECRET isolation, CSRF origin check & server business config", async () => {
    process.env.SESSION_SIGNING_SECRET = "dedicated-signing-secret-v1";

    // Wrong case master key MUST fail 401
    const wrongCaseRes = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AdminCaseCheck/1",
        },
        body: JSON.stringify({
          action: "admin-login",
          code: "unit-test-master-key",
        }),
      })
    );
    assert.equal(wrongCaseRes.status, 401);

    // Exact case master key succeeds 200
    const exactCaseRes = await adminPost(
      new Request("http://localhost/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AdminCaseCheck/1",
        },
        body: JSON.stringify({
          action: "admin-login",
          code: "UNIT-TEST-MASTER-KEY",
        }),
      })
    );
    assert.equal(exactCaseRes.status, 200);

    // Decoupled SESSION_SIGNING_SECRET survives ADMIN_MASTER_KEY rotation
    const signedVipToken = signEntitlementToken("pro_client", "subj1234567890ab");
    assert.ok(signedVipToken);
    process.env.ADMIN_MASTER_KEY = "ROTATED-NEW-MASTER-KEY";
    const stillValid = verifyEntitlementToken(signedVipToken);
    assert.equal(stillValid.isPro, true);
    assert.equal(stillValid.subjectId, "subj1234567890ab");

    const telemetry = await getAdminTelemetrySnapshot();
    assert.equal(telemetry.config.usingDedicatedSigningSecret, true);

    // CSRF cross-origin & Sec-Fetch-Site checks return 403
    const csrfOriginRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
          origin: "https://evil-attacker.example",
          "x-admin-key": "ROTATED-NEW-MASTER-KEY",
        },
        body: JSON.stringify({ action: "toggle-emergency-pause" }),
      })
    );
    assert.equal(csrfOriginRes.status, 403);

    const csrfFetchSiteRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
          "x-admin-key": "ROTATED-NEW-MASTER-KEY",
        },
        body: JSON.stringify({ action: "toggle-emergency-pause" }),
      })
    );
    assert.equal(csrfFetchSiteRes.status, 403);

    // Disallowed checkout URL returns 400
    const badCfgRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-admin-key": "ROTATED-NEW-MASTER-KEY",
        },
        body: JSON.stringify({
          action: "update-business-config",
          config: { checkoutUrlCop: "javascript:alert(1)" },
        }),
      })
    );
    assert.equal(badCfgRes.status, 400);

    // Valid same-origin update-business-config persists & surfaces on GET /api/admin
    const okCfgRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-admin-key": "ROTATED-NEW-MASTER-KEY",
        },
        body: JSON.stringify({
          action: "update-business-config",
          config: {
            priceCop: "$79,000 COP",
            priceUsd: "$19 USD",
            maxTrialCredits: 4,
            checkoutUrlCop: "https://checkout.wompi.co/l/vokaloom_pro_79k",
            checkoutUrlUsd: "https://buy.stripe.com/vokaloom_pro_19usd",
          },
        }),
      })
    );
    assert.equal(okCfgRes.status, 200);

    const publicAdminGet = await adminGet(
      new Request("http://localhost:3000/api/admin")
    );
    assert.equal(publicAdminGet.status, 200);
    const getJson = (await publicAdminGet.json()) as {
      authenticated: boolean;
      config: { priceCop: string; maxTrialCredits: number; checkoutUrlCop: string };
    };
    assert.equal(getJson.authenticated, false);
    assert.equal(getJson.config.priceCop, "$79,000 COP");
    assert.equal(getJson.config.maxTrialCredits, 4);
    assert.equal(
      getJson.config.checkoutUrlCop,
      "https://checkout.wompi.co/l/vokaloom_pro_79k"
    );
  });

  it("syncs guest quota limits dynamically with maxTrialCredits=0 and maxTrialCredits=5", async () => {
    delete process.env.FAL_KEY;
    delete process.env.GEMINI_API_KEY;

    // 1. Set maxTrialCredits = 0 via admin server business config -> immediate 402
    const cfgZero = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "UNIT-TEST-MASTER-KEY",
        },
        body: JSON.stringify({
          action: "update-business-config",
          config: { maxTrialCredits: 0 },
        }),
      })
    );
    assert.equal(cfgZero.status, 200);

    const guestZero = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": `ZeroTrialGuest-${Date.now()}`,
        },
        body: JSON.stringify({
          text: "Blocked immediately when trials disabled.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(guestZero.status, 402);

    // 2. Raise maxTrialCredits = 5 -> guest gets 5 runs, 6th blocked at 402
    const cfgFive = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "UNIT-TEST-MASTER-KEY",
        },
        body: JSON.stringify({
          action: "update-business-config",
          config: { maxTrialCredits: 5 },
        }),
      })
    );
    assert.equal(cfgFive.status, 200);

    const ua5 = `FiveTrialGuest-${Date.now()}`;
    for (let i = 0; i < 5; i += 1) {
      const ok = await voicePost(
        new Request("http://localhost/api/voice", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": ua5,
          },
          body: JSON.stringify({
            text: `Trial run ${i + 1} of 5.`,
            voiceId: "sofia-es",
            language: "es",
          }),
        })
      );
      assert.equal(ok.status, 200);
    }

    const blocked6 = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": ua5,
        },
        body: JSON.stringify({
          text: "6th run must fail with 402.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(blocked6.status, 402);
  });

  it("scopes Vault cookie strictly to valid Operator sessions and deletes it on admin-logout", async () => {
    delete process.env.GEMINI_API_KEY;
    const vaultToken = encryptSecretsPayload({
      GEMINI_API_KEY: "AIzaVaultSecretOverride123456",
    });

    let capturedApiKeyHeader = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("images.pexels.com/photos/321/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        const hdrs = new Headers(init?.headers);
        capturedApiKeyHeader = hdrs.get("x-goog-api-key") || "";
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

    // 1. Non-operator / guest sending vokaloom_vault_v1 MUST NOT decrypt Vault secret
    const guestWithVault = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": `VaultGuest-${Date.now()}`,
          cookie: `${VAULT_COOKIE_NAME}=${encodeURIComponent(vaultToken)}`,
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/321/bg.png",
        }),
      })
    );
    assert.equal(guestWithVault.status, 200);
    const guestJson = (await guestWithVault.json()) as {
      fallbackComposite: boolean;
    };
    assert.equal(guestJson.fallbackComposite, true);
    assert.equal(capturedApiKeyHeader, "");

    // 2. Authenticated Operator with valid admin session + vault cookie uses Vault key
    const opCookie = `${makeOperatorCookieHeader()}; ${VAULT_COOKIE_NAME}=${encodeURIComponent(vaultToken)}`;
    const opWithVault = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: opCookie,
        },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/321/bg.png",
        }),
      })
    );
    assert.equal(opWithVault.status, 200);
    const opJson = (await opWithVault.json()) as { isFallback: boolean };
    assert.equal(opJson.isFallback, false);
    assert.equal(capturedApiKeyHeader, "AIzaVaultSecretOverride123456");

    // 3. admin-logout deletes vokaloom_vault_v1 alongside admin session & entitlement cookies
    const logoutRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "admin-logout" }),
      })
    );
    assert.equal(logoutRes.status, 200);
    const setCookies = logoutRes.headers.getSetCookie().join("\n");
    assert.ok(setCookies.includes(`${ADMIN_SESSION_COOKIE_NAME}=`));
    assert.ok(setCookies.includes(`${ENTITLEMENT_COOKIE_NAME}=`));
    assert.ok(setCookies.includes(`${VAULT_COOKIE_NAME}=`));
  });

  it("returns 502 in production on permanent upstream 401/404 config errors instead of silent fallback", async () => {
    process.env.SESSION_SIGNING_SECRET = "prod-test-signing-secret";
    delete process.env.FAL_KEY;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("images.pexels.com/photos/888/")) {
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("gemini-nano-banana-2.1")) {
        return new Response(
          JSON.stringify({ error: { code: 404, message: "NOT_FOUND" } }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("gemini-3.8-flash-lite-tts")) {
        return new Response(
          JSON.stringify({ error: { code: 401, message: "API_KEY_INVALID" } }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const opCookie = makeOperatorCookieHeader();

    // Non-production dev mode still falls back gracefully
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    const devSwapRes = await modelSwapPost(
      new Request("http://localhost/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: opCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/888/bg.png",
        }),
      })
    );
    assert.equal(devSwapRes.status, 200);
    assert.equal((await devSwapRes.json()).fallbackComposite, true);

    // Production returns HTTP 502 on permanent 404 / 401 config failures
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const prodSwapRes = await modelSwapPost(
      new Request("https://app.vokaloom.example/api/model-swap", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: opCookie },
        body: JSON.stringify({
          modelImageBase64: TINY_PNG_BASE64,
          backgroundUrl: "https://images.pexels.com/photos/888/bg.png",
        }),
      })
    );
    assert.equal(prodSwapRes.status, 502);
    const prodSwapJson = (await prodSwapRes.json()) as {
      providerConfigError: boolean;
      statusCode: number;
    };
    assert.equal(prodSwapJson.providerConfigError, true);
    assert.equal(prodSwapJson.statusCode, 404);

    const prodVoiceRes = await voicePost(
      new Request("https://app.vokaloom.example/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: opCookie },
        body: JSON.stringify({
          text: "Production voice config error test.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(prodVoiceRes.status, 502);
    const prodVoiceJson = (await prodVoiceRes.json()) as {
      providerConfigError: boolean;
      statusCode: number;
    };
    assert.equal(prodVoiceJson.providerConfigError, true);
    assert.equal(prodVoiceJson.statusCode, 401);

    // Also verify HTTPS origin matches internal http:// request behind TLS proxy in production
    const tlsProxyLogin = await adminPost(
      new Request("http://127.0.0.1:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "app.vokaloom.example",
          origin: "https://app.vokaloom.example",
        },
        body: JSON.stringify({
          action: "admin-login",
          code: "UNIT-TEST-MASTER-KEY",
        }),
      })
    );
    assert.equal(tlsProxyLogin.status, 200);
  });

  it("blocks cross-site image proxy GET requests and enforces 8 MB proxy cap", async () => {
    const crossSiteRes = await backgroundsGet(
      new Request(
        "http://localhost/api/backgrounds?proxyUrl=https://images.pexels.com/photos/1/bg.png",
        {
          headers: { "sec-fetch-site": "cross-site" },
        }
      )
    );
    assert.equal(crossSiteRes.status, 403);

    // Upstream returning > 8 MB (9 MB Content-Length) must be rejected at 413
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(16), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(9 * 1024 * 1024),
        },
      })) as typeof fetch;

    const oversizedProxyRes = await backgroundsGet(
      new Request(
        "http://localhost/api/backgrounds?proxyUrl=https://images.pexels.com/photos/2/big.jpg",
        {
          headers: { "sec-fetch-site": "same-origin" },
        }
      )
    );
    assert.equal(oversizedProxyRes.status, 413);
  });

  it("instantly revokes active 30-day pro_client cookies via POST /api/admin revoke-pro-code", async () => {
    delete process.env.FAL_KEY;
    delete process.env.GEMINI_API_KEY;

    // 1. Activate VIP pass and capture 30-day cookie
    const verifyRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          code: "UNIT-VIP-PASS",
        }),
      })
    );
    assert.equal(verifyRes.status, 200);
    const cookieLine = verifyRes.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${ENTITLEMENT_COOKIE_NAME}=`));
    assert.ok(cookieLine);
    const proCookie = cookieLine.split(";")[0]!;

    // 2. Confirm Pro cookie currently works on /api/voice
    const okVoice = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: proCookie },
        body: JSON.stringify({
          text: "Active Pro Pass works before revocation.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(okVoice.status, 200);

    // 3. Operator revokes the leaked VIP code via admin route
    const revokeRes = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "UNIT-TEST-MASTER-KEY",
        },
        body: JSON.stringify({
          action: "revoke-pro-code",
          code: "unit-vip-pass",
        }),
      })
    );
    assert.equal(revokeRes.status, 200);
    const revokeJson = (await revokeRes.json()) as {
      success: boolean;
      revoked: boolean;
    };
    assert.equal(revokeJson.revoked, true);

    // 4. Previously issued 30-day cookie is immediately killed across routes and cleared
    const killedVoice = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: proCookie },
        body: JSON.stringify({
          text: "Revoked cookie must fail immediately.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(killedVoice.status, 402);
    const killedJson = (await killedVoice.json()) as {
      proRevoked: boolean;
      quotaExceeded: boolean;
    };
    assert.equal(killedJson.proRevoked, true);
    assert.equal(killedJson.quotaExceeded, true);
    assert.ok(
      killedVoice.headers
        .getSetCookie()
        .some((c) => c.startsWith(`${ENTITLEMENT_COOKIE_NAME}=;`))
    );

    const killedBg = await backgroundsPost(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: proCookie },
        body: JSON.stringify({ vibe: "Luxury Travel", batchSize: 5 }),
      })
    );
    assert.equal(killedBg.status, 402);

    // 5. Attempting to re-login with the revoked VIP code is also denied
    const reVerify = await adminPost(
      new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          code: "UNIT-VIP-PASS",
        }),
      })
    );
    assert.equal(reVerify.status, 401);
  });

  it("calls Gemini TTS on v1beta with valid responseModalities, speechConfig, verbatim text, and preserves RIFF WAV output", async () => {
    delete process.env.FAL_KEY;

    const capturedCalls: Array<{
      url: string;
      body: {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
        generationConfig?: {
          responseModalities?: string[];
          speechConfig?: {
            voiceConfig?: {
              prebuiltVoiceConfig?: { voiceName?: string };
            };
          };
        };
      };
    }> = [];

    const fakeWav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4, 0),
      Buffer.from("WAVEfmt "),
      Buffer.alloc(32, 0),
    ]);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        const parsedBody = JSON.parse(String(init?.body || "{}")) as
          (typeof capturedCalls)[number]["body"];
        capturedCalls.push({ url, body: parsedBody });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "audio/wav",
                        data: fakeWav.toString("base64"),
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 24,
              candidatesTokenCount: 160,
              totalTokenCount: 184,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const operatorCookie = makeOperatorCookieHeader();
    const res = await voicePost(
      new Request("http://localhost/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({
          text: "Hola desde Vokaloom Studio.",
          voiceId: "sofia-es",
          language: "es",
        }),
      })
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      isFallback: boolean;
      audioUrl: string;
    };
    assert.equal(data.isFallback, false);
    assert.equal(capturedCalls.length, 1);

    const call = capturedCalls[0]!;
    assert.ok(
      call.url.includes("/v1beta/models/gemini-3.8-flash-lite-tts:generateContent")
    );
    assert.equal(call.url.includes("/v1/models/"), false);
    assert.deepEqual(call.body.generationConfig?.responseModalities, ["AUDIO"]);
    assert.equal(
      call.body.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig
        ?.voiceName,
      "Aoede"
    );
    assert.equal(
      call.body.contents?.[0]?.parts?.[0]?.text,
      "Hola desde Vokaloom Studio."
    );

    // Ensure an already-RIFF WAV from Gemini TTS is not double-wrapped
    assert.ok(data.audioUrl.startsWith("data:audio/wav;base64,"));
    const decodedOut = Buffer.from(
      data.audioUrl.replace("data:audio/wav;base64,", ""),
      "base64"
    );
    assert.equal(decodedOut.toString("ascii", 0, 4), "RIFF");
    assert.equal(decodedOut.length, fakeWav.length);
  });
});
