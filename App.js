import React, { useMemo, useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { MOCK_EVENTS, TODAY, eventsForDate, eventsForMonth, formatKoreanDate, plansForDate } from './src/data/mockCalendar';
import { GOOGLE_CALENDAR_SCOPES } from './src/services/googleCalendar';

const COLORS = {
  ink: '#1D252C',
  muted: '#7C858C',
  line: '#E8ECEF',
  canvas: '#F7F8F6',
  white: '#FFFFFF',
  coral: '#F08A5D',
  navy: '#1D252C',
  green: '#5C8D89',
  lavender: '#6C63FF',
};

function IconButton({ name, onPress, color = COLORS.ink, size = 22 }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.iconButton} accessibilityRole="button">
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <View style={styles.header}>
      {onBack ? <IconButton name="chevron-back" onPress={onBack} /> : <View style={styles.headerSpacer} />}
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function EventRow({ event, compact = false }) {
  return (
    <View style={[styles.eventRow, compact && styles.eventRowCompact]}>
      <View style={[styles.eventTime, compact && styles.eventTimeCompact]}>
        <Text style={styles.timeText}>{event.start}</Text>
        {!compact ? <Text style={styles.timeEnd}>{event.end}</Text> : null}
      </View>
      <View style={[styles.eventAccent, { backgroundColor: event.color }]} />
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventMeta}>{event.calendar} · {event.location}</Text>
      </View>
      <Ionicons name="ellipsis-horizontal" size={16} color={COLORS.muted} />
    </View>
  );
}

function MateButton({ onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.mateButton, pressed && styles.pressed]} accessibilityRole="button">
      <Ionicons name="sparkles" size={18} color={COLORS.white} />
      <Text style={styles.mateText}>AI Mate</Text>
    </Pressable>
  );
}

function TodayScreen({ onMate }) {
  const events = eventsForDate(TODAY);
  const plans = plansForDate(TODAY);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>WEDNESDAY, JULY 15</Text>
            <Text style={styles.pageTitle}>오늘의 일정</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>C</Text></View>
        </View>
        <View style={styles.todaySummary}><View><Text style={styles.summaryLabel}>오늘의 할 일</Text><Text style={styles.summaryValue}>{plans.length}<Text style={styles.summaryUnit}>개</Text></Text></View><View style={styles.summaryDivider} /><View><Text style={styles.summaryLabel}>오늘 예정 일정</Text><Text style={styles.summaryValue}>{events.length}<Text style={styles.summaryUnit}>개</Text></Text></View></View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>오늘의 할 일</Text><Text style={styles.sectionAction}>데모 계획</Text></View>
        <View style={styles.planList}>{plans.map((plan) => <PlanRow key={plan.id} plan={plan} />)}</View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>오늘의 일정</Text><Text style={styles.sectionAction}>{events.length}개</Text></View>
        <View style={styles.eventList}>{events.map((event) => <EventRow key={event.id} event={event} />)}</View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>다가오는 일정</Text></View>
        <View style={styles.upcomingCard}>
          {MOCK_EVENTS.filter((event) => event.date > TODAY).slice(0, 3).map((event, index) => (
            <View key={event.id} style={[styles.upcomingRow, index > 0 && styles.rowBorder]}>
              <View style={[styles.dateBadge, { backgroundColor: `${event.color}18` }]}>
                <Text style={[styles.dateBadgeDay, { color: event.color }]}>{event.date.slice(8)}</Text>
                <Text style={styles.dateBadgeMonth}>JUL</Text>
              </View>
              <View style={styles.upcomingCopy}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.calendar} · {event.start}</Text></View>
              <Ionicons name="chevron-forward" size={17} color={COLORS.muted} />
            </View>
          ))}
        </View>
      </ScrollView>
      <MateButton onPress={onMate} />
    </SafeAreaView>
  );
}

function PlanRow({ plan, compact = false }) {
  return <View style={[styles.planRow, compact && styles.planRowCompact]}><Pressable style={styles.checkCircle}><Ionicons name="checkmark" size={14} color={COLORS.white} /></Pressable><View style={styles.planCopy}><View style={styles.planTitleRow}><Text style={styles.eventTitle}>{plan.title}</Text><Text style={[styles.priority, plan.priority === '높음' && styles.priorityHigh]}>{plan.priority}</Text></View><Text style={styles.eventMeta}>{plan.source} · {plan.duration}</Text><Text style={styles.planReason}>{plan.reason}</Text></View></View>;
}

