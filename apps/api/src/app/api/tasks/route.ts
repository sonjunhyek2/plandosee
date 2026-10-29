import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const task = await createTask(body);
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

