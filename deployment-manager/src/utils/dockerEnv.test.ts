import { exec } from 'child_process';
import { promisify } from 'util';
import { describe, it, expect } from 'vitest';
import { formatDockerEnvString } from './dockerEnv';

const execAsync = promisify(exec);

describe('formatDockerEnvString', () => {
  it('produces one shell-safe token per KEY=value pair', () => {
    const result = formatDockerEnvString({ FOO: 'bar', BRANCH: 'main' });
    expect(result).toBe("-eFOO='bar' -eBRANCH='main'");
  });

  it('escapes an embedded single quote so it does not close the quoted value early', () => {
    const result = formatDockerEnvString({ BRANCH: "it's-a-branch" });
    expect(result).toBe("-eBRANCH='it'\\''s-a-branch'");
  });

  it('does not let a webhook-supplied branch name achieve command substitution when run through a real shell', async () => {
    // The exact failure mode reported against the previous double-quote-only formatting:
    // a Git-valid branch name containing a command substitution. Run the generated string
    // through an actual shell (the same way execCommand() in docker.ts does) - if escaping
    // is broken, `$(echo INJECTED-MARKER)` is REPLACED with just `INJECTED-MARKER` before
    // echo ever sees it, changing the output. Escaped correctly, the whole `$(...)`
    // expression survives byte-for-byte as inert literal text in the branch name.
    const maliciousBranch = 'feature/$(echo INJECTED-MARKER)';
    const envString = formatDockerEnvString({ BRANCH: maliciousBranch });

    // Stand in for `docker run ... ${envString} ...`: just echo what a shell would hand a
    // process as argv, one token per env flag.
    const { stdout } = await execAsync(`echo ${envString}`);

    expect(stdout.trim()).toBe(`-eBRANCH=${maliciousBranch}`);
  });

  it('does not let backtick command substitution execute either', async () => {
    const maliciousBranch = 'feature/`echo INJECTED-MARKER`';
    const envString = formatDockerEnvString({ BRANCH: maliciousBranch });

    const { stdout } = await execAsync(`echo ${envString}`);

    expect(stdout.trim()).toBe(`-eBRANCH=${maliciousBranch}`);
  });

  it('does not let a trailing semicolon terminate the command early', async () => {
    const maliciousBranch = 'feature/x; echo INJECTED-MARKER';
    const envString = formatDockerEnvString({ BRANCH: maliciousBranch });

    const { stdout } = await execAsync(`echo ${envString}`);

    expect(stdout.trim()).toBe(`-eBRANCH=${maliciousBranch}`);
  });
});
