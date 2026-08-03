export interface PassportGoogleProfile {
  id: string;
  emails: { value: string; verified?: boolean | string }[];
  name: { givenName: string; familyName: string };
  photos: { value: string }[];
  _json?: { email_verified?: boolean | string };
}

export interface PassportGithubProfile {
  id: string;
  username: string;
  displayName: string;
  /** passport-github2 surfaces every address on the account when the
   * `user:email` scope is granted, including ones GitHub has NOT verified. */
  emails?: { value: string; verified?: boolean | string; primary?: boolean }[];
  photos?: { value: string }[];
}

export interface GoogleOAuthProfile {
  email: string;
  /** Whether the provider asserts this address is verified. Only a verified
   * address may be matched against an existing UPZ account — see
   * OAuthService. */
  emailVerified: boolean;
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
  /** See GoogleOAuthProfile.emailVerified. */
  emailVerified: boolean;
  avatarUrl: string | undefined;
  accessToken: string;
  refreshToken: string | undefined;
}
