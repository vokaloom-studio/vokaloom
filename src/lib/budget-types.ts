export type PaidResource = "image" | "audio" | "vision";

export type StockProvider = "pexels" | "unsplash";

export type HardCapWindow = "lifetime" | "24h" | "30d";

export type QuotaStatusLevel = "healthy" | "low" | "exhausted";

export interface PublicResourceQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
  status: QuotaStatusLevel;
  resetAt: number | null;
}

export type PublicAdvisorySeverity = "warning" | "critical";

export type PublicAdvisoryCode =
  | "paid_ai_paused"
  | "image_cap_low"
  | "image_cap_exhausted"
  | "audio_cap_low"
  | "audio_cap_exhausted"
  | "vision_cap_low"
  | "vision_cap_exhausted"
  | "stock_quota_low"
  | "stock_rate_limited"
  | "provider_circuit_broken"
  | "provider_balance_low"
  | "provider_balance_floor";

export interface PublicQuotaAdvisory {
  code: PublicAdvisoryCode;
  severity: PublicAdvisorySeverity;
  resource?: PaidResource | "stock";
  remaining?: number | null;
  limit?: number | null;
  resetAt?: number | null;
}

export interface PublicQuotaSnapshot {
  window: HardCapWindow;
  paidAiPaused: boolean;
  stockLow: boolean;
  hasAnyHardCap: boolean;
  resources: Record<PaidResource, PublicResourceQuota>;
  advisories: PublicQuotaAdvisory[];
  updatedAt: number;
}

export interface CircuitBreakerRecord {
  trippedAt: number;
  blockedUntil: number;
  statusCode?: number;
  reason?: string;
}

export interface FalBalanceSnapshot {
  currentBalance: number | null;
  currency: string;
  permissionRestricted: boolean;
  fetchedAt: number;
  error?: string;
}

export interface StockRateLimitSnapshot {
  provider: StockProvider;
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  rateLimited: boolean;
  updatedAt: number;
}

export interface GeminiResourceUsage {
  calls: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  lastCallAt: number | null;
}

export interface ServerBusinessConfig {
  priceCop: string;
  priceUsd: string;
  maxTrialCredits: number;
  checkoutUrlCop: string;
  checkoutUrlUsd: string;
}

export interface AdminTelemetrySnapshot {
  storage: {
    backend: "redis" | "file" | "memory";
    durable: boolean;
    durableStoreWarning: boolean;
    requireDurableStore: boolean;
  };
  config: {
    window: HardCapWindow;
    disablePaidModelFallback: boolean;
    lowQuotaWarnRatio: number;
    falLowBalanceWarnUsd: number;
    falMinBalanceUsd: number;
    proClientDailyImageLimit: number;
    proClientDailyAudioLimit: number;
    proClientDailyVisionLimit: number;
    usingDedicatedSigningSecret: boolean;
  };
  emergencyPause: {
    active: boolean;
    envForced: boolean;
    runtimePaused: boolean;
  };
  hardCaps: Record<PaidResource, PublicResourceQuota>;
  fal: {
    configured: boolean;
    billingKeyConfigured: boolean;
    balance: FalBalanceSnapshot | null;
    lowBalanceWarning: boolean;
    belowMinFloor: boolean;
    circuitBreaker: CircuitBreakerRecord | null;
  };
  stock: {
    pexels: StockRateLimitSnapshot | null;
    unsplash: StockRateLimitSnapshot | null;
  };
  gemini: {
    configured: boolean;
    circuitBreaker: CircuitBreakerRecord | null;
    usage: Record<PaidResource, GeminiResourceUsage>;
    totals: {
      calls: number;
      promptTokens: number;
      candidatesTokens: number;
      totalTokens: number;
      estimatedUsd: number;
    };
  };
  publicSnapshot: PublicQuotaSnapshot;
  generatedAt: number;
}
