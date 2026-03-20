import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const memoryPath = path.join(process.cwd(), "data", "memory.json");
const uploadsDir = path.join(process.cwd(), "data", "uploads");

type RepoFile = {
  path: string;
  content: string;
};

type AttachmentMeta = {
  id?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
};

type HistoryMessage = {
  role: string;
  content: string;
  attachments?: AttachmentMeta[];
  attachment?: AttachmentMeta;
};

type OpenAIInputItem =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
    };

type ResponseCreateInput = NonNullable<
  Parameters<typeof client.responses.create>[0]["input"]
>;

async function createModelResponse(model: string, input: ResponseCreateInput) {
  return client.responses.create({ model, input });
}

async function getProjectMemory() {
  try {
    const raw = await fs.readFile(memoryPath, "utf-8");
    const data = JSON.parse(raw);
    return data.memory || "";
  } catch {
    return "";
  }
}

function buildRepoContext(repoFiles: RepoFile[]) {
  if (!repoFiles.length) return "";

  return repoFiles
    .map((file) => `FILE: ${file.path}\n-----\n${file.content}\n-----`)
    .join("\n\n");
}

function normalizeAttachments(
  attachments?: AttachmentMeta[],
  attachment?: AttachmentMeta | null
): AttachmentMeta[] {
  const list = Array.isArray(attachments) ? [...attachments] : [];

  if (attachment) {
    list.push(attachment);
  }

  return list.filter(Boolean);
}

function formatAttachments(attachments?: AttachmentMeta[]) {
  if (!attachments?.length) return "";

  const lines = attachments.map((a, i) => {
    const name = a.originalName || a.filename || "unknown-file";
    const mime = a.mimeType || "unknown-type";
    const size = typeof a.size === "number" ? `${a.size} bytes` : "unknown-size";
    const id = a.id || "no-id";
    return `${i + 1}. ${name} | ${mime} | ${size} | id=${id}`;
  });

  return `\nAttached files:\n${lines.join("\n")}`;
}

function mapHistoryWithAttachments(history: HistoryMessage[]) {
  return history.map((msg) => ({
    role: msg.role,
    content: `${msg.content || ""}${formatAttachments(
      normalizeAttachments(msg.attachments, msg.attachment)
    )}`,
  }));
}

function getSystemPrompt(
  mode: string,
  replyStyle: string,
  projectMemory: string,
  repoFiles: RepoFile[]
) {
  const memoryBlock = projectMemory
    ? `\n\nProject memory:\n${projectMemory}\n\nUse this memory as project context.`
    : "";

  const repoContext = buildRepoContext(repoFiles);
  const repoBlock = repoContext
    ? `\n\nLoaded repo files:\n${repoContext}\n\nUse these real files as the source of truth. Do not invent contracts or file structure when repo context is provided.`
    : "";

  const brevity =
    replyStyle === "short"
      ? "Be brief. Use at most 5 bullet points. No fluff."
      : "Be detailed, but still practical and structured.";

  if (mode === "builder") {
    return `You are our AI cofounder and implementation builder. Reply in the same language as the user.

Your job is to propose SAFE code/project changes.

For builder mode, you MUST return valid JSON only, with this exact shape:
{
  "summary": "short summary",
  "notes": ["note 1", "note 2"],
  "actions": [
    {
      "path": "src/app/example.tsx",
      "content": "FULL FILE CONTENT HERE"
    }
  ]
}

Rules:
- output JSON only
- no markdown fences
- no explanation outside JSON
- only include files that should be created or fully overwritten
- never use delete actions
- prefer small, safe changes
- if unsure, return fewer files, not more
- paths must be relative project paths
- include full file content for each file
- keep proposal practical and safe
- when loaded repo files are provided, use them as the source of truth
- do not invent API response fields if loaded repo files define them
- do not invent file structure if loaded repo files show the current structure

${brevity}${memoryBlock}${repoBlock}`;
  }

  if (mode === "coder") {
    return `You are our AI cofounder and senior engineer. Reply in the same language as the user. Focus on implementation, debugging, architecture, APIs, database design, and exact next steps. ${brevity}${memoryBlock}${repoBlock}`;
  }

  return `You are BriefLock, our Telegram-first AI execution manager for crypto product ideas. Reply in the same language as the user.

Your job is to turn a vague crypto product or business idea into a structured execution output.

You MUST return the final answer using these exact section headings and in this exact order:
1. Locked Brief
2. MVP Scope
3. Execution Plan
4. What We Cut
5. Risks / Unknowns
6. Next Action
7. Payment / ETH Step

Rules:
- keep the answer practical and decisive
- stay inside the crypto product / business plan vertical
- do not brainstorm broadly
- do not sound generic
- if details are missing, make the best reasonable assumptions and state them inside the sections
- each section must start with a markdown heading exactly matching the section name
- do not add any extra headings beyond those 7 sections
- use bullets under each section when useful

If project memory or repo files are provided, ground your answer in them.

${brevity}${memoryBlock}${repoBlock}`;
}

