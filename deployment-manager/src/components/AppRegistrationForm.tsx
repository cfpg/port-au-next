import { createApp } from "~/app/(dashboard)/apps/[appName]/actions";
import FormSection from '~/components/general/FormSection';
import Input from '~/components/general/Input';
import Button from '~/components/general/Button';

export default async function AppRegistrationForm() {
  async function handleSubmit(formData: FormData) {
    "use server";

    const name = formData.get('name') as string;
    const repo_url = formData.get('repository') as string;
    const branch = formData.get('branch') as string;
    const domain = formData.get('domain') as string;
    const root_path = (formData.get('root_path') as string) || undefined;
    const defer_github_clone = formData.get('defer_github_clone') === 'on';

    await createApp({ name, repo_url, branch, domain, root_path, defer_github_clone });
  }

  return (
    <FormSection
      title="Register New App"
      action={handleSubmit}
      footer={<Button type="submit" variant="primary">Register app</Button>}
    >
      <Input type="text" id="name" name="name" label="App Name" required />
      <Input type="text" id="repository" name="repository" label="Repository URL" required />
      <Input type="text" id="branch" name="branch" label="Branch" defaultValue="main" required />
      <Input type="text" id="domain" name="domain" label="Domain" required />
      <Input
        type="text"
        id="root_path"
        name="root_path"
        label="Project path"
        placeholder="marketing-site"
        className="col-span-full"
        hint="For monorepos, the subdirectory containing your Next.js app (must include package.json and next.config.ts). Leave empty to use the repository root."
      />
      <div className="col-span-full flex items-center gap-8">
        <input
          type="checkbox"
          id="defer_github_clone"
          name="defer_github_clone"
          className="size-15 rounded-badge border border-line-strong accent-primary"
        />
        <label htmlFor="defer_github_clone" className="text-panel text-ink-muted cursor-pointer">
          Private repository - skip cloning now, I&apos;ll connect GitHub App from this app&apos;s settings first
        </label>
      </div>
    </FormSection>
  );
}
