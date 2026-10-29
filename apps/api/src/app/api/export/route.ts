import { NextResponse } from "next/server";
import { buildFullExportPayload } from "@/lib/pds-service";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await buildFullExportPayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const filename = `plandosee-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

