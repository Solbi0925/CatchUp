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

export function calendarWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 28);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export function mapGoogleEvent(item) {
  const isAllDay = Boolean(item.start?.date);
  const startValue = item.start?.dateTime || item.start?.date;
  const endValue = item.end?.dateTime || item.end?.date || startValue;
  if (!startValue) return null;

  const startDate = isAllDay ? startValue : startValue.slice(0, 10);
  const startTime = isAllDay ? '종일' : new Date(startValue).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const endTime = isAllDay ? '종일' : new Date(endValue).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  return {
    id: `google-${item.id}`,
    title: item.summary || '(제목 없음)',
    date: startDate,
    start: startTime,
    end: endTime,
    calendar: 'Google Calendar',
    color: '#5C8D89',
    type: 'personal',
    location: item.location || 'Google Calendar',
  };
}

export async function fetchGoogleCalendarEvents(accessToken) {
  if (!accessToken) throw new Error('Google Calendar access token is missing');
  const { timeMin, timeMax } = calendarWindow();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google Calendar request failed: ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).map(mapGoogleEvent).filter(Boolean);
}
