import { NextResponse } from "next/server";
import { getAuditLog } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ auditLog: getAuditLog() });
}
