"use client";

import { FormEvent, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      setReply(data.reply || data.error || "No response");
    } catch {
      setReply("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <h1 className="text-4xl font-bold">Hackathon Agent</h1>
        <p className="text-neutral-400">
          Your first AI assistant for building the project.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a task for your agent..."
            className="w-full min-h-[180px] rounded-xl bg-neutral-900 border border-neutral-700 p-4 outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-white text-black px-5 py-3 font-semibold disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </form>

        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 min-h-[180px] whitespace-pre-wrap">
          {reply || "Agent response will appear here..."}
        </div>
      </div>
    </main>
  );
}
