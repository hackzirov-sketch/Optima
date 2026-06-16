export interface PassportGoogleProfile {
  id: string;
  emails: { value: string }[];
  name: { givenName: string; familyName: string };
  photos: { value: string }[];
}

export interface PassportGithubProfile {
  id: string;
  username: string;
  displayName: string;
  emails?: { value: string }[];
  photos?: { value: string }[];
}

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
