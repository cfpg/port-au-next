import { fetchApps } from "~/app/actions";

import Sidebar from "./Sidebar";

export default async function SidebarContainer() {
  const apps = await fetchApps();
  return (
    <Sidebar apps={apps} />
  )
}