import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StatusBar, Text, TextInput, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'shadowboard_native_v2';

const freshState = () => ({
  projects: [],
  momentum: [],
});

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [locked, setLocked] = useState(true);
  const [lockError, setLockError] = useState('');
  const [state, setState] = useState(freshState());

  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        try { setState({ ...freshState(), ...JSON.parse(raw) }); } catch {}
      }
      await unlockWithFaceId();
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const unlockWithFaceId = async () => {
    setLockError('');
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !enrolled) {
      setLockError('Face ID / biometrics unavailable on this device.');
      return;
    }

    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock ShadowBoard',
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });

    if (auth.success) setLocked(false);
    else setLockError('Unlock failed. Try again.');
  };

  const addProject = () => {
    const t = title.trim();
    if (!t) return;

    setState((s) => ({
      ...s,
      projects: [{
        id: uid(),
        title: t,
        domain: domain.trim() || 'General',
        status: 'ACTIVE',
        horizonMonths: 3,
        phases: 0,
        moves: 0,
        stack: { frontend: 0, backend: 0, database: 0, uiux: 0, devops: 0 },
      }, ...s.projects],
    }));

    setTitle('');
    setDomain('');
  };

  const bump = (projectId, key) => {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        if (key === 'phases') return { ...p, phases: p.phases + 1 };
        if (key === 'moves') return { ...p, moves: p.moves + 1 };
        return { ...p, stack: { ...p.stack, [key]: (p.stack[key] || 0) + 1 } };
      }),
    }));
  };

  const logMomentum = () => {
    const week = new Date().toISOString().slice(0, 10);
    const score = Math.min(10, Math.max(0, Math.round((state.projects.reduce((a, p) => a + p.moves, 0) / Math.max(1, state.projects.length)) || 0)));
    setState((s) => ({ ...s, momentum: [{ id: uid(), week, score }, ...s.momentum].slice(0, 6) }));
  };

  const summary = useMemo(() => {
    const active = state.projects.filter((p) => p.status === 'ACTIVE').length;
    const phases = state.projects.reduce((a, p) => a + p.phases, 0);
    const moves = state.projects.reduce((a, p) => a + p.moves, 0);
    const momentumAvg = state.momentum.length
      ? (state.momentum.reduce((a, m) => a + Number(m.score || 0), 0) / state.momentum.length).toFixed(1)
      : '--';

    const stack = { frontend: 0, backend: 0, database: 0, uiux: 0, devops: 0 };
    for (const p of state.projects) {
      stack.frontend += p.stack?.frontend || 0;
      stack.backend += p.stack?.backend || 0;
      stack.database += p.stack?.database || 0;
      stack.uiux += p.stack?.uiux || 0;
      stack.devops += p.stack?.devops || 0;
    }

    const max = Math.max(1, ...Object.values(stack));
    return { active, phases, moves, momentumAvg, stack, stackMax: max };
  }, [state]);

  if (locked) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.lockWrap}>
          <Text style={styles.brand}>SHADOWBOARD</Text>
          <Text style={styles.sub}>Use Face ID to unlock</Text>
          {!!lockError && <Text style={styles.err}>{lockError}</Text>}
          <Pressable style={styles.primaryBtn} onPress={unlockWithFaceId}><Text style={styles.primaryBtnText}>Unlock</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <Text style={styles.menu}>☰</Text>
        <View style={styles.brandWrap}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>SHADOWBOARD</Text>
        </View>
        <Pressable onPress={() => setLocked(true)}><Text style={styles.menu}>◍</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.h1}>Project Dashboard</Text>
        <Text style={styles.sub}>Overview of all your coding projects</Text>

        <View style={styles.newRow}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Project title" placeholderTextColor="#8b8b9b" style={styles.input} />
          <TextInput value={domain} onChangeText={setDomain} placeholder="Domain (optional)" placeholderTextColor="#8b8b9b" style={styles.input} />
          <Pressable style={styles.primaryBtn} onPress={addProject}><Text style={styles.primaryBtnText}>+ New Project</Text></Pressable>
        </View>

        <View style={styles.kpiGrid}>
          <KpiCard icon="◎" label="ACTIVE PROJECTS" value={String(summary.active)} />
          <KpiCard icon="◫" label="TOTAL PHASES" value={String(summary.phases)} />
          <KpiCard icon="◌" label="TOTAL TASKS" value={String(summary.moves)} />
          <KpiCard icon="↗" label="MOMENTUM SCORE" value={String(summary.momentumAvg)} />
        </View>

        <Text style={styles.sectionTitle}>RECENT PROJECTS</Text>
        {state.projects.length === 0 ? (
          <View style={styles.projectCard}><Text style={styles.sub}>No projects yet. Add your first one above.</Text></View>
        ) : state.projects.slice(0, 5).map((p) => (
          <View key={p.id} style={styles.projectCard}>
            <View style={styles.projectTop}>
              <Text style={styles.projectName}>{p.title}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
            <Text style={styles.sub}>{p.domain}</Text>
            <View style={styles.projectMeta}>
              <Badge text={p.status} />
              <Text style={styles.metaText}>{p.horizonMonths} Months</Text>
              <Text style={styles.metaText}>{p.phases} phases</Text>
              <Text style={styles.metaText}>{p.moves} moves</Text>
            </View>
            <View style={styles.actionRow}>
              <TinyBtn text="+ Phase" onPress={() => bump(p.id, 'phases')} />
              <TinyBtn text="+ Move" onPress={() => bump(p.id, 'moves')} />
              <TinyBtn text="FE" onPress={() => bump(p.id, 'frontend')} />
              <TinyBtn text="BE" onPress={() => bump(p.id, 'backend')} />
              <TinyBtn text="DB" onPress={() => bump(p.id, 'database')} />
              <TinyBtn text="UI" onPress={() => bump(p.id, 'uiux')} />
              <TinyBtn text="DevOps" onPress={() => bump(p.id, 'devops')} />
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>TECH STACK BALANCE</Text>
        <StackBar label="FRONTEND" value={summary.stack.frontend} max={summary.stackMax} color="#79B77D" />
        <StackBar label="BACKEND" value={summary.stack.backend} max={summary.stackMax} color="#80B6C5" />
        <StackBar label="DATABASE" value={summary.stack.database} max={summary.stackMax} color="#8A89B6" />
        <StackBar label="UI/UX" value={summary.stack.uiux} max={summary.stackMax} color="#C78F8F" />
        <StackBar label="DEVOPS" value={summary.stack.devops} max={summary.stackMax} color="#86A2A5" />

        <View style={styles.momentumHead}>
          <Text style={styles.sectionTitle}>RECENT MOMENTUM</Text>
          <Pressable onPress={logMomentum}><Text style={styles.link}>Log</Text></Pressable>
        </View>
        {state.momentum.length === 0 ? (
          <Text style={styles.sub}>No logs recorded yet.</Text>
        ) : state.momentum.map((m) => (
          <View key={m.id} style={styles.mRow}><Text style={styles.sub}>{m.week}</Text><Text style={styles.good}>{m.score}</Text></View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ label, value, icon }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{icon ? `${icon}  ${label}` : label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function Badge({ text }) {
  return <Text style={styles.badge}>{text}</Text>;
}

function TinyBtn({ text, onPress }) {
  return <Pressable style={styles.tinyBtn} onPress={onPress}><Text style={styles.tinyText}>{text}</Text></Pressable>;
}

function StackBar({ label, value, max, color }) {
  const pct = Math.max(4, (value / Math.max(1, max)) * 100);
  return (
    <View style={styles.stackRow}>
      <Text style={styles.stackLabel}>{label}</Text>
      <View style={styles.stackTrack}><View style={[styles.stackFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={styles.stackNum}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#16161f' },
  wrap: { padding: 14, paddingBottom: 30, gap: 10 },
  topBar: { borderBottomWidth: 1, borderBottomColor: '#2a2a36', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menu: { color: '#8e90a1', fontSize: 20 },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 18, height: 18, borderRadius: 6, backgroundColor: '#2b2c3a', borderWidth: 1, borderColor: '#4a4b5d' },
  brand: { color: '#ececf1', fontSize: 20, fontWeight: '800', letterSpacing: 1.2 },
  h1: { color: '#ececf1', fontSize: 40, fontWeight: '800', marginTop: 6 },
  sub: { color: '#9698a8', fontSize: 16 },
  err: { color: '#d58e8e' },
  input: { backgroundColor: '#20202b', borderColor: '#313140', borderWidth: 1, borderRadius: 10, color: '#ececf1', paddingHorizontal: 10, paddingVertical: 12 },
  newRow: { gap: 8 },
  primaryBtn: { backgroundColor: '#2e2f3f', borderColor: '#47495d', borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  primaryBtnText: { color: '#ececf1', fontWeight: '700', fontSize: 17 },
  kpiGrid: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: { width: '48.7%', backgroundColor: '#1e1f2a', borderColor: '#313241', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 90 },
  kpiLabel: { color: '#8d8fa0', fontSize: 12, letterSpacing: 1.2 },
  kpiValue: { color: '#ececf1', fontSize: 36, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#9ea0b1', letterSpacing: 1.2, marginTop: 12, marginBottom: 4, fontSize: 18 },
  projectCard: { backgroundColor: '#20212d', borderColor: '#343647', borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  projectTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  projectName: { color: '#ececf1', fontSize: 31, fontWeight: '700' },
  chev: { color: '#8f91a5', fontSize: 26 },
  projectMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: { color: '#79B77D', backgroundColor: 'rgba(121,183,125,0.15)', borderColor: 'rgba(121,183,125,0.3)', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, fontSize: 13, fontWeight: '700' },
  metaText: { color: '#9a9cad', fontSize: 14 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tinyBtn: { backgroundColor: '#2b2d3b', borderColor: '#43465a', borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  tinyText: { color: '#d7d8e3', fontSize: 12 },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  stackLabel: { color: '#a6a8b8', width: 110, fontSize: 16 },
  stackTrack: { flex: 1, height: 11, borderRadius: 999, backgroundColor: '#282a39', overflow: 'hidden' },
  stackFill: { height: 11, borderRadius: 999 },
  stackNum: { color: '#aeb0bf', width: 22, textAlign: 'right', fontSize: 15 },
  momentumHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mRow: { flexDirection: 'row', justifyContent: 'space-between', borderColor: '#303343', borderWidth: 1, borderRadius: 8, padding: 10 },
  good: { color: '#86c79f', fontWeight: '700', fontSize: 16 },
  link: { color: '#9ea6ff', fontWeight: '700', fontSize: 15 },
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
});