function MonthScreen({ onMate }) {
  const year = 2026;
  const month = 7;
  const monthEvents = eventsForMonth(year, month);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [detailVisible, setDetailVisible] = useState(false);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: 35 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><View><Text style={styles.eyebrow}>CALENDAR</Text><Text style={styles.pageTitle}>2026년 7월</Text></View><IconButton name="options-outline" onPress={() => {}} /></View>
        <View style={styles.calendarCard}>
          <View style={styles.weekHeader}>{['일', '월', '화', '수', '목', '금', '토'].map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}</View>
          <View style={styles.monthGrid}>
            {cells.map((day, index) => {
              const date = day ? `2026-07-${String(day).padStart(2, '0')}` : null;
              const dayEvents = date ? monthEvents.filter((event) => event.date === date) : [];
              return <View key={`${day}-${index}`} style={[styles.monthCell, date === TODAY && styles.todayCell]}>
                {day ? <Pressable onPress={() => { setSelectedDate(date); setDetailVisible(true); }}><Text style={[styles.monthDay, date === TODAY && styles.todayDay, date === selectedDate && styles.selectedDay]}>{day}</Text></Pressable> : null}
                <View style={styles.dotRow}>{dayEvents.slice(0, 3).map((event) => <View key={event.id} style={[styles.eventDot, { backgroundColor: event.color }]} />)}</View>
              </View>;
            })}
          </View>
        </View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>이번 달 주요 일정</Text><Text style={styles.sectionAction}>{monthEvents.length}개</Text></View>
        <View style={styles.eventList}>{monthEvents.map((event) => <EventRow key={event.id} event={event} compact />)}</View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>이번 주 플래너</Text><Text style={styles.sectionAction}>7/13 - 7/19</Text></View>
        <View style={styles.plannerCard}>{['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'].map((date) => { const plans = plansForDate(date); const day = new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' }); return <View key={date} style={[styles.plannerRow, date === TODAY && styles.plannerToday]}><View style={styles.plannerDate}><Text style={styles.plannerDay}>{day}</Text><Text style={styles.plannerNumber}>{date.slice(8)}</Text></View><View style={styles.plannerItems}>{plans.length ? plans.map((plan) => <PlanRow key={plan.id} plan={plan} compact />) : <Text style={styles.emptyPlanner}>계획 없음</Text>}</View></View>; })}</View>
      </ScrollView>
      <MateButton onPress={onMate} />
      <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}><View style={styles.modalBackdrop}><View style={styles.detailSheet}><View style={styles.sheetHandle} /><View style={styles.sheetTitleRow}><View><Text style={styles.sheetEyebrow}>SCHEDULE DETAIL</Text><Text style={styles.sheetTitle}>{formatKoreanDate(selectedDate)}</Text></View><IconButton name="close" onPress={() => setDetailVisible(false)} /></View>{eventsForDate(selectedDate).length ? eventsForDate(selectedDate).map((event) => <EventRow key={event.id} event={event} compact />) : <View style={styles.emptyDetail}><Ionicons name="calendar-outline" size={26} color={COLORS.muted} /><Text style={styles.emptyTitle}>이 날짜에는 일정이 없습니다.</Text><Text style={styles.emptyBody}>Google Calendar 또는 학업 자료 일정이 표시됩니다.</Text></View>}</View></View></Modal>
    </SafeAreaView>
  );
}

function UploadScreen({ onMate }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><View><Text style={styles.eyebrow}>ADD TO CATCHUP</Text><Text style={styles.pageTitle}>일정 가져오기</Text></View><IconButton name="help-circle-outline" onPress={() => {}} /></View>
        <View style={styles.uploadHero}><View style={styles.uploadIcon}><Ionicons name="cloud-upload-outline" size={30} color={COLORS.coral} /></View><Text style={styles.uploadTitle}>학업 자료를 준비 중이에요</Text><Text style={styles.uploadBody}>파일 업로드는 다음 단계에서 연결됩니다.{`\n`}지금은 Google Calendar 일정을 먼저 확인해보세요.</Text></View>
        <Pressable style={styles.disabledUpload} disabled><Ionicons name="document-attach-outline" size={20} color="#B5BCC0" /><Text style={styles.disabledUploadText}>PDF 또는 이미지 업로드</Text><Text style={styles.comingSoon}>준비 중</Text></Pressable>
        <View style={styles.uploadSectionHead}><Text style={styles.sectionTitle}>연결 상태</Text><View style={styles.connectedStatus}><View style={styles.connectedDot} /><Text style={styles.connectedLabel}>데모 연결됨</Text></View></View>
        <View style={styles.connectionCard}><Ionicons name="logo-google" size={21} color="#4285F4" /><View style={styles.connectionCopy}><Text style={styles.eventTitle}>Google Calendar</Text><Text style={styles.eventMeta}>일정을 읽기 전용으로 표시합니다.</Text></View><Ionicons name="checkmark-circle" size={21} color={COLORS.green} /></View>
        <View style={styles.infoPanel}><Ionicons name="information-circle-outline" size={20} color={COLORS.green} /><Text style={styles.infoText}>현재 MVP는 캘린더 읽기 연동만 지원합니다. AI 계획 생성과 OCR은 포함하지 않습니다.</Text></View>
      </ScrollView>
      <MateButton onPress={onMate} />
    </SafeAreaView>
  );
}

