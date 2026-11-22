import { NextResponse } from "next/server";
import { generateSnapshot } from "@/lib/snapshot-engine";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = readStore();
  return NextResponse.json({ snapshots: store.snapshots });
}

export async function POST() {
  const snapshot = await generateSnapshot();
  return NextResponse.json({ ok: true, snapshot });
}
