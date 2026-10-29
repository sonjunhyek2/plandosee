import { NextRequest, NextResponse } from "next/server";
import { getPlanById, updatePlanWithSnapshot, PdsDomainError } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    const plan = await getPlanById(planId);
    if (!plan) {
      throw new PdsDomainError("계획을 찾을 수 없습니다.", 404, "PLAN_NOT_FOUND");
    }
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await context.params;
    const body = await req.json();
    const plan = await updatePlanWithSnapshot({ ...body, planId });
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    return handleApiError(err);
  }
}