function Onboarding({ onContinue }) {
  return <SafeAreaView style={styles.onboarding}><View style={styles.logoMark}><Ionicons name="calendar-clear" size={35} color={COLORS.white} /></View><Text style={styles.brand}>Catchup</Text><Text style={styles.onboardingTitle}>흩어진 일정을 모아{`\n`}오늘을 가볍게 시작해요.</Text><Text style={styles.onboardingBody}>수업과 개인 일정을 한눈에 보고,{`\n`}놓치기 쉬운 중요한 날을 미리 확인하세요.</Text><View style={styles.onboardingArt}><View style={styles.artCalendar}><Text style={styles.artMonth}>JUL</Text><Text style={styles.artDate}>15</Text><View style={styles.artLine} /><View style={styles.artLineShort} /></View><View style={styles.artCard}><Ionicons name="checkmark-circle" size={20} color={COLORS.green} /><Text style={styles.artCardText}>오늘 할 일 정리 완료</Text></View></View><Pressable style={styles.primaryButton} onPress={onContinue}><Text style={styles.primaryButtonText}>시작하기</Text><Ionicons name="arrow-forward" size={18} color={COLORS.white} /></Pressable><Text style={styles.privacyNote}>개인정보를 저장하지 않는 데모 버전입니다.</Text></SafeAreaView>;
}

