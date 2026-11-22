import type { SnapshotRecord } from "./types";

export function snapshotToMarkdown(snap: SnapshotRecord): string {
  const lines: string[] = [
    `# ${snap.title}`,
    "",
    `- **Generated:** ${new Date(snap.createdAt).toLocaleString()}`,
    `- **Mode:** ${snap.modeLabel}`,
    `- **Synthesis:** ${snap.synthesisMethod.toUpperCase()}`,
    "",
    "## 01 / Executive Summary",
    "",
    snap.executiveSummary,
    "",
  ];

  if (snap.diffFromPrevious) {
    lines.push(
      `### Delta Since Snapshot #${String(
        snap.diffFromPrevious.previousIndexNumber
      ).padStart(2, "0")}`
    );
    snap.diffFromPrevious.summaryBullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  }

  lines.push("## 02 / Project Inventory", "");
  snap.projects.forEach((p) => {
    lines.push(
      `### ${p.name} (${p.status.toUpperCase()}) — \`${p.source}\``
    );
    lines.push(`${p.description}`);
    lines.push(`- **Stack:** ${p.techStack.join(", ")}`);
    if (p.metricsLabel) lines.push(`- **Metrics:** ${p.metricsLabel}`);
    if (p.url) lines.push(`- **URL:** ${p.url}`);
    lines.push("");
  });

  lines.push("## 03 / Chronological Timeline", "");
  snap.timeline.forEach((t) => {
    lines.push(`- **${t.date}** [${t.source.toUpperCase()}] **${t.title}** — ${t.detail}`);
  });
  lines.push("");

  lines.push("## 04 / Authorized Email Signals", "");
  snap.emailSignals.forEach((e) => {
    lines.push(
      `- [${e.provider.toUpperCase()} / ${e.category.toUpperCase()}] **${e.subject}** (${e.from}, ${e.date.slice(0, 10)})`
    );
  });
  lines.push("");

  lines.push("## 05 / Authorized Files & Folders", "");
  snap.fileInventory.forEach((f) => {
    lines.push(`- [${f.source.toUpperCase()}] \`${f.path}\` (${f.kind})`);
  });
  lines.push("");

  lines.push("## 06 / Permission Verification Receipt", "");
  snap.verificationReceipt.forEach((r) => {
    lines.push(
      `- **${r.label}**: \`${r.status.toUpperCase()}\` (${r.mode}) — ${r.account} — Scopes: ${r.scopes.join(", ")}`
    );
  });

  return lines.join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
