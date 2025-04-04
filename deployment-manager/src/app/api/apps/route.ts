import { NextResponse } from "next/server";
import { fetchApps } from "~/app/(dashboard)/actions";
import { withAuth } from "~/lib/auth-utils";

export const GET = withAuth(async (request: Request) => {
  const apps = await fetchApps();
  return NextResponse.json(apps);
});