async function attachmentToInputItem(
  attachment: AttachmentMeta
): Promise<OpenAIInputItem | null> {
  const mimeType = attachment.mimeType || "";
  const filename = attachment.filename || "";

  if (!mimeType.startsWith("image/") || !filename) {
    return null;
  }

  const fullPath = path.join(uploadsDir, filename);

  try {
    const fileBuffer = await fs.readFile(fullPath);
    const base64 = fileBuffer.toString("base64");
    return {
      type: "input_image",
      image_url: `data:${mimeType};base64,${base64}`,
    };
  } catch {
    return null;
  }
}

async function buildUserInput(
  message: string,
  attachments: AttachmentMeta[]
): Promise<OpenAIInputItem[]> {
  const items: OpenAIInputItem[] = [
    {
      type: "input_text",
      text: `${message}${formatAttachments(attachments)}`,
    },
  ];

  for (const attachment of attachments) {
    const imageItem = await attachmentToInputItem(attachment);
    if (imageItem) {
      items.push(imageItem);
    }
  }

  return items;
}

function extractSection(text: string, heading: string, nextHeading?: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNext = nextHeading
    ? nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : null;

  const pattern = escapedNext
    ? new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)\\n## ${escapedNext}`)
    : new RegExp(`## ${escapedHeading}\\n([\\s\\S]*)$`);

  const match = text.match(pattern);
  return match?.[1]?.trim() || "";
}

function firstUsefulLine(section: string) {
  return (
    section
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .find(Boolean) || ""
  );
}

function buildInternalDiscussionFromFinal(finalText: string): {
  strategist: string;
  builder: string;
  coder: string;
  verifier: string;
  internalDiscussion: { role: string; content: string }[];
} {
  const lockedBrief = extractSection(finalText, "Locked Brief", "MVP Scope");
  const mvpScope = extractSection(finalText, "MVP Scope", "Execution Plan");
  const executionPlan = extractSection(finalText, "Execution Plan", "What We Cut");
  const whatWeCut = extractSection(finalText, "What We Cut", "Risks / Unknowns");
  const verifierResult = extractSection(finalText, "Verifier Result");

  const strategist =
    firstUsefulLine(lockedBrief) ||
    "Фокус: упаковать идею в понятный crypto MVP и объяснить, для кого он нужен.";
  const builder =
    [firstUsefulLine(mvpScope), firstUsefulLine(whatWeCut)].filter(Boolean).join(" | ") ||
    "MVP должен быть узким: что входит в демо, что режем, и в каком порядке это собираем.";
  const coder =
    firstUsefulLine(executionPlan) ||
    "Реалистично сейчас делать только Telegram-first flow без лишней onchain-автоматизации и без тяжёлых фич.";
  const verifier =
    firstUsefulLine(verifierResult) ||
    "Черновик годится, если есть чёткий ICP, граница MVP и честное объяснение, зачем тут crypto.";

  return {
    strategist,
    builder,
    coder,
    verifier,
    internalDiscussion: [
      { role: "Strategist", content: strategist },
      { role: "Builder", content: `Сужаю scope после стратегии: ${builder}` },
      { role: "Coder", content: `С технической стороны: ${coder}` },
      { role: "Verifier", content: `Критика: ${verifier}` },
    ],
  };
}

