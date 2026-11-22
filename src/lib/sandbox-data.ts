import type {
  EmailSignal,
  FileInventoryItem,
  ProjectItem,
  TimelineEvent,
} from "./types";

export function getSandboxGmailSignals(): EmailSignal[] {
  return [
    {
      id: "sb-gm-1",
      provider: "gmail",
      subject: "[Vercel] Production deployment succeeded — core-api-v2",
      from: "notifications@vercel.com",
      date: "2026-11-21T18:40:00Z",
      category: "deployment",
      snippet:
        "Deployment dpl_9x81a is live at core-api-v2.vercel.app (build time 34s).",
    },
    {
      id: "sb-gm-2",
      provider: "gmail",
      subject: "Stripe Webhook Secret rotated for Billing Engine",
      from: "security@stripe.com",
      date: "2026-11-19T14:12:00Z",
      category: "security",
      snippet:
        "Live webhook endpoint whsec_...88a1 updated with zero failed deliveries.",
    },
    {
      id: "sb-gm-3",
      provider: "gmail",
      subject: "Re: Design System v3 Typography & Grid Spec",
      from: "maya.lin@studio.design",
      date: "2026-11-18T09:30:00Z",
      category: "thread",
      snippet:
        "Approved the 12-column Swiss editorial grid and oversized Space Grotesk headings.",
    },
  ];
}

export function getSandboxOutlookSignals(): EmailSignal[] {
  return [
    {
      id: "sb-ol-1",
      provider: "outlook",
      subject: "Azure Container Apps: Build pipeline #412 passed",
      from: "azure-pipelines@microsoft.com",
      date: "2026-11-20T21:05:00Z",
      category: "build",
      snippet:
        "Image ledger-worker:2026.11.20 pushed to registry; 48/48 integration tests green.",
    },
    {
      id: "sb-ol-2",
      provider: "outlook",
      subject: "Monthly Cloud Infrastructure Invoice — $142.80",
      from: "billing@cloud.example.com",
      date: "2026-11-15T08:00:00Z",
      category: "billing",
      snippet:
        "Compute & managed Postgres usage within 78% of monthly budget.",
    },
  ];
}

export function getSandboxDriveFiles(): FileInventoryItem[] {
  return [
    {
      id: "sb-gd-1",
      source: "gdrive",
      name: "Architecture-RFC-2026.md",
      path: "Builds & Specs (Demo) / Architecture-RFC-2026.md",
      kind: "file",
      modifiedAt: "2026-11-20T16:22:00Z",
      sizeLabel: "24 KB",
    },
    {
      id: "sb-gd-2",
      source: "gdrive",
      name: "Q4-Launch-Checklist.xlsx",
      path: "Builds & Specs (Demo) / Q4-Launch-Checklist.xlsx",
      kind: "file",
      modifiedAt: "2026-11-18T11:15:00Z",
      sizeLabel: "88 KB",
    },
    {
      id: "sb-gd-3",
      source: "gdrive",
      name: "Brand-Typography-Guidelines.pdf",
      path: "Builds & Specs (Demo) / Brand-Typography-Guidelines.pdf",
      kind: "file",
      modifiedAt: "2026-11-12T10:00:00Z",
      sizeLabel: "3.4 MB",
    },
  ];
}

export function getSandboxLocalFiles(): FileInventoryItem[] {
  return [
    {
      id: "sb-loc-1",
      source: "local_fs",
      name: "core-api-v2",
      path: "~/projects/core-api-v2",
      kind: "folder",
      modifiedAt: "2026-11-21T18:35:00Z",
      detectedStack: ["TypeScript", "Next.js", "PostgreSQL"],
    },
    {
      id: "sb-loc-2",
      source: "local_fs",
      name: "ledger-worker",
      path: "~/projects/ledger-worker",
      kind: "folder",
      modifiedAt: "2026-11-20T20:50:00Z",
      detectedStack: ["Rust", "Tokio", "Docker"],
    },
  ];
}

export function getSandboxGithubProjects(): ProjectItem[] {
  return [
    {
      id: "sb-gh-1",
      name: "core-api-v2",
      source: "github",
      description:
        "Primary API gateway and webhook orchestrator powering billing and auth.",
      techStack: ["TypeScript", "Node.js", "Next.js", "PostgreSQL"],
      status: "shipped",
      lastActivityAt: "2026-11-21T18:40:00Z",
      url: "https://github.com/demo-builder/core-api-v2",
      metricsLabel: "142 commits · 18 stars",
    },
    {
      id: "sb-gh-2",
      name: "ledger-worker",
      source: "github",
      description:
        "High-throughput async event processor with idempotent audit logging.",
      techStack: ["Rust", "Docker", "Azure"],
      status: "active",
      lastActivityAt: "2026-11-20T21:05:00Z",
      url: "https://github.com/demo-builder/ledger-worker",
      metricsLabel: "89 commits · 48 tests",
    },
    {
      id: "sb-gh-3",
      name: "swiss-ui-kit",
      source: "github",
      description:
        "Minimalist editorial component primitives with strict grid & typographic scale.",
      techStack: ["React", "CSS", "TypeScript"],
      status: "active",
      lastActivityAt: "2026-11-18T09:30:00Z",
      url: "https://github.com/demo-builder/swiss-ui-kit",
      metricsLabel: "54 commits · 31 stars",
    },
  ];
}

export function getSandboxTimeline(): TimelineEvent[] {
  return [
    {
      id: "sb-tl-1",
      date: "2026-11-21",
      source: "gmail",
      title: "Production deployment succeeded — core-api-v2",
      detail: "Verified via Vercel notification in Gmail.",
    },
    {
      id: "sb-tl-2",
      date: "2026-11-20",
      source: "outlook",
      title: "Azure pipeline #412 green for ledger-worker",
      detail: "48/48 integration tests passed and container image published.",
    },
    {
      id: "sb-tl-3",
      date: "2026-11-20",
      source: "gdrive",
      title: "Updated Architecture-RFC-2026.md",
      detail: "Modified in authorized Drive folder 'Builds & Specs (Demo)'.",
    },
    {
      id: "sb-tl-4",
      date: "2026-11-18",
      source: "github",
      title: "swiss-ui-kit v0.4 typographic grid milestone",
      detail: "Synced with Design System v3 thread in Gmail.",
    },
  ];
}
