import { NextRequest, NextResponse } from "next/server";
import fetchRecentDeploymentsQuery from "~/queries/fetchRecentDeploymentsQuery";

export async function GET(request: NextRequest, { params }: { params: { appId: string } }) {
  const { appId } = await params;

  const deployments = await fetchRecentDeploymentsQuery(Number(appId));

  return NextResponse.json(deployments);
}