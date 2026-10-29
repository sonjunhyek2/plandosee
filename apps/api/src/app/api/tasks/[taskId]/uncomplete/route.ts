import { NextRequest, NextResponse } from "next/server";
import { uncompleteTaskAtomic } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();
    const result = await uncompleteTaskAtomic({ ...body, taskId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}

