import { NextResponse, connection } from "next/server";
import { getPublicQuotaSnapshot } from "@/lib/budget-guard";

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Allow direct route invocation in non-Next unit/integration test runners
  }
  void request.headers.get("accept-language");

  const snapshot = await getPublicQuotaSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
