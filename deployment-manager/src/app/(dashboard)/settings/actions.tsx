import { getServicesHealth } from "~/services/docker";

export async function fetchServicesHealth() {
  try {
    const servicesHealth = await getServicesHealth();
    return servicesHealth;
  } catch (error) {
    console.error('Error fetching services health:', error);
    return [];
  }
}