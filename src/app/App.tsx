"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Insight, Plan, PlanCheckIn, UserProfile } from "@/lib/types";

type Audience = "doctor" | "partner" | "friend";

export type InsightEvalSlim = {
  judge_avg: number;
  grounding_pct: number;
  per_axis: {
    specificity: number;
    grounding: number;
    actionability: number;
    safety: number;
  };
};

type Props = {
  profiles: UserProfile[];
  insightCounts: Record<string, number>;
  evalByInsight: Record<string, InsightEvalSlim>;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

const AUDIENCES: { id: Audience; label: string; sub: string }[] = [
  { id: "doctor", label: "Doctor", sub: "clinical brief" },
  { id: "partner", label: "Partner", sub: "plain English" },
  { id: "friend", label: "Friend", sub: "quick note" },
];

const SEVERITY_STYLES: Record<Insight["severity"], { dot: string; label: string; chip: string }> = {
  info: {
    dot: "bg-ink-300",
    label: "FYI",
    chip: "bg-ink-100 text-ink-600 border-ink-200",
  },
  watch: {
    dot: "bg-amber-400",
    label: "Watch",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
  },
  act: {
    dot: "bg-accent",
    label: "Act soon",
    chip: "bg-accent-soft text-accent border-accent/30",
  },
  urgent: {
    dot: "bg-red-500",
    label: "Urgent",
    chip: "bg-red-50 text-red-800 border-red-200",
  },
};

const SUGGESTED_QUESTIONS = [
  "Why is this happening?",
  "What should I do today?",
  "Is this urgent?",
  "Show me the trend.",
];

function noticedRelative(_dateStr: string): string {
  return "noticed this morning";
}

export default function App({ profiles, insightCounts, evalByInsight }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(profiles[0]?.id ?? "");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const [shareAlert, setShareAlert] = useState<Insight | null>(null);
  const [shareAudience, setShareAudience] = useState<Audience>("doctor");
  const [shareMessages, setShareMessages] = useState<
    Partial<Record<Audience, string>>
  >({});
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [creatingPlanFor, setCreatingPlanFor] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [checkInLoadingId, setCheckInLoadingId] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  const activeAlert = useMemo(
    () => insights.find((i) => i.id === activeAlertId) ?? null,
    [insights, activeAlertId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingInsights(true);
    setInsights([]);
    setActiveAlertId(null);
    setMessages([]);
    setPlans([]);
    setExpandedPlanId(null);
    fetch(`/api/insights/${selectedUserId}`)
      .then((r) => r.json())
      .then((data: { insights: Insight[] }) => {
        if (cancelled) return;
        setInsights(data.insights);
        if (data.insights[0]) setActiveAlertId(data.insights[0].id);
      })
      .finally(() => {
        if (!cancelled) setLoadingInsights(false);
      });
    fetch(`/api/plan/list/${selectedUserId}`)
      .then((r) => r.json())
      .then((data: { plans: Plan[] }) => {
        if (cancelled) return;
        setPlans(data.plans);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          alert: activeAlert,
          messages: next,
        }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: `[error: ${(err as Error).message}]`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function openShare(alert: Insight) {
    setShareAlert(alert);
    setShareAudience("doctor");
    setShareMessages({});
    setShareCopied(false);
    loadShareMessage(alert, "doctor");
  }

  function closeShare() {
    setShareAlert(null);
    setShareCopied(false);
  }

  async function loadShareMessage(alert: Insight, audience: Audience) {
    setShareAudience(audience);
    setShareCopied(false);
    if (shareMessages[audience]) return;
    setShareLoading(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, alert, audience }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (data.message) {
        setShareMessages((m) => ({ ...m, [audience]: data.message }));
      } else {
        setShareMessages((m) => ({
          ...m,
          [audience]: `[error: ${data.error ?? "unknown"}]`,
        }));
      }
    } catch (err) {
      setShareMessages((m) => ({
        ...m,
        [audience]: `[error: ${(err as Error).message}]`,
      }));
    } finally {
      setShareLoading(false);
    }
  }

  async function copyShareMessage() {
    const msg = shareAlert && shareMessages[shareAudience];
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      /* noop */
    }
  }

  async function createPlanFromAlert(alert: Insight) {
    if (creatingPlanFor) return;
    setCreatingPlanFor(alert.id);
    try {
      const res = await fetch("/api/plan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, alert }),
      });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (data.plan) {
        setPlans((p) => [data.plan as Plan, ...p]);
        setExpandedPlanId(data.plan.id);
      }
    } finally {
      setCreatingPlanFor(null);
    }
  }

  async function runCheckIn(planId: string) {
    if (checkInLoadingId) return;
    setCheckInLoadingId(planId);
    try {
      const res = await fetch("/api/plan/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, planId }),
      });
      const data = (await res.json()) as {
        check_in?: PlanCheckIn;
        error?: string;
      };
      if (data.check_in) {
        setPlans((ps) =>
          ps.map((p) =>
            p.id === planId
              ? { ...p, check_ins: [...p.check_ins, data.check_in as PlanCheckIn] }
              : p,
          ),
        );
      }
    } finally {
      setCheckInLoadingId(null);
    }
  }

  function buildSendHref(audience: Audience, message: string, headline: string): string {
    const subject = `From ${selectedProfile?.name ?? ""} — ${headline}`;
    if (audience === "doctor") {
      return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    }
    // partner / friend: prefer SMS, but mailto fallback works in most clients
    return `sms:?&body=${encodeURIComponent(message)}`;
  }

  return (
    <div className="flex h-screen bg-ink-50">
      <aside className="w-72 shrink-0 border-r border-ink-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-ink-200">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-accent text-white text-sm font-bold flex items-center justify-center">
              U
            </div>
            <div className="text-[15px] font-semibold tracking-tight">UniqueHuman</div>
          </div>
          <div className="text-[11px] text-ink-400 mt-1 ml-9 -translate-y-0.5">
            proactive intelligence
          </div>
        </div>
        <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-ink-400">
          People ({profiles.length})
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {profiles.map((p) => {
            const selected = p.id === selectedUserId;
            const count = insightCounts[p.id] ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedUserId(p.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
                  selected
                    ? "bg-accent-soft border-accent"
                    : "border-transparent hover:bg-ink-50"
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    selected ? "bg-accent text-white" : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {p.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink-900 truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-ink-400 truncate">
                    {p.condition ?? "no diagnosis"}
                  </div>
                </div>
                {count > 0 && (
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${
                      selected
                        ? "bg-white text-accent"
                        : "bg-accent text-white"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-ink-200 text-[11px] text-ink-400">
          Data scanned across wearable, records, labs &amp; symptom flags.
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex">
        <section className="flex-1 min-w-0 flex flex-col">
          <header className="px-8 pt-7 pb-5 border-b border-ink-200 bg-white">
            {selectedProfile && (
              <>
                <div className="flex items-baseline gap-3">
                  <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
                    {selectedProfile.name}
                  </h1>
                  <span className="text-[13px] text-ink-400">
                    {selectedProfile.age} · {selectedProfile.sex} ·{" "}
                    {selectedProfile.condition ?? "no diagnosis on file"}
                  </span>
                </div>
                <div className="text-[13px] text-ink-500 mt-1">
                  {insights.length > 0
                    ? `Here's what UniqueHuman noticed for ${selectedProfile.name.split(" ")[0]} today.`
                    : loadingInsights
                      ? "Scanning…"
                      : "No insights cached yet — run `pnpm run insights`."}
                </div>
              </>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-thin">
            {loadingInsights && (
              <div className="text-[13px] text-ink-400 animate-pulse-soft">
                scanning your last 90 days…
              </div>
            )}

            {plans.length > 0 && (
              <div className="max-w-[680px] mb-6">
                <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-2">
                  Currently working on
                </div>
                <div className="space-y-2">
                  {plans.map((plan) => {
                    const expanded = plan.id === expandedPlanId;
                    const lastCheckIn = plan.check_ins.at(-1) ?? null;
                    return (
                      <div
                        key={plan.id}
                        className="bg-gradient-to-br from-white to-accent-soft/30 rounded-xl border border-accent/30"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPlanId(expanded ? null : plan.id)
                          }
                          className="w-full text-left px-4 py-3 flex items-center gap-3"
                        >
                          <div className="h-8 w-8 rounded-full bg-accent text-white flex items-center justify-center shrink-0">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <path
                                d="M3 8.5L6.5 12L13 4.5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-ink-900 truncate">
                              {plan.title}
                            </div>
                            <div className="text-[11px] text-ink-500 mt-0.5">
                              {plan.duration_days}-day plan ·{" "}
                              {plan.check_ins.length === 0
                                ? "no check-ins yet"
                                : `${plan.check_ins.length} check-in${plan.check_ins.length === 1 ? "" : "s"}`}
                              {lastCheckIn && (
                                <span
                                  className={`ml-2 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                                    lastCheckIn.verdict === "on_track"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : lastCheckIn.verdict === "off_track"
                                        ? "bg-red-100 text-red-800"
                                        : lastCheckIn.verdict === "mixed"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-ink-100 text-ink-600"
                                  }`}
                                >
                                  {lastCheckIn.verdict.replace("_", " ")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-ink-400 text-[12px]">
                            {expanded ? "▾" : "▸"}
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-accent/20">
                            <div className="text-[12px] text-ink-600 leading-relaxed mb-3">
                              {plan.rationale}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
                              Tasks
                            </div>
                            <ul className="space-y-1 mb-3">
                              {plan.tasks.map((t, i) => (
                                <li
                                  key={i}
                                  className="text-[12px] text-ink-800 flex items-start gap-2"
                                >
                                  <span className="text-accent mt-0.5">•</span>
                                  <span>
                                    {t.description}{" "}
                                    <span className="text-ink-400">
                                      ({t.cadence})
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                              Success metric
                            </div>
                            <div className="text-[12px] text-ink-800 mb-3">
                              {plan.success_metric.description}
                              {plan.success_metric.target && (
                                <span className="block text-ink-500 text-[11px] mt-0.5">
                                  Target: {plan.success_metric.target}
                                </span>
                              )}
                            </div>

                            {plan.check_ins.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <div className="text-[10px] uppercase tracking-wider text-ink-400">
                                  Check-ins
                                </div>
                                {plan.check_ins.map((ci, i) => (
                                  <div
                                    key={i}
                                    className="bg-white rounded-lg border border-ink-200 px-3 py-2"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                                          ci.verdict === "on_track"
                                            ? "bg-emerald-100 text-emerald-800"
                                            : ci.verdict === "off_track"
                                              ? "bg-red-100 text-red-800"
                                              : ci.verdict === "mixed"
                                                ? "bg-amber-100 text-amber-800"
                                                : "bg-ink-100 text-ink-600"
                                        }`}
                                      >
                                        {ci.verdict.replace("_", " ")}
                                      </span>
                                      <span className="text-[10px] text-ink-400">
                                        {new Date(ci.at).toLocaleString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    </div>
                                    <div className="text-[12px] text-ink-700 leading-relaxed">
                                      {ci.body}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => runCheckIn(plan.id)}
                              disabled={checkInLoadingId === plan.id}
                              className="mt-3 text-[12px] font-medium text-accent bg-white border border-accent/30 hover:bg-accent-soft rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                            >
                              {checkInLoadingId === plan.id
                                ? "Checking in…"
                                : plan.check_ins.length === 0
                                  ? "How am I doing?"
                                  : "Run another check-in"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 max-w-[680px]">
              {insights.map((ins) => {
                const sev = SEVERITY_STYLES[ins.severity];
                const isActive = ins.id === activeAlertId;
                return (
                  <div
                    key={ins.id}
                    onClick={() => {
                      setActiveAlertId(ins.id);
                      setMessages([]);
                    }}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer w-full text-left bg-white rounded-xl border transition-all ${
                      isActive
                        ? "border-accent shadow-[0_8px_24px_-12px_rgba(239,62,109,0.25)]"
                        : "border-ink-200 hover:border-ink-300"
                    }`}
                  >
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${sev.chip}`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle ${sev.dot}`}
                          />
                          {sev.label}
                        </span>
                        {ins.confidence && (
                          <span
                            title={ins.confidence_reason}
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                              ins.confidence === "high"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : ins.confidence === "medium"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-ink-100 text-ink-600 border-ink-200"
                            }`}
                          >
                            confidence: {ins.confidence}
                          </span>
                        )}
                        <span className="text-[11px] text-ink-400">
                          {noticedRelative(ins.noticed_at)}
                        </span>
                      </div>
                      <h3 className="text-[15px] font-semibold text-ink-900 leading-snug">
                        {ins.headline}
                      </h3>
                      <p className="text-[13px] text-ink-600 mt-1.5 leading-relaxed">
                        {ins.body}
                      </p>
                      {ins.evidence.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {ins.evidence.map((e, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[11px] bg-ink-50 border border-ink-200 rounded-md px-2 py-1"
                            >
                              <span className="text-ink-400">{e.label}:</span>
                              <span className="text-ink-700 font-medium">
                                {e.value}
                              </span>
                              {e.date && (
                                <span className="text-ink-400 ml-0.5">· {e.date}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {ins.discrepancies && ins.discrepancies.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-ink-100">
                          <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                            ⚠ Cross-source tension
                          </div>
                          <ul className="space-y-1">
                            {ins.discrepancies.map((d, i) => (
                              <li
                                key={i}
                                className="text-[12px] text-ink-700 leading-snug"
                              >
                                {d.description}{" "}
                                <span className="text-ink-400">
                                  ({d.sources.join(" vs ")})
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-ink-100 flex items-start gap-2">
                        <div className="text-[11px] uppercase tracking-wider text-ink-400 mt-0.5 shrink-0">
                          Next
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-ink-700 leading-snug">
                            {ins.suggested_action}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              createPlanFromAlert(ins);
                            }}
                            disabled={creatingPlanFor === ins.id}
                            className="mt-2 text-[11px] font-semibold text-accent bg-accent-soft hover:bg-accent hover:text-white border border-accent/30 hover:border-accent rounded-md px-2.5 py-1 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                          >
                            {creatingPlanFor === ins.id ? (
                              <>
                                <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin" />
                                Drafting plan…
                              </>
                            ) : (
                              <>
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M8 3V13M3 8H13"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                Make this a plan
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      {evalByInsight[ins.id] && (
                        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider text-ink-400">
                            Eval
                          </span>
                          <span
                            title={`spec ${evalByInsight[ins.id].per_axis.specificity} · grounding ${evalByInsight[ins.id].per_axis.grounding} · actionability ${evalByInsight[ins.id].per_axis.actionability} · safety ${evalByInsight[ins.id].per_axis.safety}`}
                            className="text-[11px] font-medium bg-ink-50 border border-ink-200 rounded-md px-2 py-0.5 text-ink-700"
                          >
                            judge {evalByInsight[ins.id].judge_avg.toFixed(1)}/5
                          </span>
                          <span
                            title="Fraction of numbers in the alert that appear in the user's source data."
                            className="text-[11px] font-medium bg-ink-50 border border-ink-200 rounded-md px-2 py-0.5 text-ink-700"
                          >
                            grounded {evalByInsight[ins.id].grounding_pct}%
                          </span>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-ink-400 flex items-center gap-1.5 flex-wrap min-w-0">
                          <span>Sources:</span>
                          {ins.data_sources.map((s) => (
                            <span
                              key={s}
                              className="bg-white border border-ink-200 rounded px-1.5 py-0.5"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openShare(ins);
                          }}
                          className="text-[11px] font-medium text-ink-600 hover:text-accent border border-ink-200 hover:border-accent/40 bg-white rounded-md px-2 py-1 transition-colors shrink-0 inline-flex items-center gap-1"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M11 5L8 2M8 2L5 5M8 2V10M3 9V12C3 13.1046 3.89543 14 5 14H11C12.1046 14 13 13.1046 13 12V9"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="w-[420px] shrink-0 border-l border-ink-200 bg-white flex flex-col">
          <header className="px-5 py-4 border-b border-ink-200">
            <div className="text-[11px] uppercase tracking-wider text-ink-400">
              Conversation
            </div>
            {activeAlert ? (
              <div className="text-[13px] text-ink-900 font-medium mt-0.5 leading-snug">
                About: {activeAlert.headline}
              </div>
            ) : (
              <div className="text-[13px] text-ink-400 mt-0.5">
                Pick an alert to dig deeper.
              </div>
            )}
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
            {activeAlert && messages.length === 0 && (
              <div className="space-y-3">
                <div className="text-[12px] text-ink-400">
                  Ask a follow-up — UniqueHuman has full access to{" "}
                  {selectedProfile?.name.split(" ")[0]}&apos;s context.
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-[12px] bg-ink-50 hover:bg-ink-100 border border-ink-200 rounded-full px-3 py-1.5 text-ink-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4 mt-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-[13px] leading-relaxed ${
                    m.role === "user" ? "text-ink-900" : "text-ink-700"
                  }`}
                >
                  <div
                    className={`text-[10px] uppercase tracking-wider mb-1 ${
                      m.role === "user" ? "text-accent" : "text-ink-400"
                    }`}
                  >
                    {m.role === "user" ? "You" : "UniqueHuman"}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {m.content}
                    {streaming && i === messages.length - 1 && m.role === "assistant" && (
                      <span className="inline-block w-1.5 h-3.5 bg-ink-400 ml-0.5 align-middle animate-pulse-soft" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(draft);
            }}
            className="p-4 border-t border-ink-200"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(draft);
                  }
                }}
                placeholder={activeAlert ? "Ask a follow-up…" : "Pick an alert first"}
                disabled={!activeAlert || streaming}
                rows={1}
                className="flex-1 resize-none text-[13px] bg-ink-50 border border-ink-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent focus:bg-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!activeAlert || streaming || !draft.trim()}
                className="bg-accent text-white text-[12px] font-semibold px-3.5 py-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
              >
                {streaming ? "…" : "Send"}
              </button>
            </div>
          </form>
        </aside>
      </main>

      {shareAlert && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={closeShare}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-5 border-b border-ink-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400">
                    Share alert
                  </div>
                  <div className="text-[15px] font-semibold text-ink-900 mt-0.5 leading-snug">
                    {shareAlert.headline}
                  </div>
                  <div className="text-[12px] text-ink-500 mt-1">
                    From {selectedProfile?.name} · Drafted for your care network
                  </div>
                </div>
                <button
                  onClick={closeShare}
                  className="text-ink-400 hover:text-ink-700 text-lg leading-none -mr-1 -mt-1 p-1"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="px-6 pt-4 border-b border-ink-100 flex gap-1.5">
              {AUDIENCES.map((a) => {
                const active = a.id === shareAudience;
                return (
                  <button
                    key={a.id}
                    onClick={() => loadShareMessage(shareAlert, a.id)}
                    className={`flex-1 text-left px-3 py-2.5 rounded-t-lg border-b-2 transition-colors ${
                      active
                        ? "border-accent bg-accent-soft/40"
                        : "border-transparent hover:bg-ink-50"
                    }`}
                  >
                    <div
                      className={`text-[13px] font-semibold ${
                        active ? "text-accent" : "text-ink-700"
                      }`}
                    >
                      {a.label}
                    </div>
                    <div className="text-[10px] text-ink-400 uppercase tracking-wider mt-0.5">
                      {a.sub}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
              {shareLoading && !shareMessages[shareAudience] ? (
                <div className="space-y-2 animate-pulse-soft">
                  <div className="h-3 bg-ink-100 rounded w-11/12" />
                  <div className="h-3 bg-ink-100 rounded w-full" />
                  <div className="h-3 bg-ink-100 rounded w-10/12" />
                  <div className="h-3 bg-ink-100 rounded w-9/12" />
                  <div className="h-3 bg-ink-100 rounded w-11/12" />
                  <div className="text-[11px] text-ink-400 mt-3">
                    Drafting a {AUDIENCES.find((a) => a.id === shareAudience)?.label.toLowerCase()}-ready
                    message…
                  </div>
                </div>
              ) : (
                <div className="text-[14px] text-ink-800 leading-relaxed whitespace-pre-wrap font-serif">
                  {shareMessages[shareAudience] ?? ""}
                </div>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-ink-200 bg-ink-50/60 flex items-center justify-between gap-3">
              <div className="text-[11px] text-ink-400 leading-snug max-w-[280px]">
                One alert, three audiences. Same evidence, calibrated tone.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyShareMessage}
                  disabled={!shareMessages[shareAudience]}
                  className="text-[12px] font-medium text-ink-700 border border-ink-200 hover:border-ink-300 bg-white rounded-lg px-3 py-2 disabled:opacity-30 transition-colors"
                >
                  {shareCopied ? "Copied!" : "Copy"}
                </button>
                <a
                  href={
                    shareMessages[shareAudience]
                      ? buildSendHref(
                          shareAudience,
                          shareMessages[shareAudience] ?? "",
                          shareAlert.headline,
                        )
                      : "#"
                  }
                  onClick={(e) => {
                    if (!shareMessages[shareAudience]) e.preventDefault();
                  }}
                  className={`text-[12px] font-semibold text-white bg-accent rounded-lg px-3.5 py-2 transition-colors ${
                    shareMessages[shareAudience]
                      ? "hover:bg-accent/90"
                      : "opacity-30 pointer-events-none"
                  }`}
                >
                  {shareAudience === "doctor" ? "Open in mail" : "Send"}
                </a>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
