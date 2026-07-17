import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { MOCK_EVENTS, MOCK_PLAN_ITEMS, MOCK_EVENTS as SAMPLE_EVENTS, TODAY, eventsForDate, eventsForMonth, formatKoreanDate, plansForDate } from './src/data/mockCalendar';
import { fetchGoogleCalendarEvents, getGoogleRedirectUri, GOOGLE_AUTH_DISCOVERY, GOOGLE_CALENDAR_SCOPES } from './src/services/googleCalendar';

const COLORS = {
  ink: '#252135',
  muted: '#8D889C',
  line: '#EAE6F4',
  canvas: '#FCFBFF',
  lavender: '#F2EEFF',
  purple: '#8B69F7',
  purpleDark: '#6F4BE9',
  purpleSoft: '#E7DEFF',
  white: '#FFFFFF',
  green: '#67C7A0',
  yellow: '#FFD36A',
};

function IconButton({ name, onPress, color = COLORS.ink, size = 21 }) {
  return <Pressable onPress={onPress} hitSlop={12} style={styles.iconButton}><Ionicons name={name} size={size} color={color} /></Pressable>;
}

function Header({ title, action, onAction }) {
  return <View style={styles.header}><Text style={styles.headerTitle}>{title}</Text>{action ? <IconButton name={action} onPress={onAction || (() => {})} /> : <View style={styles.headerSpacer} />}</View>;
}

function MateButton({ onPress }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.mateButton, pressed && styles.pressed]}><Ionicons name="sparkles" size={17} color={COLORS.white} /><Text style={styles.mateButtonText}>AI Mate</Text></Pressable>;
}

function BottomTabs({ tab, onChange }) {
  const tabs = [['Today', 'home-outline'], ['Month', 'calendar-outline'], ['Upload', 'cloud-upload-outline']];
  return <View style={styles.tabBar}>{tabs.map(([label, icon]) => <Pressable key={label} style={styles.tabItem} onPress={() => onChange(label)}><Ionicons name={tab === label ? icon.replace('-outline', '') : icon} size={21} color={tab === label ? COLORS.purple : COLORS.muted} /><Text style={[styles.tabLabel, tab === label && styles.tabLabelActive]}>{label}</Text></Pressable>)}</View>;
}

function TaskCard({ plan }) {
  return <View style={styles.taskCard}><Pressable style={styles.taskCheck}><Ionicons name="checkmark" size={12} color={COLORS.white} /></Pressable><View style={styles.taskCopy}><Text style={styles.taskTitle}>{plan.title}</Text><View style={styles.taskMetaRow}><Text style={styles.taskMeta}>{plan.source}</Text><Text style={styles.taskPriority}>{plan.priority}</Text><Text style={styles.taskDue}>7/{plan.date.slice(8)} 마감</Text></View></View></View>;
}

function EventCard({ event }) {
  return <View style={styles.eventCard}><View style={[styles.eventDot, { backgroundColor: event.color || COLORS.purple }]} /><View style={styles.eventCardCopy}><Text style={styles.eventCardTitle}>{event.title}</Text><Text style={styles.eventCardMeta}>{event.start} - {event.end} · {event.calendar}</Text></View><Ionicons name="chevron-forward" size={16} color={COLORS.muted} /></View>;
}

function Onboarding({ onContinue }) {
  return <Pressable style={styles.splash} onPress={onContinue}><View style={styles.splashGlowTop} /><View style={styles.splashGlowBottom} /><View style={styles.splashCenter}><Text style={styles.splashBrand}>Catch Up</Text><Text style={styles.splashSubtitle}>오늘도 이번 주{`\n`}학업 계획을 한눈에</Text></View><Text style={styles.splashTapHint}>화면을 눌러 시작하기</Text></Pressable>;
}

