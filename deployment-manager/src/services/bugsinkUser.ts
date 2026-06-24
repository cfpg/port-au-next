import { execCompose } from '~/utils/compose';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Idempotent: creates the dashboard user if missing, ensures team/project memberships exist.
 * Does not rotate the password when the user already exists.
 */
export async function ensureBugsinkDashboardUser(
  username: string,
  password: string,
  teamId: string,
  projectId: number
): Promise<void> {
  const email = `${username}@apps.port-au-next.invalid`;
  const paramsJson = JSON.stringify({ username, password, email, teamId, projectId });

  const script = `
import json
from django.contrib.auth import get_user_model
from teams.models import TeamMembership, TeamRole
from projects.models import ProjectMembership, ProjectRole

params = json.loads(${JSON.stringify(paramsJson)})
User = get_user_model()
user, created = User.objects.get_or_create(
    username=params["username"],
    defaults={"email": params["email"], "is_active": True},
)
if created:
    user.set_password(params["password"])
    user.save()
TeamMembership.objects.get_or_create(
    team_id=params["teamId"],
    user_id=user.id,
    defaults={"role": TeamRole.MEMBER, "accepted": True},
)
ProjectMembership.objects.get_or_create(
    project_id=params["projectId"],
    user_id=user.id,
    defaults={"role": ProjectRole.MEMBER, "accepted": True},
)
print("ok")
`.trim();

  const output = await execCompose(
    `exec -T bugsink bugsink-manage shell -c ${shellQuote(script)}`
  );

  if (!output.includes('ok')) {
    throw new Error(
      `Bugsink dashboard user provisioning failed: ${output.trim().slice(0, 300)}`
    );
  }
}
