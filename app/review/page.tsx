"use client";
import { useEffect, useState } from "react";
import { requestJson } from "../../lib/client-http";
type Lesson = { id: string; state: string; proposedText: string; productVersion: string; expiresAt: string };
export default function Review() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { const result = await requestJson<{ lessons: Lesson[] }>("/api/lessons"); setLessons(result.lessons); }
  useEffect(() => { load().catch((error: Error) => setError(error.message)); }, []);
  async function review(id: string, action: string) {
    setBusy(true); setError("");
    try { await requestJson("/api/lessons", { id, action }); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Review failed."); }
    finally { setBusy(false); }
  }
  return <main className="container"><header><a href="/playground" className="wordmark">talo</a></header>
    <h1>Review workspace lessons</h1><p>Check the proposed text and remove the candidate from consideration if it is misleading. Mark it redacted only after checking it contains no customer details. Approve only after reviewing its applicability.</p>
    {error && <p role="alert">{error}</p>}
    {lessons.map((lesson) => <article className="answer" key={lesson.id}><h2>{lesson.state}</h2><p>{lesson.proposedText}</p><p>Applies to {lesson.productVersion}. Expires {new Date(lesson.expiresAt).toLocaleDateString()}.</p>
      <div className="memory-actions">{lesson.state === "candidate" && <button disabled={busy} onClick={() => void review(lesson.id, "redact")}>Mark redacted</button>}
      {lesson.state === "redacted" && <button disabled={busy} onClick={() => void review(lesson.id, "approve")}>Approve for this workspace</button>}
      {lesson.state !== "retired" && <button className="secondary" disabled={busy} onClick={() => void review(lesson.id, "retire")}>Retire lesson</button>}</div>
    </article>)}<a href="/playground">Return to support</a>
  </main>;
}