function ConnectScreen({ onConnected, onSkip }) {
  const clientId = Constants.expoConfig?.extra?.googleCalendarClientId || '';
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'catchup' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest({ clientId: clientId || 'demo-client-id', scopes: GOOGLE_CALENDAR_SCOPES, responseType: AuthSession.ResponseType.Token, redirectUri }, { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' });
  const [status, setStatus] = useState('idle');

  React.useEffect(() => {
    if (response?.type === 'success') { setStatus('connected'); onConnected(); }
    if (response?.type === 'error') setStatus('error');
  }, [response, onConnected]);

  async function connect() {
    if (!clientId) { setStatus('demo'); onConnected(); return; }
    setStatus('loading');
    await promptAsync();
  }

  return <SafeAreaView style={styles.connectScreen}><Header title="캘린더 연결" onBack={onSkip} /><View style={styles.connectContent}><View style={styles.googleLogo}><Text style={styles.googleG}>G</Text></View><Text style={styles.connectTitle}>Google Calendar와{`\n`}연결할까요?</Text><Text style={styles.connectBody}>수업과 개인 일정을 읽어 오늘과 이번 달 화면에 보여드릴게요.</Text><View style={styles.permissionCard}><View style={styles.permissionRow}><Ionicons name="eye-outline" size={21} color={COLORS.green} /><View><Text style={styles.permissionTitle}>일정 읽기 전용</Text><Text style={styles.permissionBody}>캘린더 일정을 조회할 수 있습니다.</Text></View><Ionicons name="checkmark-circle" size={20} color={COLORS.green} /></View><View style={[styles.permissionRow, styles.permissionRowBorder]}><Ionicons name="lock-closed-outline" size={21} color={COLORS.muted} /><View><Text style={styles.permissionTitle}>일정 변경 없음</Text><Text style={styles.permissionBody}>일정을 만들거나 수정하지 않습니다.</Text></View></View></View>{status === 'error' ? <Text style={styles.errorText}>연결을 완료하지 못했어요. 다시 시도해주세요.</Text> : null}{status === 'demo' ? <Text style={styles.demoText}>데모 모드로 연결했어요. 샘플 일정이 표시됩니다.</Text> : null}<Pressable style={[styles.primaryButton, status === 'loading' && styles.buttonLoading]} onPress={connect} disabled={!request && Boolean(clientId) && status === 'loading'}><Ionicons name="logo-google" size={18} color={COLORS.white} /><Text style={styles.primaryButtonText}>{status === 'loading' ? '연결 중...' : 'Google Calendar 연결'}</Text></Pressable><Pressable onPress={onSkip} style={styles.skipButton}><Text style={styles.skipText}>나중에 연결하기</Text></Pressable><Text style={styles.permissionNote}>요청 권한: calendar.readonly{`\n`}OAuth 토큰은 이 MVP에서 저장하지 않습니다.</Text></View></SafeAreaView>;
}

function MateModal({ visible, onClose }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.mateSheet}><View style={styles.sheetHandle} /><View style={styles.sheetTitleRow}><View><Text style={styles.sheetEyebrow}>CATCHUP MATE</Text><Text style={styles.sheetTitle}>무엇을 도와드릴까요?</Text></View><IconButton name="close" onPress={onClose} /></View><View style={styles.mateNotice}><Ionicons name="sparkles" size={20} color={COLORS.coral} /><Text style={styles.mateNoticeText}>AI 계획 생성은 다음 단계에서 추가됩니다. 지금은 캘린더 일정을 바탕으로 확인할 수 있어요.</Text></View>{['오늘 일정 요약해줘', '이번 달 시험 일정 보여줘', '바쁜 날을 알려줘'].map((label) => <Pressable key={label} style={styles.suggestion} onPress={onClose}><Text style={styles.suggestionText}>{label}</Text><Ionicons name="arrow-up" size={17} color={COLORS.muted} /></Pressable>)}</View></View></Modal>;
}

function MainApp({ onReset }) {
  const [tab, setTab] = useState('Today');
  const [mateVisible, setMateVisible] = useState(false);
  const screen = tab === 'Today' ? <TodayScreen onMate={() => setMateVisible(true)} /> : tab === 'Month' ? <MonthScreen onMate={() => setMateVisible(true)} /> : <UploadScreen onMate={() => setMateVisible(true)} />;
  return <View style={styles.appRoot}>{screen}<View style={styles.tabBar}>{[['Today', 'today-outline'], ['Month', 'calendar-outline'], ['Upload', 'add-circle-outline']].map(([label, icon]) => <Pressable key={label} style={styles.tabItem} onPress={() => setTab(label)}><Ionicons name={tab === label ? icon.replace('-outline', '') : icon} size={23} color={tab === label ? COLORS.coral : COLORS.muted} /><Text style={[styles.tabLabel, tab === label && styles.tabLabelActive]}>{label}</Text></Pressable>)}</View><MateModal visible={mateVisible} onClose={() => setMateVisible(false)} /></View>;
}

export default function App() {
  const [stage, setStage] = useState('onboarding');
  const [connected, setConnected] = useState(false);
  const completeConnect = () => { setConnected(true); setStage('main'); };
  const showConnect = () => setStage('connect');
  return <><StatusBar barStyle="dark-content" />{stage === 'onboarding' ? <Onboarding onContinue={showConnect} /> : stage === 'connect' ? <ConnectScreen onConnected={completeConnect} onSkip={completeConnect} /> : <MainApp onReset={() => { setConnected(false); setStage('onboarding'); }} />}</>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  appRoot: { flex: 1, backgroundColor: COLORS.canvas },
  scrollContent: { paddingHorizontal: 22, paddingTop: Platform.OS === 'android' ? 28 : 12, paddingBottom: 120 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  eyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 },
  pageTitle: { color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  header: { height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  headerSpacer: { width: 34 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  focusCard: { backgroundColor: '#FFF0E8', borderRadius: 18, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  focusIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  focusCopy: { flex: 1 },
  focusLabel: { color: COLORS.coral, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  focusTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  focusBody: { color: '#9C6F5A', fontSize: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 3 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  sectionAction: { color: COLORS.coral, fontSize: 12, fontWeight: '700' },
  todaySummary: { backgroundColor: COLORS.white, borderRadius: 16, paddingVertical: 17, paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 25 },
  summaryLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  summaryValue: { color: COLORS.ink, fontSize: 27, fontWeight: '900' },
  summaryUnit: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  summaryDivider: { width: 1, height: 34, backgroundColor: COLORS.line },
  planList: { backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 15, marginBottom: 24 },
  planRow: { flexDirection: 'row', alignItems: 'center', minHeight: 88, paddingVertical: 13 },
  planRowCompact: { minHeight: 52, paddingVertical: 5 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  planCopy: { flex: 1 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  priority: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  priorityHigh: { color: COLORS.coral },
  planReason: { color: '#9AA3A7', fontSize: 10, marginTop: 5 },
  eventList: { backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 15, marginBottom: 24 },
  eventRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  eventRowCompact: { minHeight: 64, paddingVertical: 11 },
  eventTime: { width: 45, alignSelf: 'stretch', justifyContent: 'center' },
  eventTimeCompact: { width: 43 },
  timeText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  timeEnd: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  eventAccent: { width: 4, height: 42, borderRadius: 3, marginRight: 12 },
  eventInfo: { flex: 1, paddingRight: 10 },
  eventTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '750' },
  eventMeta: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  upcomingCard: { backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 15 },
  upcomingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  rowBorder: { borderTopWidth: 1, borderTopColor: COLORS.line },
  dateBadge: { width: 42, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  dateBadgeDay: { fontWeight: '800', fontSize: 17 },
  dateBadgeMonth: { fontSize: 9, color: COLORS.muted, fontWeight: '800', marginTop: 1 },
  upcomingCopy: { flex: 1 },
  mateButton: { position: 'absolute', right: 22, bottom: 85, backgroundColor: COLORS.navy, height: 48, borderRadius: 24, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#152027', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  mateText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.8 },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 76, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  tabItem: { alignItems: 'center', width: '33%' },
  tabLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  tabLabelActive: { color: COLORS.coral },
  calendarCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 13, marginBottom: 26 },
  weekHeader: { flexDirection: 'row', paddingBottom: 9 },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: `${100 / 7}%`, height: 52, alignItems: 'center', paddingTop: 7 },
  monthDay: { color: COLORS.ink, fontSize: 13, height: 21, fontWeight: '600' },
  todayCell: { backgroundColor: '#FFF0E8', borderRadius: 12 },
  todayDay: { color: COLORS.coral, fontWeight: '900' },
  selectedDay: { borderBottomWidth: 2, borderBottomColor: COLORS.ink },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 3 },
  eventDot: { width: 5, height: 5, borderRadius: 3 },
  plannerCard: { backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 15, marginBottom: 20 },
  plannerRow: { flexDirection: 'row', minHeight: 66, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 8 },
  plannerToday: { backgroundColor: '#FFF8F4', marginHorizontal: -15, paddingHorizontal: 15 },
  plannerDate: { width: 44, alignItems: 'center', justifyContent: 'center' },
  plannerDay: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  plannerNumber: { color: COLORS.ink, fontSize: 16, fontWeight: '900', marginTop: 3 },
  plannerItems: { flex: 1, justifyContent: 'center' },
  emptyPlanner: { color: '#B0B8BB', fontSize: 11, paddingLeft: 10 },
  uploadHero: { backgroundColor: COLORS.white, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 14 },
  uploadIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFF0E8', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  uploadTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginBottom: 9 },
  uploadBody: { color: COLORS.muted, fontSize: 13, textAlign: 'center', lineHeight: 21 },
  disabledUpload: { height: 60, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#F1F3F2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, gap: 10 },
  disabledUploadText: { color: '#A3AAAD', fontWeight: '700', flex: 1 },
  comingSoon: { color: '#A3AAAD', fontSize: 11, fontWeight: '700' },
  uploadSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 11 },
  connectedStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connectedLabel: { color: COLORS.green, fontSize: 11, fontWeight: '800' },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  connectionCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectionCopy: { flex: 1 },
  infoPanel: { flexDirection: 'row', gap: 9, padding: 15, marginTop: 18, backgroundColor: '#EAF4F1', borderRadius: 14 },
  infoText: { color: '#47736F', fontSize: 12, lineHeight: 18, flex: 1 },
  detailSheet: { backgroundColor: COLORS.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28, minHeight: 280 },
  emptyDetail: { alignItems: 'center', paddingVertical: 28 },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginTop: 10 },
  emptyBody: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  onboarding: { flex: 1, backgroundColor: COLORS.canvas, alignItems: 'center', paddingHorizontal: 28, paddingTop: 70 },
  logoMark: { width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.coral, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  brand: { color: COLORS.ink, fontSize: 18, fontWeight: '900', marginTop: 12, letterSpacing: 0.2 },
  onboardingTitle: { color: COLORS.ink, fontSize: 30, lineHeight: 39, fontWeight: '900', textAlign: 'center', marginTop: 48, letterSpacing: -0.7 },
  onboardingBody: { color: COLORS.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 16 },
  onboardingArt: { height: 225, width: '100%', position: 'relative', marginTop: 28 },
  artCalendar: { position: 'absolute', width: 170, height: 164, backgroundColor: COLORS.white, borderRadius: 20, left: 28, top: 18, padding: 20, transform: [{ rotate: '-5deg' }], shadowColor: '#637078', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  artMonth: { color: COLORS.coral, fontWeight: '900', fontSize: 12 },
  artDate: { color: COLORS.ink, fontWeight: '900', fontSize: 56, marginTop: 5 },
  artLine: { height: 7, width: 90, backgroundColor: '#E9EDEB', borderRadius: 5, marginTop: 12 },
  artLineShort: { height: 7, width: 57, backgroundColor: '#E9EDEB', borderRadius: 5, marginTop: 8 },
  artCard: { position: 'absolute', right: 4, bottom: 20, height: 64, width: 190, backgroundColor: COLORS.navy, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 9, transform: [{ rotate: '4deg' }], shadowColor: '#152027', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 7 } },
  artCardText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  primaryButton: { height: 56, width: '100%', backgroundColor: COLORS.coral, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  privacyNote: { color: '#A5ACAE', fontSize: 11, marginTop: 14 },
  connectScreen: { flex: 1, backgroundColor: COLORS.canvas },
  connectContent: { paddingHorizontal: 28, alignItems: 'center', paddingTop: 45 },
  googleLogo: { width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  googleG: { color: '#4285F4', fontSize: 35, fontWeight: '900' },
  connectTitle: { color: COLORS.ink, fontSize: 29, lineHeight: 37, fontWeight: '900', textAlign: 'center' },
  connectBody: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 14, maxWidth: 280 },
  permissionCard: { width: '100%', backgroundColor: COLORS.white, borderRadius: 18, paddingHorizontal: 17, marginTop: 34, marginBottom: 18 },
  permissionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  permissionRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.line },
  permissionTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  permissionBody: { color: COLORS.muted, fontSize: 11 },
  errorText: { color: '#C05054', fontSize: 12, marginBottom: 12 },
  demoText: { color: COLORS.green, fontSize: 12, marginBottom: 12 },
  buttonLoading: { opacity: 0.7 },
  skipButton: { padding: 15 },
  skipText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  permissionNote: { color: '#A5ACAE', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(29, 37, 44, 0.38)', justifyContent: 'flex-end' },
  mateSheet: { backgroundColor: COLORS.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30, minHeight: 360 },
  sheetHandle: { width: 38, height: 4, backgroundColor: '#D6DCDE', borderRadius: 2, alignSelf: 'center', marginBottom: 22 },
  sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetEyebrow: { color: COLORS.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 5 },
  sheetTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '900' },
  mateNotice: { backgroundColor: '#FFF0E8', borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, marginBottom: 14 },
  mateNoticeText: { flex: 1, color: '#96664F', fontSize: 12, lineHeight: 18 },
  suggestion: { height: 52, backgroundColor: COLORS.white, borderRadius: 14, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  suggestionText: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
});
