import { NextRequest, NextResponse } from "next/server";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withRequestLog } from "@/lib/api/handler";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { exportVenueData } from "@/lib/privacy/export";
import { currentStaff } from "@/lib/privacy/staff";

// DATA-006: venue staff download everything the platform holds for their
// venue as one JSON file.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withRequestLog(request, async () => {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    try {
      const data = await exportVenueData(staff.venueId, {
        actorId: staff.userId,
        requestId: request.headers.get(REQUEST_ID_HEADER),
      });
      if (!data) return NextResponse.json({ error: "Локалот не е пронајден." }, { status: 404 });
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="podatoci-${date}.json"`,
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      return errorResponse(err, "Не успеа преземањето на податоците.", request);
    }
  });
}
