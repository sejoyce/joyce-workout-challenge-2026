// ─────────────────────────────────────────────
//  STEP 1: Paste your Firebase config below.
//  Get it from: Firebase Console → Project Settings → Your Apps → SDK setup
// ─────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";
import { useState, useEffect, useRef } from "react";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
const TOTAL_WEEKS = 12;

const getPhase = (week) => {
  if (week <= 4) return { name: "Foundation", color: "#7FB069", desc: "Build the habit" };
  if (week <= 8) return { name: "Build", color: "#E8A838", desc: "Push harder" };
  return { name: "Peak", color: "#E05C5C", desc: "Final push!" };
};

// Each member has goals: [{ id, label, target }]
// Log structure per member per week: { goalProgress: { goalId: count }, buddy: bool }
// hitGoal = all goals met

const allGoalsMet = (member, weekLog) => {
  if (!member.goals?.length) return false;
  const progress = weekLog?.goalProgress || {};
  return member.goals.every((g) => (progress[g.id] || 0) >= g.target);
};

const calculatePoints = (member, weekLog) => {
  if (!weekLog) return 0;
  let pts = 0;
  if (allGoalsMet(member, weekLog)) pts += 5;
  if (weekLog.buddy) pts += 2;
  return pts;
};

const DEFAULT_GOALS = () => [{ id: "g1", label: "Workouts", target: 3 }];

const DEFAULT_MEMBERS = [
  { id: 1, name: "Dad", goals: DEFAULT_GOALS() },
  { id: 2, name: "Mom", goals: DEFAULT_GOALS() },
  { id: 3, name: "Sarah", goals: DEFAULT_GOALS() },
  { id: 4, name: "Daniel", goals: DEFAULT_GOALS() },
  { id: 5, name: "Nora", goals: DEFAULT_GOALS() },
  { id: 6, name: "Emma", goals: DEFAULT_GOALS() },
  { id: 7, name: "Stephen", goals: DEFAULT_GOALS() },
];

const buildDefaultLogs = (memberList) => {
  const initial = {};
  memberList.forEach((m) => {
    initial[m.id] = {};
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      initial[m.id][w] = { goalProgress: {}, buddy: false };
    }
  });
  return initial;
};

const newGoalId = () => `g${Date.now()}`;

