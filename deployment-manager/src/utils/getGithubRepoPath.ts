export default function getGithubRepoPath(appName: string) {
  // Extract repo username and path from github SSH url or HTTPS url
  const sshUrlMatch = appName.match(/^git@github\.com:(.*)\/(.*)\.git$/);
  const httpsUrlMatch = appName.match(/^https:\/\/github\.com\/(.*)\/(.*)\.git$/);

  if (sshUrlMatch) {
    return `${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  } else if (httpsUrlMatch) { 
    return `${httpsUrlMatch[1]}/${httpsUrlMatch[2]}`;
  } else {
    return appName;
  }
}