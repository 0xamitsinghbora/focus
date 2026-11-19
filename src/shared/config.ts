export const SUPPORT_EMAIL =
  (typeof process !== 'undefined' && process.env && process.env.SUPPORT_EMAIL) ||
  'support@healthos.dev'

export const GOOGLE_OAUTH = {
  clientId:
    (typeof process !== 'undefined' && process.env && process.env.GOOGLE_OAUTH_CLIENT_ID) ||
    undefined,
  clientSecret:
    (typeof process !== 'undefined' && process.env && process.env.GOOGLE_OAUTH_CLIENT_SECRET) ||
    undefined,
  redirectUri:
    (typeof process !== 'undefined' && process.env && process.env.GOOGLE_OAUTH_REDIRECT_URI) ||
    'http://127.0.0.1:3456/oauth2callback'
} as const

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(GOOGLE_OAUTH.clientId && GOOGLE_OAUTH.redirectUri)
}
