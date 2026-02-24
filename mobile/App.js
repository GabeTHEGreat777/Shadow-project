import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View, Pressable, ScrollView } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'shadowboard_native_v1';

const freshState = () => ({
  missions: [],
  risks: [],
  momentum: [],
});

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [locked, setLocked] = useState(true);
  const [lockError, setLockError] = useState('');
  const [tab, setTab] = useState('overview');
  const [state, setState] = useState(freshState());

  const [missionTitle, setMissionTitle] = useState('');
  const [missionHorizon, setMissionHorizon] = useState('3');
  const [riskTitle, setRiskTitle] = useState('');
  const [riskProb, setRiskProb] = useState('5');
  const [riskImpact, setRiskImpact] = useState('5');
  const [momentumScore, setMomentumScore] = useState('5');

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

  const kpis = useMemo(() => {
    const active = state.missions.filter((m) => !m.done).length;
    const total = state.missions.length;
    const avgMomentum = state.momentum.length
      ? (state.momentum.reduce((a, b) => a + Number(b.score || 0), 0) / state.momentum.length).toFixed(1)
      : '0.0';
    const avgRisk = state.risks.length
      ? (state.risks.reduce((a, b) => a + (Number(b.prob) * Number(b.impact)), 0) / state.risks.length).toFixed(1)
      : '0.0';
    return { active, total, avgMomentum, avgRisk };
  }, [state]);

  const addMission = () => {
    const t = missionTitle.trim();
    const h = Number(missionHorizon);
    if (!t || !h || h < 1 || h > 5) return;
    setState((s) => ({
      ...s,
      missions: [{ id: uid(), title: t, horizon: h, done: false }, ...s.missions],
    }));
    setMissionTitle('');
  };

  const toggleMission = (id) => setState((s) => ({
    ...s,
    missions: s.missions.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
  }));

  const addRisk = () => {
    const t = riskTitle.trim();
    const p = Number(riskProb);
    const i = Number(riskImpact);
    if (!t || p < 1 || p > 10 || i < 1 || i > 10) return;
    setState((s) => ({ ...s, risks: [{ id: uid(), title: t, prob: p, impact: i }, ...s.risks] }));
    setRiskTitle('');
  };

  const addMomentum = () => {
    const score = Number(momentumScore);
    if (score < 0 || score > 10) return;
    const week = new Date().toISOString().slice(0, 10);
    setState((s) => ({ ...s, momentum: [{ id: uid(), week, score }, ...s.momentum].slice(0, 24) }));
  };

  if (locked) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.lockWrap}>
          <Text style={styles.title}>SHADOWBOARD</Text>
          <Text style={styles.sub}>Use Face ID to unlock your vault</Text>
          {!!lockError && <Text style={styles.err}>{lockError}</Text>}
          <Pressable style={styles.btn} onPress={unlockWithFaceId}><Text style={styles.btnText}>Unlock</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>ShadowBoard</Text>
        <Pressable onPress={() => setLocked(true)}><Text style={styles.link}>Lock</Text></Pressable>
      </View>

      <View style={styles.tabs}>
        {['overview', 'missions', 'risk', 'momentum'].map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.wrap}>
        {tab === 'overview' && (
          <View style={styles.card}>
            <Text style={styles.h2}>Strategic Snapshot</Text>
            <Text style={styles.metric}>Active Missions: <Text style={styles.good}>{kpis.active}</Text> / {kpis.total}</Text>
            <Text style={styles.metric}>Avg Momentum: <Text style={styles.good}>{kpis.avgMomentum}</Text></Text>
            <Text style={styles.metric}>Avg Risk Exposure: <Text style={styles.warn}>{kpis.avgRisk}</Text></Text>
            <Text style={styles.sub}>This version is now native and editable — no frozen web shell.</Text>
          </View>
        )}

        {tab === 'missions' && (
          <View style={styles.card}>
            <Text style={styles.h2}>Missions</Text>
            <TextInput value={missionTitle} onChangeText={setMissionTitle} placeholder="Mission title" placeholderTextColor="#848493" style={styles.input} />
            <TextInput value={missionHorizon} onChangeText={setMissionHorizon} placeholder="Horizon (1-5 years)" keyboardType="numeric" placeholderTextColor="#848493" style={styles.input} />
            <Pressable style={styles.btn} onPress={addMission}><Text style={styles.btnText}>Add Mission</Text></Pressable>
            {state.missions.map((m) => (
              <Pressable key={m.id} style={styles.row} onPress={() => toggleMission(m.id)}>
                <Text style={styles.metric}>{m.done ? '✅' : '⬜'} {m.title}</Text>
                <Text style={styles.sub}>{m.horizon}y</Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === 'risk' && (
          <View style={styles.card}>
            <Text style={styles.h2}>Risk Surface</Text>
            <TextInput value={riskTitle} onChangeText={setRiskTitle} placeholder="Risk title" placeholderTextColor="#848493" style={styles.input} />
            <TextInput value={riskProb} onChangeText={setRiskProb} placeholder="Probability 1-10" keyboardType="numeric" placeholderTextColor="#848493" style={styles.input} />
            <TextInput value={riskImpact} onChangeText={setRiskImpact} placeholder="Impact 1-10" keyboardType="numeric" placeholderTextColor="#848493" style={styles.input} />
            <Pressable style={styles.btn} onPress={addRisk}><Text style={styles.btnText}>Add Risk</Text></Pressable>
            {state.risks.map((r) => (
              <View key={r.id} style={styles.row}><Text style={styles.metric}>{r.title}</Text><Text style={styles.warn}>{r.prob * r.impact}</Text></View>
            ))}
          </View>
        )}

        {tab === 'momentum' && (
          <View style={styles.card}>
            <Text style={styles.h2}>Momentum</Text>
            <TextInput value={momentumScore} onChangeText={setMomentumScore} placeholder="Weekly score 0-10" keyboardType="numeric" placeholderTextColor="#848493" style={styles.input} />
            <Pressable style={styles.btn} onPress={addMomentum}><Text style={styles.btnText}>Log Week</Text></Pressable>
            {state.momentum.map((m) => (
              <View key={m.id} style={styles.row}><Text style={styles.metric}>{m.week}</Text><Text style={styles.good}>{m.score}</Text></View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#121219' },
  wrap: { padding: 14, gap: 12, paddingBottom: 28 },
  header: { paddingHorizontal: 14, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#ececf1', fontSize: 28, fontWeight: '800' },
  sub: { color: '#a1a1af' },
  err: { color: '#d18b8b' },
  link: { color: '#a8a8b6', fontWeight: '600' },
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#1a1a23' },
  tabActive: { backgroundColor: '#2a2a38' },
  tabText: { color: '#8f8fa0', textTransform: 'capitalize' },
  tabTextActive: { color: '#ececf1', fontWeight: '700' },
  card: { backgroundColor: '#191923', borderColor: '#2b2b37', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  h2: { color: '#ececf1', fontSize: 22, fontWeight: '700' },
  input: { backgroundColor: '#111118', borderColor: '#2e2e3d', borderWidth: 1, color: '#ececf1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  btn: { backgroundColor: '#3a3a4d', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#ececf1', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#2b2b37', borderRadius: 8, padding: 10 },
  metric: { color: '#dbdbe6', fontSize: 15 },
  good: { color: '#86c79f', fontWeight: '700' },
  warn: { color: '#d9a47f', fontWeight: '700' },
});
