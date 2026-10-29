import { NextRequest, NextResponse } from "next/server";
import { createReview } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const review = await createReview(body);
    return NextResponse.json({ ok: true, review }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

