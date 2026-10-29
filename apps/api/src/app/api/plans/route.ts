import { NextRequest, NextResponse } from "next/server";
import { createPlan, listPlansWithDetails } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = await listPlansWithDetails();
    return NextResponse.json({ ok: true, plans });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = await createPlan(body);
    return NextResponse.json({ ok: true, plan }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

