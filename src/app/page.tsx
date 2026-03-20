"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type UploadedAttachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

type MessageAttachment = UploadedAttachment;

type Message = {
  role: "user" | "assistant";
  content: string;
  attachment?: MessageAttachment;
};

type Mode = "strategist" | "coder" | "collaborate" | "builder";
type ReplyStyle = "short" | "detailed";

type InternalDiscussionMessage = {
  role: "Strategist" | "Builder" | "Coder" | "Verifier";
  content: string;
};

type CollaborationReply = {
  strategist?: string;
  builder?: string;
  coder?: string;
  verifier?: string;
  internalDiscussion?: InternalDiscussionMessage[];
  final?: string;
  error?: string;
};

type BuilderProposal = {
  summary?: string;
  notes?: string[];
  actions?: { path: string; content: string }[];
};

type ReviewResult = {
  verdict?: "approve" | "approve_with_warnings" | "reject";
  summary?: string;
  risks?: string[];
  error?: string;
};

type RepoFile = {
  path: string;
  content: string;
};

type PendingAttachment = UploadedAttachment & {
  previewUrl: string;
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("collaborate");
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>("short");

  const [collabReply, setCollabReply] = useState<CollaborationReply | null>(null);
  const [builderProposal, setBuilderProposal] = useState<BuilderProposal | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackResult, setRollbackResult] = useState("");

  const [memory, setMemory] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const [repoPaths, setRepoPaths] = useState(
    "src/app/page.tsx\nsrc/app/api/uploads/route.ts\nsrc/lib/uploads.ts"
  );
  const [repoFiles, setRepoFiles] = useState<RepoFile[]>([]);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [repoStatus, setRepoStatus] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/memory")
      .then((res) => res.json())
      .then((data) => setMemory(data.memory || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) {
        URL.revokeObjectURL(pendingAttachment.previewUrl);
      }
    };
  }, [pendingAttachment]);

  function clearPendingAttachment() {
    setPendingAttachment((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function saveMemory() {
    setSavingMemory(true);
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory }),
      });
    } finally {
      setSavingMemory(false);
    }
  }

  async function summarizeChatToMemory() {
    if (messages.length === 0 || summarizing) return;

    setSummarizing(true);
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (data.memory) setMemory(data.memory);
    } finally {
      setSummarizing(false);
    }
  }

  async function loadRepoFiles() {
    setLoadingRepo(true);
    setRepoStatus("");

    try {
      const paths = repoPaths
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);

      const res = await fetch("/api/repo/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths }),
      });

      const data = await res.json();

      if (Array.isArray(data.files)) {
        setRepoFiles(data.files);
        setRepoStatus(`Loaded ${data.files.length} file(s)`);
      } else {
        setRepoStatus(data.error || "Failed to load files");
      }
    } catch {
      setRepoStatus("Repo read request failed");
    } finally {
      setLoadingRepo(false);
    }
  }

  async function reviewProposal(proposal: BuilderProposal) {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proposal, repoFiles }),
    });

    const data = await res.json();
    setReviewResult(data);
  }

  async function applyProposal() {
    if (!builderProposal?.actions?.length || applying) return;

    setApplying(true);
    setApplyResult("");

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actions: builderProposal.actions }),
      });

      const data = await res.json();

      if (data.ok) {
        setApplyResult(`Applied: ${data.applied.join(", ")}`);
      } else {
        setApplyResult(data.error || "Apply failed");
      }
    } catch {
      setApplyResult("Apply request failed");
    } finally {
      setApplying(false);
    }
  }

  async function rollbackLastApply() {
    if (rollingBack) return;

    setRollingBack(true);
    setRollbackResult("");

    try {
      const res = await fetch("/api/rollback", {
        method: "POST",
      });

      const data = await res.json();

      if (data.ok) {
        setRollbackResult(`Restored: ${data.restored.join(", ")}`);
      } else {
        setRollbackResult(data.error || "Rollback failed");
      }
    } catch {
      setRollbackResult("Rollback request failed");
    } finally {
      setRollingBack(false);
    }
  }

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || uploadingAttachment) return;

    setAttachmentError("");
    setUploadingAttachment(true);

    const previewUrl = URL.createObjectURL(selectedFile);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data?.upload) {
        throw new Error(data?.error || "Upload failed");
      }

      setPendingAttachment((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }

        return {
          id: data.upload.id,
          filename: data.upload.filename,
          originalName: data.upload.originalName,
          mimeType: data.upload.mimeType,
          size: data.upload.size,
          previewUrl,
        };
      });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setAttachmentError(error instanceof Error ? error.message : "Upload failed");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || loading) return;

    const safeAttachment = pendingAttachment
      ? {
          id: pendingAttachment.id,
          filename: pendingAttachment.filename,
          originalName: pendingAttachment.originalName,
          mimeType: pendingAttachment.mimeType,
          size: pendingAttachment.size,
        }
      : undefined;

    const userMessage: Message = {
      role: "user",
      content: message,
      ...(safeAttachment ? { attachment: safeAttachment } : {}),
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setMessage("");
    setLoading(true);
    setCollabReply(null);
    setBuilderProposal(null);
    setReviewResult(null);
    setApplyResult("");
    setRollbackResult("");
    setAttachmentError("");
    clearPendingAttachment();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          history: messages,
          mode,
          replyStyle,
          repoFiles,
          attachment: safeAttachment,
        }),
      });

      const data = await res.json();

      if (mode === "collaborate") {
        setCollabReply(data);
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.final || data.error || "No response",
          },
        ]);
      } else if (mode === "builder") {
        setBuilderProposal(data.proposal || null);
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.reply || data.error || "No response",
          },
        ]);

        if (data.proposal?.actions?.length) {
          await reviewProposal(data.proposal);
        }
      } else {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.reply || data.error || "No response",
          },
        ]);
      }
    } catch {
      const fail = "Request failed";
      if (mode === "collaborate") setCollabReply({ error: fail });
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: fail,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const canApply =
    !!builderProposal?.actions?.length &&
    reviewResult?.verdict !== "reject" &&
    !applying;

  return (
    <main className="min-h-screen bg-[#07070b] text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[#0b0b12] via-[#11111a] to-[#171124] p-6 md:p-8 shadow-[0_0_80px_rgba(139,92,246,0.12)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-violet-200">
                Telegram-first • Crypto-native • AI operator
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">BriefLock</h1>
                <p className="max-w-2xl text-base text-violet-100/80 md:text-lg">
                  Telegram-first AI execution manager for crypto product ideas
                </p>
              </div>
              <p className="max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">
                Turn messy founder input into a locked brief, a realistic MVP scope, a practical execution plan, and a verifier-ready result.
              </p>
            </div>

            <div className="min-w-[280px] rounded-2xl border border-violet-400/20 bg-black/30 p-4 backdrop-blur-sm">
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.22em] text-violet-200/80">
                Core flow
              </div>
              <div className="text-sm leading-7 text-neutral-200">
                vague request → locked brief → MVP scope → execution plan → verification
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-[#0d0d14] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-violet-200/70">Input</div>
            <div className="mt-2 text-sm text-neutral-300">A vague crypto product idea, messy request, or raw founder thought.</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-[#0d0d14] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-violet-200/70">Orchestration</div>
            <div className="mt-2 text-sm text-neutral-300">Strategist, coder, and verifier-style reasoning aligned into one execution path.</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-[#0d0d14] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-violet-200/70">Output</div>
            <div className="mt-2 text-sm text-neutral-300">A brief you can act on, cut list, next action, and a stronger demo story for judges.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-sm text-neutral-400">Project Memory</div>
            <div className="text-sm text-neutral-500">
              Save only the facts BriefLock should keep using across future responses: ICP, offer, pricing, constraints, current build status, and what is out of scope.
            </div>
          </div>
          <textarea
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            placeholder="Example:\n- ICP: crypto founders launching Telegram-first products\n- Offer: locked brief + MVP scope + execution plan\n- Pricing: free teaser, paid execution pack\n- Current MVP: no screenshot analysis, no autonomous execution\n- Payment: manual ETH / stable verification"
            className="w-full min-h-[160px] rounded-xl bg-neutral-900 border border-neutral-700 p-4 outline-none"
          />
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={saveMemory}
              disabled={savingMemory}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
            >
              {savingMemory ? "Saving..." : "Save Project Memory"}
            </button>

            <button
              type="button"
              onClick={summarizeChatToMemory}
              disabled={summarizing || messages.length === 0}
              className="rounded-xl bg-neutral-900 border border-neutral-700 text-white px-4 py-2 font-semibold disabled:opacity-50"
            >
              {summarizing ? "Summarizing..." : "Summarize Current Chat"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4">
          <div className="text-sm text-neutral-400">Repo File Context</div>
          <textarea
            value={repoPaths}
            onChange={(e) => setRepoPaths(e.target.value)}
            placeholder="One file path per line..."
            className="w-full min-h-[120px] rounded-xl bg-neutral-900 border border-neutral-700 p-4 outline-none"
          />
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={loadRepoFiles}
              disabled={loadingRepo}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
            >
              {loadingRepo ? "Loading files..." : "Load Repo Files"}
            </button>
            {repoStatus && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-2 text-sm">
                {repoStatus}
              </div>
            )}
          </div>

          {!!repoFiles.length && (
            <div className="space-y-3">
              {repoFiles.map((file, index) => (
                <div key={`${file.path}-${index}`} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-sm text-neutral-400 mb-2">{file.path}</div>
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">
                    {file.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-300">
          You are talking to one unified BriefLock agent. Internal specialist discussion stays hidden unless you explicitly open it.
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 h-[420px] overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-neutral-500">
              Start the conversation with your agent...
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`rounded-xl p-4 whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-neutral-800"
                    : "bg-neutral-900 border border-neutral-700"
                }`}
              >
                <div className="text-sm text-neutral-400 mb-2">
                  {msg.role === "user" ? "You" : "Agent"}
                </div>
                <div>{msg.content}</div>
                {msg.attachment && (
                  <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm text-neutral-300">
                    <div className="font-medium text-white">Attachment</div>
                    <div>{msg.attachment.originalName}</div>
                    <div className="text-neutral-400">{msg.attachment.mimeType} · {Math.round(msg.attachment.size / 1024)} KB</div>
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="rounded-xl p-4 bg-neutral-900 border border-neutral-700 text-neutral-400">
              Agent is thinking...
            </div>
          )}
        </div>

        {mode === "builder" && builderProposal && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4">
            <div>
              <div className="text-sm text-neutral-400 mb-2">Builder Proposal Summary</div>
              <div className="whitespace-pre-wrap">{builderProposal.summary || "No summary"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-400 mb-2">Files</div>
              <div className="space-y-2">
                {(builderProposal.actions || []).map((action, i) => (
                  <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2">
                    {action.path}
                  </div>
                ))}
              </div>
            </div>

            {!!builderProposal.notes?.length && (
              <div>
                <div className="text-sm text-neutral-400 mb-2">Builder Notes</div>
                <ul className="list-disc pl-5 space-y-1">
                  {builderProposal.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {reviewResult && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
                <div className="text-sm text-neutral-400">Reviewer Verdict</div>
                <div className="font-semibold">
                  {reviewResult.verdict || "unknown"}
                </div>
                <div className="whitespace-pre-wrap">
                  {reviewResult.summary || "No review summary"}
                </div>

                {!!reviewResult.risks?.length && (
                  <ul className="list-disc pl-5 space-y-1">
                    {reviewResult.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={applyProposal}
                disabled={!canApply}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply Proposal"}
              </button>

              <button
                type="button"
                onClick={rollbackLastApply}
                disabled={rollingBack}
                className="rounded-xl bg-neutral-900 border border-neutral-700 text-white px-4 py-2 font-semibold disabled:opacity-50"
              >
                {rollingBack ? "Rolling back..." : "Rollback Last Apply"}
              </button>
            </div>

            {applyResult && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3 whitespace-pre-wrap">
                {applyResult}
              </div>
            )}

            {rollbackResult && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3 whitespace-pre-wrap">
                {rollbackResult}
              </div>
            )}
          </div>
        )}

        <details className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-violet-200">
            View internal agent discussion
          </summary>
          <div className="mt-4 space-y-3">
            {!collabReply && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
                Internal discussion will appear here after BriefLock processes your request.
              </div>
            )}

            {collabReply && (
              <div className="space-y-3">
                {(collabReply.internalDiscussion && collabReply.internalDiscussion.length > 0
                  ? collabReply.internalDiscussion
                  : [
                      collabReply.strategist
                        ? { role: "Strategist" as const, content: collabReply.strategist }
                        : null,
                      collabReply.builder
                        ? { role: "Builder" as const, content: collabReply.builder }
                        : null,
                      collabReply.coder
                        ? { role: "Coder" as const, content: collabReply.coder }
                        : null,
                      collabReply.verifier
                        ? { role: "Verifier" as const, content: collabReply.verifier }
                        : null,
                    ].filter(Boolean) as InternalDiscussionMessage[]
                ).map((item, index) => (
                  <div key={`${item.role}-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-violet-200/70">{item.role}</div>
                    <div className="whitespace-pre-wrap text-sm text-neutral-200">{item.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        <form onSubmit={handleSubmit} className="space-y-4">
          {pendingAttachment && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <img
                    src={pendingAttachment.previewUrl}
                    alt={pendingAttachment.originalName}
                    className="h-16 w-16 rounded-lg object-cover border border-neutral-700"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-white">{pendingAttachment.originalName}</div>
                    <div className="text-neutral-400">
                      {pendingAttachment.mimeType} · {Math.round(pendingAttachment.size / 1024)} KB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearPendingAttachment}
                  className="rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write in English or Russian..."
            className="w-full min-h-[140px] rounded-xl bg-neutral-900 border border-neutral-700 p-4 outline-none"
          />
          <div className="flex gap-3 flex-wrap items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAttachmentChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAttachment || loading}
              className="rounded-xl bg-neutral-900 border border-neutral-700 text-white px-4 py-2 font-semibold disabled:opacity-50"
            >
              {uploadingAttachment ? "Uploading..." : "Attach Screenshot"}
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="rounded-xl bg-white text-black px-5 py-3 font-semibold disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {attachmentError && (
            <div className="text-sm text-red-400">{attachmentError}</div>
          )}
        </form>
      </div>
    </main>
  );
}
