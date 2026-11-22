import { NextResponse } from "next/server";
import { runSecurityAudit } from "@/lib/security-agent";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = readStore();
  return NextResponse.json({ securityAudits: store.securityAudits });
}

export async function POST() {
  const report = runSecurityAudit();
  return NextResponse.json({ ok: true, report });
}
