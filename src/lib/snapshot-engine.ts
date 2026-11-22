import {
  readDriveData,
  readGithubData,
  readGmailData,
  readLocalFolderData,
  readOutlookData,
  verifyAllConnections,
} from "./connectors";
import { getSandboxTimeline } from "./sandbox-data";
import { readStore, writeStore } from "./store";
import type {
  AppSettings,
  EmailSignal,
  FileInventoryItem,
  LlmProvider,
  ProjectItem,
  ProviderId,
  SnapshotDiff,
  SnapshotRecord,
  TimelineEvent,
  VerificationReceiptEntry,
} from "./types";

function buildDeterministicSummary(
  projects: ProjectItem[],
  emails: EmailSignal[],
  files: FileInventoryItem[],
  receipt: VerificationReceiptEntry[]
): string {
  const verifiedLive = receipt.filter((r) => r.status === "verified").length;
  const sandboxCount = receipt.filter((r) => r.status === "sandbox").length;
  const deployments = emails.filter((e) => e.category === "deployment").length;
  const builds = emails.filter((e) => e.category === "build").length;
  const stacks = Array.from(
    new Set(projects.flatMap((p) => p.techStack))
  ).slice(0, 6);

  return [
    `Indexed ${projects.length} active build(s) across ${
      stacks.length > 0 ? stacks.join(", ") : "your connected workspaces"
    }.`,
    `Captured ${emails.length} authorized email signal(s) (${deployments} deployment, ${builds} build/CI) and ${files.length} authorized file/folder entries.`,
    `Permission check: ${verifiedLive} live-verified source(s), ${sandboxCount} sandbox source(s).`,
  ].join(" ");
}

async function generateOptionalLlmSummary(
  settings: AppSettings,
  deterministicFallback: string,
  projects: ProjectItem[],
  emails: EmailSignal[],
  files: FileInventoryItem[]
): Promise<{ text: string; method: "deterministic" | LlmProvider }> {
  if (settings.llmProvider === "none" || !settings.llmApiKey) {
    return { text: deterministicFallback, method: "deterministic" };
  }

  const prompt = [
    "You are an editorial technical chief of staff. Write a crisp 3-sentence executive snapshot of what the user has built so far.",
    `Projects (${projects.length}): ${projects
      .slice(0, 8)
      .map((p) => `${p.name} [${p.techStack.join("/")}] - ${p.description}`)
      .join("; ")}`,
    `Recent Email Signals (${emails.length}): ${emails
      .slice(0, 6)
      .map((e) => `${e.provider}: ${e.subject}`)
      .join("; ")}`,
    `Authorized Files/Folders (${files.length}): ${files
      .slice(0, 8)
      .map((f) => f.name)
      .join(", ")}`,
  ].join("\n");

  try {
    if (settings.llmProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.llmApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 220,
          temperature: 0.3,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return { text: content, method: "openai" };
      }
    } else if (settings.llmProvider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.llmApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 220,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          content?: { text?: string }[];
        };
        const content = data.content?.[0]?.text?.trim();
        if (content) return { text: content, method: "anthropic" };
      }
    } else if (settings.llmProvider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
          settings.llmApiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const content =
          data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (content) return { text: content, method: "gemini" };
      }
    }
  } catch {
    // Fallback cleanly to deterministic summary
  }

  return { text: deterministicFallback, method: "deterministic" };
}

function computeDiff(
  previous: SnapshotRecord | undefined,
  projects: ProjectItem[],
  emails: EmailSignal[],
  files: FileInventoryItem[]
): SnapshotDiff | null {
  if (!previous) return null;

  const prevProjectNames = new Set(previous.projects.map((p) => p.name));
  const prevEmailIds = new Set(previous.emailSignals.map((e) => e.id));
  const prevFileIds = new Set(previous.fileInventory.map((f) => f.id));

  const newProjects = projects.filter((p) => !prevProjectNames.has(p.name));
  const newEmails = emails.filter((e) => !prevEmailIds.has(e.id));
  const newFiles = files.filter((f) => !prevFileIds.has(f.id));

  const bullets: string[] = [];
  if (newProjects.length > 0) {
    bullets.push(
      `+${newProjects.length} new project(s): ${newProjects
        .map((p) => p.name)
        .slice(0, 3)
        .join(", ")}`
    );
  }
  if (newEmails.length > 0) {
    bullets.push(`+${newEmails.length} new authorized email signal(s)`);
  }
  if (newFiles.length > 0) {
    bullets.push(`+${newFiles.length} newly indexed file/folder item(s)`);
  }
  if (bullets.length === 0) {
    bullets.push(
      `No structural delta since Snapshot #${String(
        previous.indexNumber
      ).padStart(2, "0")}; all permissions re-verified.`
    );
  }

  return {
    previousSnapshotId: previous.id,
    previousIndexNumber: previous.indexNumber,
    summaryBullets: bullets,
    newProjectsCount: newProjects.length,
    newEmailsCount: newEmails.length,
    newFilesCount: newFiles.length,
  };
}

