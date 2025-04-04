import { NextResponse } from "next/server";
import fetchRecentDeploymentsQuery from "~/queries/fetchRecentDeploymentsQuery";
import { withAuth } from "~/lib/auth-utils";

export const GET = withAuth(async (request: Request) => {
  const deployments = await fetchRecentDeploymentsQuery();
  return NextResponse.json(deployments);
});