function ConnectScreen({ onConnected, onSkip }) {
  const clientId = Constants.expoConfig?.extra?.googleCalendarClientId || '';
  const redirectUri = getGoogleRedirectUri();
  const [request, response, promptAsync] = AuthSession.useAuthRequest({ clientId: clientId || 'demo-client-id', scopes: GOOGLE_CALENDAR_SCOPES, responseType: AuthSession.ResponseType.Token, redirectUri, extraParams: { prompt: 'select_account' } }, GOOGLE_AUTH_DISCOVERY);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (response?.type === 'success') { setStatus('connected'); onConnected({ accessToken: response.authentication?.accessToken || response.params?.access_token }); }
    if (response?.type === 'error') { setStatus('error'); setErrorMessage(response.params?.error_description || response.error?.message || 'Google 인증이 취소되었거나 redirect 설정이 맞지 않습니다.'); }
  }, [response, onConnected]);

  async function connect() {
    if (!clientId) { setStatus('demo'); onConnected({ mode: 'demo' }); return; }
    setStatus('loading');
    setErrorMessage('');
    await promptAsync();
  }

  return <SafeAreaView style={styles.authScreen}><ScrollView contentContainerStyle={styles.authContent}><Text style={styles.authTitle}>Google Calendar 연결</Text><Text style={styles.authBody}>개인 일정과 수업 시간을{`\n`}함께 반영해요</Text><View style={styles.calendarIllustration}><View style={styles.calendarIcon}><Text style={styles.calendarIconDay}>31</Text></View><View style={styles.calendarOutline}><View /><View /><View /></View><View style={styles.linkBadge}><Ionicons name="link" size={22} color={COLORS.white} /></View></View><View style={styles.benefitCard}><View style={styles.benefitRow}><Ionicons name="calendar-outline" size={20} color={COLORS.purple} /><Text style={styles.benefitText}>개인 일정과 수업 시간을 같은 계획에 반영</Text></View><View style={styles.benefitRow}><Ionicons name="time-outline" size={20} color={COLORS.purple} /><Text style={styles.benefitText}>충돌 없는 일정으로 하루 만들기</Text></View><View style={styles.benefitRow}><Ionicons name="shield-checkmark-outline" size={20} color={COLORS.purple} /><Text style={styles.benefitText}>언제든 연결 해제 가능</Text></View><Pressable style={styles.authButton} onPress={connect} disabled={!request && Boolean(clientId) && status === 'loading'}><Ionicons name="logo-google" size={17} color={COLORS.white} /><Text style={styles.authButtonText}>{status === 'loading' ? '연결 중...' : '캘린더 연결하기'}</Text></Pressable></View>{status === 'error' ? <View style={styles.errorBox}><Text style={styles.errorText}>연결하지 못했어요. 다시 시도해주세요.</Text><Text style={styles.errorDetail}>{errorMessage}</Text></View> : null}<Pressable onPress={() => onSkip({ mode: 'demo' })}><Text style={styles.skipText}>나중에 할게요</Text></Pressable></ScrollView></SafeAreaView>;
}

function DateStrip() {
  const dates = ['13', '14', '15', '16', '17', '18', '19'];
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return <View style={styles.dateStrip}>{dates.map((date, index) => <View key={date} style={[styles.dateItem, date === '15' && styles.dateItemActive]}><Text style={[styles.dateDay, date === '15' && styles.dateDayActive]}>{days[index]}</Text><Text style={[styles.dateNumber, date === '15' && styles.dateNumberActive]}>{date}</Text></View>)}</View>;
}

