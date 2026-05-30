declare module 'js-cookie' {
  export interface CookieAttributes {
    expires?: number | Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    [key: string]: any;
  }

  const cookie: {
    get(name: string): string | undefined;
    get(): Record<string, string>;
    set(name: string, value: string, options?: CookieAttributes): void;
    remove(name: string, options?: CookieAttributes): void;
  };

  export default cookie;
}
