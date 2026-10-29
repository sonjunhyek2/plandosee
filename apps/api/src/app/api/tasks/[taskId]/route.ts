import { NextRequest, NextResponse } from "next/server";
import { softDeleteTask, updateTask } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();
    const task = await updateTask({ ...body, taskId });
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await context.params;
    const result = await softDeleteTask(taskId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}