// ─────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────
export default function App() {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [members, setMembers] = useState(DEFAULT_MEMBERS);
  const [logs, setLogs] = useState(() => buildDefaultLogs(DEFAULT_MEMBERS));
  const [activeTab, setActiveTab] = useState("log");
  const [editingSetup, setEditingSetup] = useState(false);
  // setupDraft: per-member editable copy { name, goals: [{id, label, target}] }
  const [setupDraft, setSetupDraft] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const remoteUpdate = useRef(false);

  // ── Firebase listeners ───────────────────────
  useEffect(() => {
    const unsubLogs = onSnapshot(doc(db, "challenge", "logs"), (snap) => {
      if (snap.exists()) { remoteUpdate.current = true; setLogs(snap.data()); }
    });
    const unsubMembers = onSnapshot(doc(db, "challenge", "members"), (snap) => {
      if (snap.exists()) {
        const m = snap.data().list;
        if (m) { remoteUpdate.current = true; setMembers(m); }
      }
    });
    const unsubWeek = onSnapshot(doc(db, "challenge", "week"), (snap) => {
      if (snap.exists() && snap.data().current) {
        remoteUpdate.current = true; setCurrentWeek(snap.data().current);
      }
    });
    Promise.all([
      getDoc(doc(db, "challenge", "logs")),
      getDoc(doc(db, "challenge", "members")),
      getDoc(doc(db, "challenge", "week")),
    ]).finally(() => setLoaded(true));
    return () => { unsubLogs(); unsubMembers(); unsubWeek(); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (remoteUpdate.current) { remoteUpdate.current = false; return; }
    setDoc(doc(db, "challenge", "logs"), logs).catch(() => {});
  }, [logs, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (remoteUpdate.current) { remoteUpdate.current = false; return; }
    setDoc(doc(db, "challenge", "week"), { current: currentWeek }).catch(() => {});
  }, [currentWeek, loaded]);

  const phase = getPhase(currentWeek);

  // ── Log actions ──────────────────────────────
  const updateGoalProgress = (memberId, goalId, delta) => {
    setLogs((prev) => {
      const memberLogs = prev[memberId] || {};
      const weekLog = memberLogs[currentWeek] || { goalProgress: {}, buddy: false };
      const current = weekLog.goalProgress?.[goalId] || 0;
      const newCount = Math.max(0, current + delta);
      return {
        ...prev,
        [memberId]: {
          ...memberLogs,
          [currentWeek]: {
            ...weekLog,
            goalProgress: { ...weekLog.goalProgress, [goalId]: newCount },
          },
        },
      };
    });
  };

  const toggleBuddy = (memberId) => {
    setLogs((prev) => {
      const memberLogs = prev[memberId] || {};
      const weekLog = memberLogs[currentWeek] || { goalProgress: {}, buddy: false };
      return {
        ...prev,
        [memberId]: { ...memberLogs, [currentWeek]: { ...weekLog, buddy: !weekLog.buddy } },
      };
    });
  };

  // ── Scoring ──────────────────────────────────
  const getMemberTotal = (member) => {
    let total = 0;
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      total += calculatePoints(member, (logs[member.id] || {})[w]);
    }
    return total;
  };

  const getWeekPoints = (member, week) => calculatePoints(member, (logs[member.id] || {})[week]);

  const maxPossible = TOTAL_WEEKS * 7;

  const leaderboard = [...members]
    .map((m) => ({ ...m, total: getMemberTotal(m) }))
    .sort((a, b) => b.total - a.total);

  const familyAvgPct = Math.round(
    (leaderboard.reduce((sum, m) => sum + m.total, 0) / (members.length * maxPossible)) * 100
  );

  // ── Setup editing ────────────────────────────
  const startEditing = () => {
    setSetupDraft(members.map((m) => ({
      ...m,
      goals: (m.goals || DEFAULT_GOALS()).map((g) => ({ ...g })),
    })));
    setEditingSetup(true);
  };

  const updateDraftName = (i, val) => {
    setSetupDraft((d) => d.map((m, idx) => idx === i ? { ...m, name: val } : m));
  };

  const updateDraftGoalLabel = (mi, gi, val) => {
    setSetupDraft((d) => d.map((m, idx) => {
      if (idx !== mi) return m;
      return { ...m, goals: m.goals.map((g, gIdx) => gIdx === gi ? { ...g, label: val } : g) };
    }));
  };

  const updateDraftGoalTarget = (mi, gi, val) => {
    setSetupDraft((d) => d.map((m, idx) => {
      if (idx !== mi) return m;
      return { ...m, goals: m.goals.map((g, gIdx) => gIdx === gi ? { ...g, target: Math.max(1, parseInt(val) || 1) } : g) };
    }));
  };

  const addGoal = (mi) => {
    setSetupDraft((d) => d.map((m, idx) => {
      if (idx !== mi) return m;
      return { ...m, goals: [...m.goals, { id: newGoalId(), label: "New goal", target: 3 }] };
    }));
  };

  const removeGoal = (mi, gi) => {
    setSetupDraft((d) => d.map((m, idx) => {
      if (idx !== mi) return m;
      if (m.goals.length <= 1) return m; // keep at least one
      return { ...m, goals: m.goals.filter((_, gIdx) => gIdx !== gi) };
    }));
  };

  const commitSetup = async () => {
    const updated = setupDraft.map((m) => ({
      ...m,
      name: m.name || "Member",
      goals: m.goals.map((g) => ({ ...g, label: g.label || "Goal", target: g.target || 1 })),
    }));
    setMembers(updated);
    setEditingSetup(false);
    try {
      await setDoc(doc(db, "challenge", "members"), { list: updated });
      setSaveStatus("✓ Saved & synced");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch (e) {
      setSaveStatus("Save failed — check Firebase config");
    }
  };

  if (!loaded) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0F1B0D", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        color: "#7FB069", fontFamily: "Georgia, serif",
      }}>
        <div style={{ fontSize: 32 }}>🏅</div>
        <div style={{ fontSize: 16 }}>Connecting to Firebase…</div>
        <div style={{ fontSize: 12, color: "#5A7A50" }}>Make sure your firebaseConfig is filled in</div>
      </div>
    );
  }

  // ── Stepper component ────────────────────────
  const Stepper = ({ value, onDecrement, onIncrement, label, target, done }) => {
    const pct = Math.min(100, Math.round((value / target) * 100));
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: done ? "#7FB069" : "#9DB890", fontWeight: done ? 600 : 400 }}>
            {label} {done && "✓"}
          </span>
          <span style={{ fontSize: 12, fontFamily: "monospace", color: done ? "#7FB069" : "#C8E6B0" }}>
            {value} / {target}
          </span>
        </div>
        <div style={{ background: "#0F1B0D", borderRadius: 6, height: 7, overflow: "hidden", marginBottom: 7 }}>
          <div style={{
            height: "100%", borderRadius: 6, transition: "width 0.35s ease, background 0.35s ease",
            background: done ? "linear-gradient(90deg, #3A7A20, #7FB069)" : "linear-gradient(90deg, #2A5A3A, #4A8A55)",
            width: `${pct}%`,
          }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onDecrement} disabled={value === 0} style={{
            width: 28, height: 28, borderRadius: 6, border: "1px solid #3A5A2A",
            background: value === 0 ? "#1A2E15" : "#2A4A1E",
            color: value === 0 ? "#3A5A2A" : "#7FB069",
            fontSize: 16, cursor: value === 0 ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>−</button>
          <span style={{ fontSize: 12, color: "#5A7A50", flex: 1, textAlign: "center" }}>
            {done ? "Done!" : value === 0 ? `Log a ${label.toLowerCase()}` : `${target - value} more`}
          </span>
          <button onClick={onIncrement} style={{
            width: 28, height: 28, borderRadius: 6, border: "1px solid #3A6A2A",
            background: "#2A4A1E", color: "#7FB069", fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
        </div>
      </div>
    );
  };

  // ── UI ───────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0F1B0D", fontFamily: "'Georgia', serif", color: "#E8E0D0" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1A2E15 0%, #0F1B0D 100%)",
        borderBottom: "2px solid #3A5C2A", padding: "28px 24px 20px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 200, height: 200,
          borderRadius: "50%", background: "radial-gradient(circle, #3A5C2A33, transparent)",
        }} />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 32 }}>🏅</span>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "#C8E6B0" }}>
              Family Fitness Challenge
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ margin: 0, color: "#7FB069", fontSize: 14, letterSpacing: "0.5px" }}>
              12-Week Consistency Challenge · Spring 2025
            </p>
            <span style={{
              background: "#2A4A1E", border: "1px solid #3A6A2A", color: "#7FB069",
              borderRadius: 20, padding: "2px 10px", fontSize: 11, fontFamily: "monospace",
            }}>● LIVE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#9DB890" }}>WEEK</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
                const ph = getPhase(w);
                return (
                  <button key={w} onClick={() => setCurrentWeek(w)} style={{
                    width: 32, height: 32, borderRadius: 6,
                    border: currentWeek === w ? `2px solid ${ph.color}` : "2px solid transparent",
                    background: currentWeek === w ? ph.color + "33" : "#1A2E15",
                    color: currentWeek === w ? ph.color : "#6A8A60",
                    fontSize: 13, fontWeight: currentWeek === w ? 700 : 400,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{w}</button>
                );
              })}
            </div>
            <span style={{
              background: phase.color + "22", border: `1px solid ${phase.color}55`,
              color: phase.color, borderRadius: 20, padding: "3px 12px", fontSize: 12,
              fontFamily: "monospace", letterSpacing: "1px",
            }}>
              {phase.name.toUpperCase()} · {phase.desc}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #2A3F22", marginBottom: 24, marginTop: 20 }}>
          {["log", "leaderboard", "setup"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 20px", background: "none",
              border: "none", borderBottom: activeTab === tab ? "2px solid #7FB069" : "2px solid transparent",
              color: activeTab === tab ? "#C8E6B0" : "#5A7A50",
              fontSize: 14, cursor: "pointer", textTransform: "capitalize",
              fontFamily: "inherit", letterSpacing: "0.3px",
            }}>
              {tab === "log" ? "📋 Weekly Log" : tab === "leaderboard" ? "🏆 Leaderboard" : "⚙️ Setup"}
            </button>
          ))}
        </div>

        {/* ── LOG TAB ── */}
        {activeTab === "log" && (
          <div>
            <p style={{ color: "#6A8A60", fontSize: 13, marginBottom: 20, marginTop: 0 }}>
              Track progress toward each goal. All goals must be hit to unlock the 5 pts.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {members.map((member) => {
                const weekLog = (logs[member.id] || {})[currentWeek] || { goalProgress: {}, buddy: false };
                const goals = member.goals || DEFAULT_GOALS();
                const allMet = allGoalsMet(member, weekLog);
                const pts = calculatePoints(member, weekLog);
                const metCount = goals.filter((g) => (weekLog.goalProgress?.[g.id] || 0) >= g.target).length;

                return (
                  <div key={member.id} style={{
                    background: "#1A2E15", borderRadius: 14,
                    border: allMet ? "1px solid #3A6A2A" : "1px solid #2A3F22",
                    overflow: "hidden", transition: "border-color 0.3s",
                  }}>
                    {/* Header */}
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "14px 18px", borderBottom: "1px solid #2A3F22",
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, color: "#C8E6B0" }}>{member.name}</div>
                        <div style={{ fontSize: 12, color: allMet ? "#7FB069" : "#5A7A50", marginTop: 2 }}>
                          {allMet
                            ? "All goals hit! 🎉 +5 pts unlocked"
                            : `${metCount} / ${goals.length} goals complete`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#7FB069", fontFamily: "monospace" }}>
                          {pts}<span style={{ fontSize: 13, color: "#5A7A50" }}> pts</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#5A7A50" }}>this week</div>
                      </div>
                    </div>

                    {/* Goals */}
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #2A3F22" }}>
                      {goals.map((goal) => {
                        const count = weekLog.goalProgress?.[goal.id] || 0;
                        const done = count >= goal.target;
                        return (
                          <Stepper
                            key={goal.id}
                            label={goal.label}
                            target={goal.target}
                            value={count}
                            done={done}
                            onDecrement={() => updateGoalProgress(member.id, goal.id, -1)}
                            onIncrement={() => updateGoalProgress(member.id, goal.id, 1)}
                          />
                        );
                      })}
                    </div>

                    {/* Buddy */}
                    <div style={{ padding: "10px 14px" }}>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 10,
                        cursor: "pointer", padding: "8px 10px", borderRadius: 8,
                        background: weekLog.buddy ? "#2A4A1E" : "transparent",
                        border: `1px solid ${weekLog.buddy ? "#3A6A2A" : "transparent"}`,
                        transition: "all 0.15s",
                      }}>
                        <input
                          type="checkbox"
                          checked={!!weekLog.buddy}
                          onChange={() => toggleBuddy(member.id)}
                          style={{ accentColor: "#7FB069", width: 16, height: 16, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, color: weekLog.buddy ? "#C8E6B0" : "#6A8A60", flex: 1 }}>
                          Worked out with a buddy
                        </span>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: weekLog.buddy ? "#7FB069" : "#3A5A2A" }}>+2</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === "leaderboard" && (
          <div>
            <div style={{
              background: "#1A2E15", borderRadius: 14, border: "1px solid #2A3F22",
              padding: "18px 20px", marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ color: "#9DB890", fontSize: 14 }}>🌿 Family Group Progress</span>
                <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: familyAvgPct >= 70 ? "#7FB069" : "#E8A838" }}>
                  {familyAvgPct}%
                </span>
              </div>
              <div style={{ background: "#0F1B0D", borderRadius: 8, height: 10, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 8, transition: "width 0.5s ease",
                  background: familyAvgPct >= 70 ? "linear-gradient(90deg, #3A7A20, #7FB069)" : "linear-gradient(90deg, #8A6020, #E8A838)",
                  width: `${Math.min(familyAvgPct, 100)}%`,
                }} />
              </div>
              <div style={{ fontSize: 12, color: "#5A7A50", marginTop: 8 }}>
                {familyAvgPct >= 70 ? "✅ On track for the group reward!" : `Need ${70 - familyAvgPct}% more to unlock the group reward`}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {leaderboard.map((member, idx) => {
                const pct = Math.round((member.total / maxPossible) * 100);
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div key={member.id} style={{
                    background: "#1A2E15", borderRadius: 12,
                    border: idx === 0 ? "1px solid #7FB06966" : "1px solid #2A3F22",
                    padding: "14px 18px", display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <span style={{ fontSize: 22, width: 32, textAlign: "center" }}>{medals[idx] || `#${idx + 1}`}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "#C8E6B0", marginBottom: 4 }}>{member.name}</div>
                      <div style={{ background: "#0F1B0D", borderRadius: 6, height: 6, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 6,
                          background: "linear-gradient(90deg, #3A7A20, #7FB069)",
                          width: `${pct}%`, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 70 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#7FB069" }}>{member.total}</div>
                      <div style={{ fontSize: 11, color: "#5A7A50" }}>{pct}% of max</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ color: "#9DB890", fontSize: 14, marginBottom: 12, letterSpacing: "1px" }}>WEEK-BY-WEEK BREAKDOWN</h3>
              <div style={{ background: "#1A2E15", borderRadius: 12, border: "1px solid #2A3F22", overflowX: "auto" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: `110px repeat(${TOTAL_WEEKS}, 1fr)`,
                  borderBottom: "1px solid #2A3F22", padding: "10px 14px", minWidth: 560,
                }}>
                  <div style={{ fontSize: 11, color: "#5A7A50" }}>MEMBER</div>
                  {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
                    <div key={i} style={{
                      fontSize: 11, color: i + 1 === currentWeek ? "#7FB069" : "#5A7A50",
                      textAlign: "center", fontWeight: i + 1 === currentWeek ? 700 : 400,
                    }}>W{i + 1}</div>
                  ))}
                </div>
                {members.map((m) => (
                  <div key={m.id} style={{
                    display: "grid", gridTemplateColumns: `110px repeat(${TOTAL_WEEKS}, 1fr)`,
                    padding: "8px 14px", borderBottom: "1px solid #1A2E15", minWidth: 560,
                  }}>
                    <div style={{ fontSize: 13, color: "#C8E6B0" }}>{m.name.split(" ")[0]}</div>
                    {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
                      const wp = getWeekPoints(m, i + 1);
                      return (
                        <div key={i} style={{
                          textAlign: "center", fontSize: 12, fontFamily: "monospace",
                          color: wp > 0 ? "#7FB069" : "#2A3F22",
                        }}>{wp > 0 ? wp : "·"}</div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SETUP TAB ── */}
        {activeTab === "setup" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <h3 style={{ margin: 0, color: "#9DB890", fontSize: 14, letterSpacing: "1px" }}>MEMBERS & GOALS</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {saveStatus && <span style={{ color: "#7FB069", fontSize: 13 }}>{saveStatus}</span>}
                  {!editingSetup
                    ? <button onClick={startEditing} style={{
                      background: "#2A4A1E", border: "1px solid #3A6A2A", color: "#7FB069",
                      borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                    }}>Edit</button>
                    : <button onClick={commitSetup} style={{
                      background: "#7FB069", border: "none", color: "#0F1B0D",
                      borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13,
                      fontWeight: 700, fontFamily: "inherit",
                    }}>Save & Sync</button>
                  }
                </div>
              </div>

              {/* ── VIEW MODE ── */}
              {!editingSetup && members.map((m) => (
                <div key={m.id} style={{
                  padding: "12px 0", borderBottom: "1px solid #2A3F22",
                }}>
                  <div style={{ color: "#C8E6B0", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{m.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(m.goals || DEFAULT_GOALS()).map((g) => (
                      <span key={g.id} style={{
                        background: "#2A4A1E", border: "1px solid #3A6A2A",
                        borderRadius: 8, padding: "3px 10px",
                        fontSize: 12, color: "#7FB069", fontFamily: "monospace",
                      }}>
                        {g.label}: {g.target}x/wk
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* ── EDIT MODE ── */}
              {editingSetup && (
                <div>
                  <p style={{ color: "#5A7A50", fontSize: 12, margin: "0 0 16px" }}>
                    Set names and goals. Each person can have multiple goals — all must be hit to earn 5 pts.
                  </p>
                  {setupDraft.map((m, mi) => (
                    <div key={m.id} style={{
                      background: "#0F1B0D", borderRadius: 12, border: "1px solid #2A3F22",
                      padding: "14px 16px", marginBottom: 12,
                    }}>
                      {/* Name */}
                      <input
                        value={m.name}
                        onChange={(e) => updateDraftName(mi, e.target.value)}
                        placeholder="Name"
                        style={{
                          background: "#1A2E15", border: "1px solid #3A6A2A", borderRadius: 8,
                          padding: "7px 12px", color: "#C8E6B0", fontSize: 15,
                          fontFamily: "inherit", width: "100%", marginBottom: 12, boxSizing: "border-box",
                          fontWeight: 600,
                        }}
                      />

                      {/* Goals */}
                      <div style={{ fontSize: 11, color: "#5A7A50", letterSpacing: "0.5px", marginBottom: 8 }}>GOALS</div>
                      {m.goals.map((g, gi) => (
                        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          <input
                            value={g.label}
                            onChange={(e) => updateDraftGoalLabel(mi, gi, e.target.value)}
                            placeholder="Goal name"
                            style={{
                              background: "#1A2E15", border: "1px solid #3A6A2A", borderRadius: 8,
                              padding: "6px 10px", color: "#C8E6B0", fontSize: 13,
                              fontFamily: "inherit", flex: 1,
                            }}
                          />
                          <input
                            type="number"
                            min="1"
                            max="14"
                            value={g.target}
                            onChange={(e) => updateDraftGoalTarget(mi, gi, e.target.value)}
                            style={{
                              background: "#1A2E15", border: "1px solid #3A6A2A", borderRadius: 8,
                              padding: "6px 8px", color: "#7FB069", fontSize: 14,
                              fontFamily: "monospace", width: 56, textAlign: "center",
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#5A7A50", whiteSpace: "nowrap" }}>/ wk</span>
                          {m.goals.length > 1 && (
                            <button onClick={() => removeGoal(mi, gi)} style={{
                              background: "none", border: "1px solid #5A2A2A", borderRadius: 6,
                              color: "#A05050", fontSize: 14, cursor: "pointer",
                              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                            }}>×</button>
                          )}
                        </div>
                      ))}

                      <button onClick={() => addGoal(mi)} style={{
                        background: "none", border: "1px dashed #3A5A2A", borderRadius: 8,
                        color: "#5A8A50", fontSize: 13, cursor: "pointer",
                        padding: "6px 12px", fontFamily: "inherit", width: "100%", marginTop: 4,
                      }}>+ Add goal</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scoring Guide */}
            <div style={{ background: "#1A2E15", borderRadius: 14, border: "1px solid #2A3F22", padding: "18px 20px" }}>
              <h3 style={{ margin: "0 0 16px", color: "#9DB890", fontSize: 14, letterSpacing: "1px" }}>📋 SCORING GUIDE</h3>
              {[
                { pts: "5 pts", action: "Hit all weekly goals", color: "#7FB069" },
                { pts: "2 pts", action: "Worked out with a buddy", color: "#E8A838" },
                { pts: "7 pts", action: "Maximum possible per week", color: "#E05C5C" },
              ].map(({ pts, action, color }) => (
                <div key={action} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid #2A3F2266",
                }}>
                  <span style={{ color: "#9DB890", fontSize: 13 }}>{action}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color, fontSize: 14 }}>{pts}</span>
                </div>
              ))}
            </div>

            {/* Phases */}
            <div style={{ background: "#1A2E15", borderRadius: 14, border: "1px solid #2A3F22", padding: "18px 20px", marginTop: 14 }}>
              <h3 style={{ margin: "0 0 14px", color: "#9DB890", fontSize: 14, letterSpacing: "1px" }}>🗓 CHALLENGE PHASES</h3>
              {[
                { weeks: "Weeks 1–4", name: "Foundation", color: "#7FB069", desc: "Build the habit. Just show up." },
                { weeks: "Weeks 5–8", name: "Build", color: "#E8A838", desc: "Increase your goals by 10%. Push harder." },
                { weeks: "Weeks 9–12", name: "Peak", color: "#E05C5C", desc: "Final push. Give it everything." },
              ].map(({ weeks, name, color, desc }) => (
                <div key={name} style={{
                  display: "flex", gap: 14, padding: "10px 0",
                  borderBottom: "1px solid #2A3F2266", alignItems: "flex-start",
                }}>
                  <div style={{
                    background: color + "22", color, border: `1px solid ${color}44`,
                    borderRadius: 8, padding: "4px 10px", fontSize: 12,
                    fontFamily: "monospace", whiteSpace: "nowrap", marginTop: 2,
                  }}>{weeks}</div>
                  <div>
                    <div style={{ color: "#C8E6B0", fontSize: 14, fontWeight: 600 }}>{name}</div>
                    <div style={{ color: "#5A7A50", fontSize: 12 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}