function enrichFinalResponse(finalText: string) {
  const paymentStep = extractSection(finalText, "Payment / ETH Step", "Verifier Result");
  const verifierResult = extractSection(finalText, "Verifier Result");
  const hasRecommendedTeam = /#{1,2} Recommended AI Team/.test(finalText);
  const hasBudgetRange = /#{1,2} Estimated Budget Range/.test(finalText);
  const hasExecutionReadiness = /#{1,2} Execution Readiness/.test(finalText);

  if (hasRecommendedTeam && hasBudgetRange && hasExecutionReadiness) {
    return finalText;
  }

  const onchainNeeded = /ETH|USDC|multisig|tx hash|onchain/i.test(paymentStep);
  const verdictMatch = verifierResult.match(/Final verdict:\s*(ACCEPT|REWORK)/i);
  const verdict = verdictMatch?.[1]?.toUpperCase() || "REWORK";

  const recommendedTeam = `# Recommended AI Team\n- Strategist — define positioning, ICP, and business logic. Priority: Must-have\n- Builder — lock MVP scope, sequencing, and what to cut. Priority: Must-have\n- Coder — translate the brief into a realistic implementation path. Priority: Must-have\n- Designer — tighten the user-facing demo flow if this moves beyond Telegram-only. Priority: Optional\n- Growth — turn the brief into an outreach and early-user test plan. Priority: Optional\n- Onchain Specialist — review payment flow and crypto assumptions before handoff. Priority: ${onchainNeeded ? "Must-have" : "Optional"}`;

  const budgetRange = `# Estimated Budget Range\n- Lean MVP: $1k–$3k if one founder + one technical operator execute a Telegram-first version with manual payment verification.\n- Faster MVP: $4k–$8k if you want cleaner delivery, faster bot/backend implementation, and tighter operator support.\n- What changes the budget: payment automation, custom UI, screenshot analysis, and how much human review you want in the loop.`;

  const executionReadiness = `# Execution Readiness\n- Scope locked: Yes\n- AI team defined: Yes\n- Budget range defined: Yes\n- Acceptance passed: ${verdict === "ACCEPT" ? "Yes" : "No"}\n- Payment ready: ${onchainNeeded ? "Yes" : "No"}`;

  if (/#{1,2} Verifier Result/.test(finalText)) {
    return finalText.replace(/\n#{1,2} Verifier Result/, `\n${recommendedTeam}\n\n${budgetRange}\n\n${executionReadiness}\n\n# Verifier Result`);
  }

  return `${finalText}\n\n${recommendedTeam}\n\n${budgetRange}\n\n${executionReadiness}`;
}

async function formatBriefLockResponse(rawText: string) {
  const formatterInput = [
    {
      role: "system",
      content: `You are formatting a BriefLock response for the crypto business plan / product brief vertical.

Rewrite the input into exactly these markdown sections and nothing else, in this exact order:
## Locked Brief
## MVP Scope
## Execution Plan
## What We Cut
## Risks / Unknowns
## Next Action
## Payment / ETH Step
## Verifier Result

The final Verifier Result section must use exactly this source of truth:

SCORING RUBRIC (score 1–5 each):
- Problem clarity
- ICP clarity
- Product/market fit logic
- Onchain necessity
- Feasibility in MVP
- Monetization realism
- Execution readiness

REJECT RULES:
- vague ICP
- fake onchain justification
- no MVP boundary
- no measurable outcome
- handwavy token utility
- impossible timeline

VERIFIER MUST CHECK:
1. are all required blocks present
2. is there enough specificity
3. is the document internally consistent
4. is there a real MVP boundary
5. is there a real reason for crypto/onchain
6. can execution start from this output
7. did it pass threshold score

Rules:
- no intro before the first heading
- no outro after the last section
- no extra headings
- no subsection headings
- stay in the same language as the input
- preserve the strongest useful content, but compress and normalize it if needed
- if a section is missing, infer the most reasonable concise content from the draft
- keep it practical and crypto-product focused
- avoid generic consultant language and repeated ideas
- make the MVP boundary explicit: what ships in the hackathon demo and what does not
- make Next Action immediately executable by a founder in the next 24 hours
- make Payment / ETH Step a lightweight trust/payment layer, not decorative crypto theater
- only justify crypto/onchain if there is a real reason; otherwise state the weakest point honestly
- in Verifier Result include all 7 rubric scores visibly
- in Verifier Result include Reject rules triggered or exactly 'none triggered'
- in Verifier Result include Final verdict: ACCEPT or REWORK`,
    },
    {
      role: "user",
      content: rawText,
    },
  ];

  const formatted = await createModelResponse(
    "gpt-5-mini",
    formatterInput as ResponseCreateInput
  );

  return formatted.output_text || rawText;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const message = body?.message;
    const history: HistoryMessage[] = Array.isArray(body?.history) ? body.history : [];
    const attachments = normalizeAttachments(
      Array.isArray(body?.attachments) ? body.attachments : [],
      body?.attachment || null
    );

    const requestedMode = body?.mode || "cofounder";
    const mode = requestedMode === "collaborate" ? "cofounder" : requestedMode;
    const replyStyle = body?.replyStyle || "short";
    const repoFiles: RepoFile[] = Array.isArray(body?.repoFiles) ? body.repoFiles : [];
    const projectMemory = await getProjectMemory();

    if (!message || typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const currentUserContent = await buildUserInput(message, attachments);

    if (mode === "cofounder") {
      const cofounderInput = [
        {
          role: "system",
          content: getSystemPrompt("cofounder", replyStyle, projectMemory, repoFiles),
        },
        ...mapHistoryWithAttachments(history),
        {
          role: "user",
          content: currentUserContent,
        },
      ];

      const cofounderResponse = await createModelResponse(
        "gpt-5-mini",
        cofounderInput as ResponseCreateInput
      );

      const finalText = enrichFinalResponse(cofounderResponse.output_text || "No response");
      const internalDiscussion = buildInternalDiscussionFromFinal(finalText);

      return Response.json({
        strategist: internalDiscussion.strategist,
        builder: internalDiscussion.builder,
        coder: internalDiscussion.coder,
        verifier: internalDiscussion.verifier,
        internalDiscussion: internalDiscussion.internalDiscussion,
        final: finalText,
        reply: finalText,
      });
    }

    const input = [
      {
        role: "system",
        content: getSystemPrompt(mode, replyStyle, projectMemory, repoFiles),
      },
      ...mapHistoryWithAttachments(history),
      {
        role: "user",
        content: currentUserContent,
      },
    ];

    const response = await createModelResponse(
      mode === "builder" ? "gpt-5.4" : "gpt-5-mini",
      input as ResponseCreateInput
    );

    const reply = response.output_text || "No response";

    if (mode === "builder") {
      try {
        const proposal = JSON.parse(reply);
        return Response.json({
          reply: proposal.summary || "Builder proposal ready",
          proposal,
        });
      } catch {
        return Response.json({
          reply,
          proposal: null,
        });
      }
    }

    return Response.json({ reply });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