export async function generateSnapshot(): Promise<SnapshotRecord> {
  const store = readStore();
  const verifiedConnections = await verifyAllConnections(store);
  store.connections = verifiedConnections;

  const [gmailEmails, outlookEmails, driveFiles, githubProjects] =
    await Promise.all([
      readGmailData(verifiedConnections.gmail),
      readOutlookData(verifiedConnections.outlook),
      readDriveData(verifiedConnections.gdrive),
      readGithubData(verifiedConnections.github, store.settings),
    ]);

  const localData = readLocalFolderData(verifiedConnections.local_fs, store);

  const projects: ProjectItem[] = [...githubProjects, ...localData.projects];
  const emailSignals: EmailSignal[] = [...gmailEmails, ...outlookEmails].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const fileInventory: FileInventoryItem[] = [
    ...driveFiles,
    ...localData.files,
  ].sort(
    (a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  );

  // Build unified timeline
  const timelineEvents: TimelineEvent[] = [];
  const allSandbox = (Object.keys(verifiedConnections) as ProviderId[]).every(
    (k) => verifiedConnections[k].mode === "sandbox"
  );

  if (allSandbox) {
    timelineEvents.push(...getSandboxTimeline());
  } else {
    for (const email of emailSignals.slice(0, 6)) {
      timelineEvents.push({
        id: `tl-${email.id}`,
        date: email.date.slice(0, 10),
        source: email.provider,
        title: email.subject,
        detail: `From ${email.from}`,
      });
    }
    for (const proj of projects.slice(0, 6)) {
      timelineEvents.push({
        id: `tl-${proj.id}`,
        date: proj.lastActivityAt.slice(0, 10),
        source: proj.source,
        title: `Updated ${proj.name}`,
        detail: proj.metricsLabel || proj.techStack.join(", "),
      });
    }
    for (const file of fileInventory.slice(0, 4)) {
      timelineEvents.push({
        id: `tl-${file.id}`,
        date: file.modifiedAt.slice(0, 10),
        source: file.source,
        title: `Modified ${file.name}`,
        detail: file.path,
      });
    }
    timelineEvents.sort((a, b) => b.date.localeCompare(a.date));
  }

  const verificationReceipt: VerificationReceiptEntry[] = (
    Object.keys(verifiedConnections) as ProviderId[]
  ).map((id) => {
    const conn = verifiedConnections[id];
    return {
      provider: id,
      label: conn.label,
      status: conn.status,
      mode: conn.mode,
      account: conn.accountIdentifier,
      scopes: conn.grantedScopes,
      checkedAt: conn.lastVerifiedAt ?? new Date().toISOString(),
      detail: conn.verificationDetail ?? "",
    };
  });

  const liveCount = verificationReceipt.filter(
    (r) => r.mode === "live" && r.status === "verified"
  ).length;
  const modeLabel: SnapshotRecord["modeLabel"] =
    liveCount === verificationReceipt.length
      ? "LIVE VERIFIED"
      : liveCount > 0
      ? "HYBRID (LIVE + SANDBOX)"
      : "SANDBOX DEMO";

  const deterministicText = buildDeterministicSummary(
    projects,
    emailSignals,
    fileInventory,
    verificationReceipt
  );

  const summaryResult = await generateOptionalLlmSummary(
    store.settings,
    deterministicText,
    projects,
    emailSignals,
    fileInventory
  );

  const previous = store.snapshots[0];
  const nextIndex = previous ? previous.indexNumber + 1 : 1;

  const snapshot: SnapshotRecord = {
    id: `snap-${Date.now()}`,
    indexNumber: nextIndex,
    createdAt: new Date().toISOString(),
    title: `BUILD SNAPSHOT // #${String(nextIndex).padStart(2, "0")}`,
    modeLabel,
    synthesisMethod:
      summaryResult.method === "none" ? "deterministic" : summaryResult.method,
    executiveSummary: summaryResult.text,
    projects,
    timeline: timelineEvents.slice(0, 12),
    emailSignals,
    fileInventory,
    verificationReceipt,
    diffFromPrevious: computeDiff(previous, projects, emailSignals, fileInventory),
  };

  store.snapshots = [snapshot, ...store.snapshots].slice(0, 25);
  writeStore(store);

  return snapshot;
}
