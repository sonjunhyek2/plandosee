import { NextRequest, NextResponse } from "next/server";
import { createNextPlanFromReview } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ reviewId: string }> }
) {
  try {
    const { reviewId } = await context.params;
    const body = await req.json();
    const result = await createNextPlanFromReview({ ...body, reviewId });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

