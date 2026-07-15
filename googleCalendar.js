import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export function createGoogleCalendarRequest(clientId) {
  return AuthSession.useAuthRequest(
    {
      clientId: clientId || 'demo-client-id',
      scopes: GOOGLE_CALENDAR_SCOPES,
      responseType: AuthSession.ResponseType.Token,
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'catchup' }),
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' },
  );
}

export function getGoogleCalendarConfig() {
  return {
    scopes: GOOGLE_CALENDAR_SCOPES,
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'catchup' }),
  };
}
