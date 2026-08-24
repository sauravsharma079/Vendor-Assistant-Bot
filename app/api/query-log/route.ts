import { NextResponse } from "next/server";
import { getQueryLog } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ queryLog: await getQueryLog() });
}
