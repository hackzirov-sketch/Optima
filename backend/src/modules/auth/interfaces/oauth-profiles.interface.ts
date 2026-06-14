export interface GoogleOAuthProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  accessToken: string;
  refreshToken: string;
}

export interface GitHubOAuthProfile {
  githubId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | undefined;
  avatarUrl: string | undefined;
  accessToken: string;
  refreshToken: string | undefined;
}
