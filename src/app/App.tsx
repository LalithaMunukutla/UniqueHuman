"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Insight, UserProfile } from "@/lib/types";

type Props = {
  profiles: UserProfile[];
  insightCounts: Record<string, number>;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

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

export default function App({ profiles, insightCounts }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(profiles[0]?.id ?? "");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

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
            <div className="space-y-3 max-w-[680px]">
              {insights.map((ins) => {
                const sev = SEVERITY_STYLES[ins.severity];
                const isActive = ins.id === activeAlertId;
                return (
                  <button
                    key={ins.id}
                    onClick={() => {
                      setActiveAlertId(ins.id);
                      setMessages([]);
                    }}
                    className={`w-full text-left bg-white rounded-xl border transition-all ${
                      isActive
                        ? "border-accent shadow-[0_8px_24px_-12px_rgba(239,62,109,0.25)]"
                        : "border-ink-200 hover:border-ink-300"
                    }`}
                  >
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${sev.chip}`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle ${sev.dot}`}
                          />
                          {sev.label}
                        </span>
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
                      <div className="mt-3 pt-3 border-t border-ink-100 flex items-start gap-2">
                        <div className="text-[11px] uppercase tracking-wider text-ink-400 mt-0.5 shrink-0">
                          Next
                        </div>
                        <div className="text-[13px] text-ink-700 leading-snug">
                          {ins.suggested_action}
                        </div>
                      </div>
                      <div className="mt-3 text-[11px] text-ink-400 flex items-center gap-1.5">
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
                    </div>
                  </button>
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
    </div>
  );
}
