import { NextRequest, NextResponse } from "next/server";
import fetchSingleAppQuery from "~/queries/fetchSingleAppQuery";

export async function GET(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const app = await fetchSingleAppQuery({ appId: parseInt(appId) });
  return NextResponse.json(app);
}