function TodayScreen({ onMate, calendarEvents }) {
  const events = eventsForDate(TODAY, calendarEvents);
  const plans = plansForDate(TODAY);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.todayHeader}><View><Text style={styles.todayGreeting}>오늘도 따라잡아볼까요? 👋</Text><Text style={styles.todayDate}>7월 15일 수요일</Text></View><IconButton name="notifications-outline" onPress={() => {}} color={COLORS.muted} /></View><DateStrip /><View style={styles.mateCard}><View style={styles.mateCardIcon}><Ionicons name="sparkles" size={18} color={COLORS.purple} /></View><View style={styles.mateCardCopy}><Text style={styles.mateCardTitle}>AI Mate</Text><Text style={styles.mateCardText}>4주 일정을 고려해 중요한 일부터 정리했어요.{`\n`}오늘 집중하면 목표 달성이 더 쉬워요!</Text></View><Text style={styles.mateMascot}>✦</Text></View><View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>오늘의 할 일</Text><Text style={styles.countBadge}>{plans.length}개</Text></View><View style={styles.taskList}>{plans.map((plan) => <TaskCard key={plan.id} plan={plan} />)}</View><View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>오늘의 일정</Text><Text style={styles.sectionAction}>{events.length}개</Text></View><View style={styles.eventList}>{events.length ? events.map((event) => <EventCard key={event.id} event={event} />) : <Text style={styles.emptyText}>오늘 예정된 일정이 없습니다.</Text>}</View></ScrollView><MateButton onPress={onMate} /></SafeAreaView>;
}

