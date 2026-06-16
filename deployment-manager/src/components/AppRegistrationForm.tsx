import { createApp } from "~/app/(dashboard)/apps/[appName]/actions";
import Card from '~/components/general/Card';
import Input from '~/components/general/Input';

export default async function AppRegistrationForm() {
  async function handleSubmit(formData: FormData) {
    "use server";

    const name = formData.get('name') as string;
    const repo_url = formData.get('repository') as string;
    const branch = formData.get('branch') as string;
    const domain = formData.get('domain') as string;
    const root_path = (formData.get('root_path') as string) || undefined;

    await createApp({ name, repo_url, branch, domain, root_path });
  }

  return (
    <Card
      className="bg-white"
      title="Register New App"
      content={
        <form action={handleSubmit} className="space-y-4">
          <Input
            type="text"
            id="name"
            name="name"
            label="App Name"
            required
          />

          <Input
            type="text"
            id="repository"
            name="repository"
            label="Repository URL"
            required
          />

          <Input
            type="text"
            id="branch"
            name="branch"
            label="Branch"
            defaultValue="main"
            required
          />

          <Input
            type="text"
            id="domain"
            name="domain"
            label="Domain"
            required
          />

          <div>
            <Input
              type="text"
              id="root_path"
              name="root_path"
              label="Project path (optional)"
              placeholder="marketing-site"
            />
            <p className="mt-1 text-sm text-gray-500">
              For monorepos, set the subdirectory containing your Next.js app (must include
              package.json and next.config.ts). Leave empty to use the repository root.
            </p>
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
