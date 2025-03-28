import { createApp } from "~/app/(dashboard)/apps/[appName]/actions";
import Card from '~/components/general/Card';

export default async function AppRegistrationForm() {
  async function handleSubmit(formData: FormData) {
    "use server";

    const name = formData.get('name') as string;
    const repo_url = formData.get('repository') as string;
    const branch = formData.get('branch') as string;
    const domain = formData.get('domain') as string;

    await createApp({ name, repo_url, branch, domain });
  }

  return (
    <Card
      className="bg-white"
      title="Register New App"
      content={
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              App Name:
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="repository" className="block text-sm font-medium text-gray-700 mb-2">
              Repository URL:
            </label>
            <input
              type="text"
              id="repository"
              name="repository"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-2">
              Branch:
            </label>
            <input
              type="text"
              id="branch"
              name="branch"
              defaultValue="main"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-2">
              Domain:
            </label>
            <input
              type="text"
              id="domain"
              name="domain"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
          >
            Register App
          </button>
        </form>}
    />
  );
}