function MonthScreen({ onMate, calendarEvents }) {
  const year = 2026;
  const month = 7;
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [detailVisible, setDetailVisible] = useState(false);
  const monthEvents = eventsForMonth(year, month, calendarEvents);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: 35 }, (_, index) => { const day = index - firstDay + 1; return day > 0 && day <= daysInMonth ? day : null; });
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.monthHeader}><Text style={styles.monthTitle}>2026년 7월</Text><View style={styles.monthActions}><IconButton name="calendar-outline" onPress={() => {}} color={COLORS.muted} /><IconButton name="menu-outline" onPress={() => {}} color={COLORS.muted} /></View></View><View style={styles.calendarCard}><View style={styles.weekHeader}>{['일', '월', '화', '수', '목', '금', '토'].map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}</View><View style={styles.monthGrid}>{cells.map((day, index) => { const date = day ? `2026-07-${String(day).padStart(2, '0')}` : null; const dayEvents = date ? monthEvents.filter((event) => event.date === date) : []; return <Pressable key={`${day}-${index}`} onPress={() => { if (date) { setSelectedDate(date); setDetailVisible(true); } }} style={[styles.monthCell, date === TODAY && styles.monthTodayCell]}>{day ? <Text style={[styles.monthDay, date === TODAY && styles.monthTodayDay]}>{day}</Text> : null}<View style={styles.dotRow}>{dayEvents.slice(0, 3).map((event) => <View key={event.id} style={[styles.calendarDot, { backgroundColor: event.color || COLORS.purple }]} />)}</View>{dayEvents[0] ? <Text numberOfLines={1} style={styles.calendarPill}>{dayEvents[0].title}</Text> : null}</Pressable>; })}</View></View><View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>이번 주 플래너</Text><Text style={styles.sectionAction}>7/13 - 7/19</Text></View><View style={styles.weekPlanner}>{['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'].map((date) => { const plans = plansForDate(date); const day = new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' }); return <View key={date} style={[styles.plannerRow, date === TODAY && styles.plannerRowActive]}><View style={styles.plannerDate}><Text style={styles.plannerDay}>{day}</Text><Text style={styles.plannerNumber}>{date.slice(8)}</Text></View><View style={styles.plannerCopy}>{plans.length ? <Text style={styles.plannerText}>{plans[0].title}</Text> : <Text style={styles.plannerEmpty}>계획 없음</Text>}</View></View>; })}</View></ScrollView><MateButton onPress={onMate} /><Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}><View style={styles.modalBackdrop}><View style={styles.detailSheet}><View style={styles.sheetHandle} /><View style={styles.sheetTitleRow}><View><Text style={styles.sheetEyebrow}>SCHEDULE DETAIL</Text><Text style={styles.sheetTitle}>{formatKoreanDate(selectedDate)}</Text></View><IconButton name="close" onPress={() => setDetailVisible(false)} /></View>{eventsForDate(selectedDate, calendarEvents).length ? eventsForDate(selectedDate, calendarEvents).map((event) => <EventCard key={event.id} event={event} />) : <View style={styles.emptyDetail}><Ionicons name="calendar-outline" size={28} color={COLORS.muted} /><Text style={styles.emptyTitle}>이 날짜에는 일정이 없습니다.</Text><Text style={styles.emptyText}>Google Calendar 일정이 표시됩니다.</Text></View>}</View></View></Modal></SafeAreaView>;
}

function UploadScreen({ onMate, calendarStatus }) {
  const statusLabel = calendarStatus === 'connected' ? 'Google Calendar 연결됨' : calendarStatus === 'fallback' ? '샘플 일정 표시 중' : '데모 연결됨';
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Header title="자료 업로드" action="folder-outline" /><Pressable style={styles.uploadCard} disabled><Ionicons name="cloud-upload-outline" size={40} color={COLORS.purple} /><Text style={styles.uploadTitle}>학업 자료 업로드</Text><Text style={styles.uploadSubtitle}>PDF 또는 이미지 파일</Text></Pressable><View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>업로드한 자료</Text><Text style={styles.sectionAction}>준비 중</Text></View><View style={styles.fileCard}><View style={styles.fileIcon}><Text style={styles.fileIconText}>PDF</Text></View><View style={styles.fileCopy}><Text style={styles.fileName}>강의계획서.pdf</Text><Text style={styles.fileMeta}>2.4MB · 2026-07-05</Text></View><View style={styles.completePill}><Text style={styles.completeText}>추출 완료</Text></View><Ionicons name="chevron-forward" size={16} color={COLORS.muted} /></View><View style={styles.fileCard}><View style={styles.fileIcon}><Text style={styles.fileIconText}>PDF</Text></View><View style={styles.fileCopy}><Text style={styles.fileName}>강의계획서.pdf</Text><Text style={styles.fileMeta}>2.4MB · 2026-07-05</Text></View><View style={styles.completePill}><Text style={styles.completeText}>추출 완료</Text></View><Ionicons name="chevron-forward" size={16} color={COLORS.muted} /></View><View style={styles.extractCard}><View style={styles.extractIcon}><Ionicons name="sparkles" size={17} color={COLORS.purple} /></View><View style={styles.fileCopy}><Text style={styles.fileName}>추출 결과 확인 및 수정</Text><Text style={styles.fileMeta}>AI가 추출한 정보를 확인하고{`\n`}필요 시 수정할 수 있어요</Text></View><Ionicons name="chevron-forward" size={16} color={COLORS.muted} /></View><View style={styles.connectionStatus}><View style={styles.connectedDot} /><Text style={styles.connectionStatusText}>{statusLabel}</Text></View></ScrollView><MateButton onPress={onMate} /></SafeAreaView>;
}

function MateModal({ visible, onClose }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.mateSheet}><View style={styles.sheetHandle} /><View style={styles.sheetTitleRow}><View><Text style={styles.sheetEyebrow}>AI MATE</Text><Text style={styles.sheetTitle}>이번 주 계획을 같이 볼까요?</Text></View><IconButton name="close" onPress={onClose} /></View><View style={styles.chatBubbleUser}><Text style={styles.chatBubbleUserText}>이번 주 계획 짜줘</Text></View><View style={styles.chatBubbleMate}><Ionicons name="sparkles" size={15} color={COLORS.purple} /><Text style={styles.chatBubbleMateText}>업로드 자료와 캘린더를 반영해{`\n`}이번 주 계획을 생성했어요.</Text></View><View style={styles.chatInput}><Text style={styles.chatPlaceholder}>메시지를 입력하세요...</Text><Ionicons name="send" size={18} color={COLORS.purple} /></View><Text style={styles.chatLimit}>이번 주 조정 잔여 3회</Text></View></View></Modal>;
}

function MainApp({ calendarEvents, calendarStatus }) {
  const [tab, setTab] = useState('Today');
  const [mateVisible, setMateVisible] = useState(false);
  const screen = tab === 'Today' ? <TodayScreen onMate={() => setMateVisible(true)} calendarEvents={calendarEvents} /> : tab === 'Month' ? <MonthScreen onMate={() => setMateVisible(true)} calendarEvents={calendarEvents} /> : <UploadScreen onMate={() => setMateVisible(true)} calendarStatus={calendarStatus} />;
  return <View style={styles.appRoot}>{screen}<BottomTabs tab={tab} onChange={setTab} /><MateModal visible={mateVisible} onClose={() => setMateVisible(false)} /></View>;
}

export default function App() {
  const [stage, setStage] = useState('onboarding');
  const [calendarEvents, setCalendarEvents] = useState(SAMPLE_EVENTS);
  const [calendarStatus, setCalendarStatus] = useState('demo');
  const completeConnect = async (connection = { mode: 'demo' }) => { setStage('main'); if (!connection.accessToken) { setCalendarEvents(SAMPLE_EVENTS); setCalendarStatus('demo'); return; } try { const events = await fetchGoogleCalendarEvents(connection.accessToken); setCalendarEvents(events); setCalendarStatus('connected'); } catch (error) { setCalendarEvents(SAMPLE_EVENTS); setCalendarStatus('fallback'); } };
  return <><StatusBar barStyle="dark-content" />{stage === 'onboarding' ? <Onboarding onContinue={() => setStage('connect')} /> : stage === 'connect' ? <ConnectScreen onConnected={completeConnect} onSkip={completeConnect} /> : <MainApp calendarEvents={calendarEvents} calendarStatus={calendarStatus} />}</>;
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: COLORS.canvas },
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 26 : 12, paddingBottom: 120 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  headerTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '900' },
  headerSpacer: { width: 34 },
  splash: { flex: 1, backgroundColor: '#EEE8FF', paddingHorizontal: 28, paddingTop: 30, paddingBottom: 24, alignItems: 'center', overflow: 'hidden' },
  splashGlowTop: { position: 'absolute', width: 330, height: 330, borderRadius: 165, borderWidth: 1, borderColor: '#FFFFFF', top: -110, left: -70, opacity: 0.75 },
  splashGlowBottom: { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 1, borderColor: '#FFFFFF', bottom: -100, right: -90, opacity: 0.8 },
  splashTop: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  splashBrand: { color: COLORS.purple, fontSize: 43, fontWeight: '900', fontStyle: 'italic', letterSpacing: -2 },
  splashSubtitle: { color: COLORS.ink, fontSize: 13, lineHeight: 22, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  splashTapHint: { color: '#A69DBB', fontSize: 10, marginBottom: 5 },
  splashCenter: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  splashCalendar: { width: 122, height: 122, borderRadius: 30, backgroundColor: COLORS.white, padding: 18, marginBottom: 32, transform: [{ rotate: '-6deg' }], shadowColor: COLORS.purple, shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  splashCalendarLabel: { color: COLORS.purple, fontSize: 11, fontWeight: '900' },
  splashCalendarDate: { color: COLORS.ink, fontSize: 48, lineHeight: 54, fontWeight: '900' },
  splashCalendarLine: { width: 64, height: 7, borderRadius: 4, backgroundColor: COLORS.purpleSoft, marginTop: 7 },
  splashCalendarLineShort: { width: 40, height: 7, borderRadius: 4, backgroundColor: COLORS.line, marginTop: 6 },
  splashTitle: { color: COLORS.ink, fontSize: 29, lineHeight: 39, fontWeight: '900', textAlign: 'center', letterSpacing: -0.7 },
  splashBody: { color: '#756F85', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 15 },
  splashButton: { width: '100%', height: 55, borderRadius: 17, backgroundColor: COLORS.purple, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  splashButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  splashNote: { color: '#9D96AE', fontSize: 10, marginTop: 12 },
  authScreen: { flex: 1, backgroundColor: '#F8F5FF' },
  authHeader: { height: 65, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  authHeaderTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  authContent: { paddingHorizontal: 25, alignItems: 'center', paddingTop: 63, paddingBottom: 30 },
  calendarIllustration: { width: 225, height: 170, marginTop: 20, marginBottom: 15, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  calendarIcon: { width: 86, height: 86, borderRadius: 17, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.purple, shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, transform: [{ rotate: '-4deg' }] },
  calendarIconDay: { color: '#4285F4', fontSize: 32, fontWeight: '900' },
  calendarOutline: { position: 'absolute', right: 20, width: 84, height: 76, borderWidth: 2, borderColor: COLORS.purpleSoft, borderRadius: 12, transform: [{ rotate: '7deg' }], flexDirection: 'row', padding: 15, gap: 7 },
  linkBadge: { position: 'absolute', right: 20, bottom: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.purple, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.purple, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  authTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  authBody: { color: COLORS.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9 },
  benefitCard: { width: '100%', backgroundColor: COLORS.white, borderRadius: 22, padding: 19, marginTop: 28, shadowColor: '#8B69F7', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 17 },
  benefitText: { color: COLORS.ink, fontSize: 12, fontWeight: '700', flex: 1 },
  authButton: { height: 52, borderRadius: 15, backgroundColor: COLORS.purple, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 4 },
  authButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '900' },
  skipText: { color: COLORS.muted, fontSize: 12, fontWeight: '700', padding: 17 },
  errorBox: { width: '100%', marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF1F4' },
  errorText: { color: '#C4566B', fontSize: 12, fontWeight: '800' },
  errorDetail: { color: '#A45A6A', fontSize: 10, lineHeight: 15, marginTop: 4 },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  todayGreeting: { color: COLORS.ink, fontSize: 21, fontWeight: '900' },
  todayDate: { color: COLORS.muted, fontSize: 12, fontWeight: '700', marginTop: 5 },
  dateStrip: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 19 },
  dateItem: { width: 39, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dateItemActive: { backgroundColor: COLORS.ink },
  dateDay: { color: COLORS.muted, fontSize: 10, fontWeight: '800', marginBottom: 5 },
  dateDayActive: { color: '#C5B7FF' },
  dateNumber: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  dateNumberActive: { color: COLORS.white },
  mateCard: { borderWidth: 1, borderColor: '#D9C9FF', backgroundColor: '#FBF9FF', borderRadius: 18, minHeight: 83, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 23 },
  mateCardIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.purpleSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  mateCardCopy: { flex: 1 },
  mateCardTitle: { color: COLORS.purple, fontSize: 11, fontWeight: '900', marginBottom: 5 },
  mateCardText: { color: COLORS.ink, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  mateMascot: { color: COLORS.purple, fontSize: 36, fontWeight: '900', transform: [{ rotate: '12deg' }] },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  sectionAction: { color: COLORS.purple, fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  countBadge: { color: COLORS.purple, backgroundColor: COLORS.purpleSoft, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: '900', marginLeft: 7 },
  taskList: { gap: 9, marginBottom: 24 },
  taskCard: { minHeight: 69, borderRadius: 14, backgroundColor: COLORS.white, padding: 13, flexDirection: 'row', alignItems: 'center', shadowColor: '#6F4BE9', shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 } },
  taskCheck: { width: 19, height: 19, borderRadius: 5, borderWidth: 1, borderColor: '#BDB7CB', marginRight: 11, alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1 },
  taskTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  taskMeta: { color: COLORS.purple, fontSize: 10, fontWeight: '800' },
  taskPriority: { color: '#A98CF6', fontSize: 10, fontWeight: '800' },
  taskDue: { color: COLORS.muted, backgroundColor: '#F2F0F6', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, fontSize: 9, marginLeft: 'auto' },
  eventList: { gap: 8 },
  eventCard: { minHeight: 61, borderRadius: 14, backgroundColor: COLORS.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginRight: 11 },
  eventCardCopy: { flex: 1 },
  eventCardTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  eventCardMeta: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  emptyText: { color: COLORS.muted, fontSize: 12, paddingVertical: 18 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  monthTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '900' },
  monthActions: { flexDirection: 'row', gap: 3 },
  calendarCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 10, marginBottom: 23 },
  weekHeader: { flexDirection: 'row', marginBottom: 7 },
  weekDay: { width: `${100 / 7}%`, color: COLORS.muted, fontSize: 10, textAlign: 'center', fontWeight: '800' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: `${100 / 7}%`, height: 60, alignItems: 'center', paddingTop: 7, borderRadius: 10 },
  monthTodayCell: { backgroundColor: COLORS.purpleSoft },
  monthDay: { color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  monthTodayDay: { color: COLORS.purpleDark, fontWeight: '900' },
  dotRow: { flexDirection: 'row', gap: 3, height: 7, marginTop: 4 },
  calendarDot: { width: 4, height: 4, borderRadius: 2 },
  calendarPill: { maxWidth: 35, color: COLORS.purpleDark, backgroundColor: COLORS.purpleSoft, borderRadius: 4, fontSize: 6, paddingHorizontal: 3, paddingVertical: 2, marginTop: 2 },
  weekPlanner: { backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 14 },
  plannerRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line },
  plannerRowActive: { backgroundColor: '#F8F5FF', marginHorizontal: -14, paddingHorizontal: 14 },
  plannerDate: { width: 46, alignItems: 'center' },
  plannerDay: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  plannerNumber: { color: COLORS.ink, fontSize: 15, fontWeight: '900', marginTop: 3 },
  plannerCopy: { flex: 1, paddingLeft: 10 },
  plannerText: { color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  plannerEmpty: { color: '#B1ACBB', fontSize: 11 },
  uploadCard: { height: 153, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CDBBFF', backgroundColor: '#FEFDFF', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  uploadTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900', marginTop: 9 },
  uploadSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  fileCard: { minHeight: 68, borderRadius: 14, backgroundColor: COLORS.white, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fileIcon: { width: 30, height: 34, borderRadius: 6, backgroundColor: COLORS.purpleSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  fileIconText: { color: COLORS.purpleDark, fontSize: 8, fontWeight: '900' },
  fileCopy: { flex: 1 },
  fileName: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  fileMeta: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  completePill: { backgroundColor: '#E3F7ED', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, marginRight: 8 },
  completeText: { color: '#4BAE83', fontSize: 8, fontWeight: '900' },
  extractCard: { minHeight: 72, borderRadius: 14, backgroundColor: COLORS.white, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  extractIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: COLORS.purpleSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  connectionStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  connectionStatusText: { color: COLORS.green, fontSize: 10, fontWeight: '800' },
  mateButton: { position: 'absolute', right: 20, bottom: 86, height: 46, minWidth: 46, borderRadius: 23, paddingHorizontal: 15, backgroundColor: COLORS.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: COLORS.purpleDark, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  mateButtonText: { color: COLORS.white, fontSize: 11, fontWeight: '900' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 76, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11 },
  tabItem: { width: '33%', alignItems: 'center' },
  tabLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', marginTop: 5 },
  tabLabelActive: { color: COLORS.purple },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 33, 53, 0.35)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: COLORS.canvas, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, minHeight: 275 },
  mateSheet: { backgroundColor: COLORS.canvas, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, minHeight: 430 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D4CEDF', alignSelf: 'center', marginBottom: 20 },
  sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetEyebrow: { color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 5 },
  sheetTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  emptyDetail: { alignItems: 'center', paddingVertical: 28 },
  emptyTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800', marginTop: 10 },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: COLORS.purpleSoft, borderRadius: 14, padding: 12, marginBottom: 12 },
  chatBubbleUserText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  chatBubbleMate: { alignSelf: 'flex-start', backgroundColor: COLORS.white, borderRadius: 14, padding: 13, flexDirection: 'row', gap: 8, marginBottom: 18 },
  chatBubbleMateText: { color: COLORS.ink, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  chatInput: { height: 49, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  chatPlaceholder: { color: '#B4AFBD', fontSize: 11 },
  chatLimit: { color: COLORS.muted, fontSize: 10, textAlign: 'right', marginTop: 9 },
  pressed: { opacity: 0.8 },
});
