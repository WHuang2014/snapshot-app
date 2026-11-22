"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FolderOpen,
  Printer,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  pickAndScanLocalFolder,
  scanFileListFallback,
} from "@/lib/browser-fs";
import { downloadTextFile, snapshotToMarkdown } from "@/lib/export-utils";
import type {
  LlmProvider,
  ProviderId,
  SnapshotRecord,
  SourceConnection,
} from "@/lib/types";

type TabId = "snapshot" | "connections" | "setup";

interface SanitizedSettings {
  googleClientId: string;
  hasGoogleClientSecret: boolean;
  googleClientSecretMasked: string;
  microsoftClientId: string;
  hasMicrosoftClientSecret: boolean;
  microsoftClientSecretMasked: string;
  microsoftTenantId: string;
  hasGithubToken: boolean;
  githubTokenMasked: string;
  githubUsername: string;
  localAllowlistPaths: string[];
  llmProvider: LlmProvider;
  hasLlmApiKey: boolean;
  llmApiKeyMasked: string;
  sandboxEnabled: boolean;
}

interface StateResponse {
  settings: SanitizedSettings;
  connections: Record<
    ProviderId,
    Omit<SourceConnection, "accessToken" | "refreshToken">
  >;
  localScans: {
    folderName: string;
    scannedAt: string;
    fileCount: number;
    detectedStack: string[];
  }[];
  snapshots: SnapshotRecord[];
}

export default function SnapshotAppPage() {
  const [activeTab, setActiveTab] = useState<TabId>("snapshot");
  const [state, setState] = useState<StateResponse | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("http://localhost:3000");

  // Setup Wizard Form State
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");
  const [microsoftTenantId, setMicrosoftTenantId] = useState("common");
  const [githubUsername, setGithubUsername] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [localAllowlistText, setLocalAllowlistText] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("none");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [sandboxEnabled, setSandboxEnabled] = useState(true);

  // Google Drive folder picker state
  const [driveFolders, setDriveFolders] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedDriveFolderIds, setSelectedDriveFolderIds] = useState<
    string[]
  >([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const loadState = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as StateResponse;
    setState(data);
    setSelectedSnapshotId((prev) => prev ?? data.snapshots[0]?.id ?? null);

    setGoogleClientId(data.settings.googleClientId);
    setGoogleClientSecret(data.settings.googleClientSecretMasked);
    setMicrosoftClientId(data.settings.microsoftClientId);
    setMicrosoftClientSecret(data.settings.microsoftClientSecretMasked);
    setMicrosoftTenantId(data.settings.microsoftTenantId || "common");
    setGithubUsername(data.settings.githubUsername);
    setGithubToken(data.settings.githubTokenMasked);
    setLocalAllowlistText(data.settings.localAllowlistPaths.join("\n"));
    setLlmProvider(data.settings.llmProvider);
    setLlmApiKey(data.settings.llmApiKeyMasked);
    setSandboxEnabled(data.settings.sandboxEnabled);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as TabId | null;
    if (tabParam && ["snapshot", "connections", "setup"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    const oauthSuccess = params.get("oauthSuccess");
    const oauthError = params.get("oauthError");
    if (oauthSuccess) {
      setBanner(
        `Live OAuth verified for ${oauthSuccess.toUpperCase()} with read-only scope.`
      );
    } else if (oauthError) {
      setBanner(`OAuth notice: ${oauthError.replaceAll("_", " ")}`);
    }
    void loadState();
  }, [loadState]);

  const activeSnapshot = useMemo(() => {
    if (!state?.snapshots.length) return null;
    return (
      state.snapshots.find((s) => s.id === selectedSnapshotId) ??
      state.snapshots[0]
    );
  }, [state, selectedSnapshotId]);

  const handleGenerateSnapshot = async () => {
    setBusyAction("snapshot");
    setBanner(null);
    try {
      const res = await fetch("/api/snapshots", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { snapshot: SnapshotRecord };
        await loadState();
        setSelectedSnapshotId(data.snapshot.id);
        setActiveTab("snapshot");
        setBanner(
          `Generated ${data.snapshot.title} (${data.snapshot.modeLabel}).`
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifyAll = async () => {
    setBusyAction("verify");
    setBanner(null);
    try {
      const res = await fetch("/api/verify", { method: "POST" });
      if (res.ok) {
        await loadState();
        setBanner("Live permission verification completed across all sources.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("settings");
    setBanner(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleClientId,
          googleClientSecret,
          microsoftClientId,
          microsoftClientSecret,
          microsoftTenantId,
          githubUsername,
          githubToken,
          localAllowlistPaths: localAllowlistText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          llmProvider,
          llmApiKey,
          sandboxEnabled,
        }),
      });
      if (res.ok) {
        await handleVerifyAll();
        setBanner("Configuration saved & connections re-verified.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handlePickLocalFolder = async () => {
    setBusyAction("local_fs");
    try {
      const scan = await pickAndScanLocalFolder();
      if (!scan) {
        fallbackInputRef.current?.click();
        setBusyAction(null);
        return;
      }
      const res = await fetch("/api/local-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scan),
      });
      if (res.ok) {
        await loadState();
        setBanner(
          `Authorized & indexed local folder "${scan.folderName}" (${scan.files.length} files).`
        );
      }
    } catch {
      // User cancelled picker
    } finally {
      setBusyAction(null);
    }
  };

  const handleFallbackFolderInput = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files) return;
    const scan = scanFileListFallback(files);
    if (!scan) return;
    const res = await fetch("/api/local-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scan),
    });
    if (res.ok) {
      await loadState();
      setBanner(
        `Authorized & indexed local folder "${scan.folderName}" (${scan.files.length} files).`
      );
    }
  };

  const handleOpenDrivePicker = async () => {
    setShowDrivePicker((v) => !v);
    const res = await fetch("/api/gdrive/folders");
    if (res.ok) {
      const data = (await res.json()) as {
        folders: { id: string; name: string }[];
        selectedIds: string[];
      };
      setDriveFolders(data.folders);
      setSelectedDriveFolderIds(data.selectedIds);
    }
  };

  const handleSaveDriveFolders = async () => {
    const selectedNames = driveFolders
      .filter((f) => selectedDriveFolderIds.includes(f.id))
      .map((f) => f.name);
    await fetch("/api/gdrive/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderIds: selectedDriveFolderIds,
        folderNames: selectedNames,
      }),
    });
    await loadState();
    setShowDrivePicker(false);
    setBanner(`Updated authorized Google Drive folders (${selectedNames.length}).`);
  };

  const handleDisconnect = async (provider: ProviderId) => {
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    await loadState();
    setBanner(`Disconnected ${provider.toUpperCase()}.`);
  };

  const statusBadgeClass = (status: string) => {
    if (status === "verified") return "status-tag status-verified";
    if (status === "sandbox") return "status-tag status-sandbox";
    if (status === "expired") return "status-tag status-warn";
    if (status === "revoked") return "status-tag status-error";
    return "status-tag status-unconfigured";
  };

  const verifiedCount = state
    ? Object.values(state.connections).filter(
        (c) => c.status === "verified" || c.status === "sandbox"
      ).length
    : 0;

  return (
    <div className="shell">
      {/* Top Utility Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mark">
            <span className="brand-dot" />
            SNAPSHOT // INDEX
          </span>
          <span style={{ color: "var(--ink-secondary)" }}>
            READ-ONLY VERIFIED ARCHITECTURE
          </span>
        </div>

        <nav className="topbar-nav" aria-label="Primary navigation">
          <button
            id="tab-snapshot"
            type="button"
            className={`nav-tab ${activeTab === "snapshot" ? "active" : ""}`}
            onClick={() => setActiveTab("snapshot")}
          >
            01 // Snapshot
          </button>
          <button
            id="tab-connections"
            type="button"
            className={`nav-tab ${activeTab === "connections" ? "active" : ""}`}
            onClick={() => setActiveTab("connections")}
          >
            02 // Connections ({verifiedCount}/5)
          </button>
          <button
            id="tab-setup"
            type="button"
            className={`nav-tab ${activeTab === "setup" ? "active" : ""}`}
            onClick={() => setActiveTab("setup")}
          >
            03 // Setup Wizard
          </button>
        </nav>
      </header>

      {banner && (
        <div className="notice-bar no-print" style={{ marginTop: "1rem" }}>
          <span>{banner}</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setBanner(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: SNAPSHOT */}
      {activeTab === "snapshot" && (
        <main>
          <section className="masthead">
            <div>
              <div className="masthead-kicker">
                <span>
                  {activeSnapshot
                    ? `${activeSnapshot.title} · ${new Date(
                        activeSnapshot.createdAt
                      ).toLocaleString()}`
                    : "NO SNAPSHOT GENERATED YET"}
                </span>
                {activeSnapshot && (
                  <span
                    className={
                      activeSnapshot.modeLabel === "LIVE VERIFIED"
                        ? "status-tag status-verified"
                        : "status-tag status-sandbox"
                    }
                  >
                    {activeSnapshot.modeLabel}
                  </span>
                )}
              </div>
              <h1 className="masthead-title">
                WHAT WE
                <br />
                BUILT SO FAR.
              </h1>
            </div>

            <div className="masthead-actions no-print">
              <button
                id="btn-generate-snapshot"
                type="button"
                className="btn-primary"
                disabled={busyAction !== null}
                onClick={handleGenerateSnapshot}
              >
                <Sparkles size={16} />
                {busyAction === "snapshot"
                  ? "Generating Snapshot..."
                  : "Generate Snapshot"}
              </button>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  id="btn-verify-permissions"
                  type="button"
                  className="btn-secondary"
                  disabled={busyAction !== null}
                  onClick={handleVerifyAll}
                >
                  <ShieldCheck size={15} />
                  {busyAction === "verify"
                    ? "Verifying..."
                    : "Verify Permissions"}
                </button>

                {activeSnapshot && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        downloadTextFile(
                          `snapshot-${activeSnapshot.indexNumber}.md`,
                          snapshotToMarkdown(activeSnapshot),
                          "text/markdown"
                        )
                      }
                    >
                      <Download size={14} /> MD
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        downloadTextFile(
                          `snapshot-${activeSnapshot.indexNumber}.json`,
                          JSON.stringify(activeSnapshot, null, 2),
                          "application/json"
                        )
                      }
                    >
                      <Download size={14} /> JSON
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => window.print()}
                    >
                      <Printer size={14} /> PDF
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Snapshot History Switcher */}
          {state && state.snapshots.length > 0 && (
            <div className="history-strip no-print">
              {state.snapshots.map((snap) => (
                <button
                  key={snap.id}
                  type="button"
                  className={`history-pill ${
                    activeSnapshot?.id === snap.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedSnapshotId(snap.id)}
                >
                  <span>#{String(snap.indexNumber).padStart(2, "0")}</span>
                  <span>{new Date(snap.createdAt).toLocaleDateString()}</span>
                  <span>· {snap.projects.length} builds</span>
                </button>
              ))}
            </div>
          )}

          {!activeSnapshot ? (
            <section className="section-block">
              <div className="summary-grid">
                <div>
                  <p className="summary-lead">
                    Press <strong>Generate Snapshot</strong> above to verify all
                    authorized email &amp; folder permissions, index your
                    repositories and local workspaces, and produce an
                    auditable build snapshot.
                  </p>
                </div>
                <div className="diff-box">
                  <div className="diff-box-title">OUT-OF-THE-BOX READY</div>
                  <ul className="diff-list">
                    <li className="diff-item">
                      <span className="diff-marker">01</span>
                      <span>
                        Runs immediately in Sandbox Demo mode, or connect live
                        Gmail, Outlook, Google Drive, GitHub, and Local Folders.
                      </span>
                    </li>
                    <li className="diff-item">
                      <span className="diff-marker">02</span>
                      <span>
                        Strict read-only OAuth scopes verified live before
                        indexing.
                      </span>
                    </li>
                    <li className="diff-item">
                      <span className="diff-marker">03</span>
                      <span>
                        Exports cleanly to Markdown, JSON, or Printable PDF.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          ) : (
            <>
              {/* Big Bold KPI Strip */}
              <section className="kpi-strip">
                <div className="kpi-cell">
                  <span className="kpi-label">Projects Indexed</span>
                  <span className="kpi-number">
                    {String(activeSnapshot.projects.length).padStart(2, "0")}
                  </span>
                  <span className="kpi-sub">GitHub &amp; Local Builds</span>
                </div>
                <div className="kpi-cell">
                  <span className="kpi-label">Email Signals</span>
                  <span className="kpi-number">
                    {String(activeSnapshot.emailSignals.length).padStart(
                      2,
                      "0"
                    )}
                  </span>
                  <span className="kpi-sub">Gmail &amp; Outlook Read-Only</span>
                </div>
                <div className="kpi-cell">
                  <span className="kpi-label">Authorized Files</span>
                  <span className="kpi-number">
                    {String(activeSnapshot.fileInventory.length).padStart(
                      2,
                      "0"
                    )}
                  </span>
                  <span className="kpi-sub">Google Drive &amp; Local FS</span>
                </div>
                <div className="kpi-cell">
                  <span className="kpi-label">Verified Sources</span>
                  <span className="kpi-number">
                    {String(
                      activeSnapshot.verificationReceipt.filter(
                        (r) => r.status === "verified" || r.status === "sandbox"
                      ).length
                    ).padStart(2, "0")}
                  </span>
                  <span className="kpi-sub">
                    {
                      activeSnapshot.verificationReceipt.filter(
                        (r) => r.status === "verified"
                      ).length
                    }{" "}
                    Live ·{" "}
                    {
                      activeSnapshot.verificationReceipt.filter(
                        (r) => r.status === "sandbox"
                      ).length
                    }{" "}
                    Sandbox
                  </span>
                </div>
              </section>

              {/* 01 / Executive Summary & Diff */}
              <section className="section-block">
                <div className="section-header">
                  <div className="section-title-wrap">
                    <span className="section-num">01</span>
                    <h2 className="section-title">Executive Summary</h2>
                  </div>
                  <span className="mono-tag">
                    SYNTHESIS: {activeSnapshot.synthesisMethod.toUpperCase()}
                  </span>
                </div>

                <div className="summary-grid">
                  <p className="summary-lead">
                    {activeSnapshot.executiveSummary}
                  </p>

                  <div className="diff-box">
                    <div className="diff-box-title">
                      {activeSnapshot.diffFromPrevious
                        ? `DELTA SINCE SNAPSHOT #${String(
                            activeSnapshot.diffFromPrevious.previousIndexNumber
                          ).padStart(2, "0")}`
                        : "BASELINE SNAPSHOT"}
                    </div>
                    <ul className="diff-list">
                      {activeSnapshot.diffFromPrevious ? (
                        activeSnapshot.diffFromPrevious.summaryBullets.map(
                          (b, i) => (
                            <li key={i} className="diff-item">
                              <span className="diff-marker">+</span>
                              <span>{b}</span>
                            </li>
                          )
                        )
                      ) : (
                        <li className="diff-item">
                          <span className="diff-marker">00</span>
                          <span>
                            Initial baseline recorded. Generate a second
                            snapshot after new commits or emails to view deltas.
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </section>

              {/* 02 / Project Inventory */}
              <section className="section-block">
                <div className="section-header">
                  <div className="section-title-wrap">
                    <span className="section-num">02</span>
                    <h2 className="section-title">Project Inventory</h2>
                  </div>
                  <span className="mono-tag">
                    {activeSnapshot.projects.length} BUILDS
                  </span>
                </div>

                <div className="project-grid">
                  {activeSnapshot.projects.map((proj) => (
                    <article key={proj.id} className="project-card">
                      <div>
                        <div className="project-card-top">
                          <h3 className="project-name">{proj.name}</h3>
                          <span className="status-tag status-sandbox">
                            {proj.status}
                          </span>
                        </div>
                        <p className="project-desc">{proj.description}</p>
                      </div>

                      <div>
                        <div
                          className="tag-row"
                          style={{ marginBottom: "0.85rem" }}
                        >
                          {proj.techStack.map((tech) => (
                            <span key={tech} className="mono-tag">
                              {tech}
                            </span>
                          ))}
                        </div>

                        <div className="project-meta">
                          <span>{proj.metricsLabel || proj.source}</span>
                          {proj.url ? (
                            <a
                              href={proj.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                textDecoration: "underline",
                              }}
                            >
                              REPO <ArrowUpRight size={12} />
                            </a>
                          ) : (
                            <span>{proj.lastActivityAt.slice(0, 10)}</span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* 03 / Timeline & Live Signals */}
              <section className="section-block">
                <div className="two-col-split">
                  <div>
                    <div className="section-header">
                      <div className="section-title-wrap">
                        <span className="section-num">03</span>
                        <h2 className="section-title">Milestone Timeline</h2>
                      </div>
                    </div>

                    <div className="timeline-list">
                      {activeSnapshot.timeline.map((ev) => (
                        <div key={ev.id} className="timeline-row">
                          <span className="timeline-date">{ev.date}</span>
                          <div>
                            <div className="timeline-source">{ev.source}</div>
                            <div className="timeline-title">{ev.title}</div>
                            <div className="timeline-detail">{ev.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="section-header">
                      <div className="section-title-wrap">
                        <span className="section-num">04</span>
                        <h2 className="section-title">
                          Emails &amp; Files
                        </h2>
                      </div>
                    </div>

                    <div className="timeline-list">
                      {activeSnapshot.emailSignals.slice(0, 6).map((em) => (
                        <div key={em.id} className="timeline-row">
                          <span className="timeline-date">
                            {em.date.slice(0, 10)}
                          </span>
                          <div>
                            <div className="timeline-source">
                              {em.provider} · {em.category}
                            </div>
                            <div className="timeline-title">{em.subject}</div>
                            <div className="timeline-detail">{em.from}</div>
                          </div>
                        </div>
                      ))}

                      {activeSnapshot.fileInventory.slice(0, 6).map((fl) => (
                        <div key={fl.id} className="timeline-row">
                          <span className="timeline-date">
                            {fl.modifiedAt.slice(0, 10)}
                          </span>
                          <div>
                            <div className="timeline-source">
                              {fl.source} · {fl.kind}
                            </div>
                            <div className="timeline-title">{fl.name}</div>
                            <div className="timeline-detail">{fl.path}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* 05 / Permission Verification Receipt */}
              <section className="section-block" style={{ borderBottom: "none" }}>
                <div className="section-header">
                  <div className="section-title-wrap">
                    <span className="section-num">05</span>
                    <h2 className="section-title">
                      Permission Verification Receipt
                    </h2>
                  </div>
                  <span className="mono-tag">AUDIT TRAIL</span>
                </div>

                <div className="connections-grid">
                  {activeSnapshot.verificationReceipt.map((r) => (
                    <div key={r.provider} className="conn-card">
                      <div>
                        <div className="conn-header">
                          <div>
                            <div className="conn-title">{r.label}</div>
                            <div className="conn-account">{r.account}</div>
                          </div>
                          <span className={statusBadgeClass(r.status)}>
                            <CheckCircle2 size={12} /> {r.status}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--ink-secondary)",
                            marginTop: "0.75rem",
                          }}
                        >
                          {r.detail}
                        </p>
                      </div>

                      <div className="scope-list">
                        {r.scopes.map((sc) => (
                          <span key={sc} className="mono-tag">
                            {sc}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      )}

      {/* TAB 2: CONNECTIONS & LIVE PERMISSIONS */}
      {activeTab === "connections" && state && (
        <main>
          <section className="masthead">
            <div>
              <div className="masthead-kicker">
                <span>OAUTH 2.0 READ-ONLY SCOPES &amp; LOCAL HANDLES</span>
              </div>
              <h1 className="masthead-title">
                AUTHORIZED
                <br />
                SOURCES.
              </h1>
            </div>

            <div className="masthead-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busyAction !== null}
                onClick={handleVerifyAll}
              >
                <RefreshCw size={16} />
                {busyAction === "verify"
                  ? "Verifying Live..."
                  : "Verify All Permissions"}
              </button>
            </div>
          </section>

          <section className="section-block" style={{ borderBottom: "none" }}>
            <div className="connections-grid">
              {(Object.keys(state.connections) as ProviderId[]).map((id) => {
                const conn = state.connections[id];
                return (
                  <article key={id} className="conn-card">
                    <div>
                      <div className="conn-header">
                        <div>
                          <h2 className="conn-title">{conn.label}</h2>
                          <div className="conn-account">
                            {conn.accountIdentifier}
                          </div>
                        </div>
                        <span className={statusBadgeClass(conn.status)}>
                          {conn.status}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: "0.88rem",
                          color: "var(--ink-secondary)",
                          marginTop: "0.85rem",
                        }}
                      >
                        {conn.verificationDetail}
                      </p>

                      <div
                        className="scope-list"
                        style={{ marginTop: "0.9rem" }}
                      >
                        {conn.grantedScopes.map((sc) => (
                          <span key={sc} className="mono-tag">
                            {sc}
                          </span>
                        ))}
                      </div>

                      {conn.authorizedFolderNames &&
                        conn.authorizedFolderNames.length > 0 && (
                          <div
                            style={{
                              marginTop: "0.75rem",
                              fontFamily: "var(--font-code)",
                              fontSize: "0.72rem",
                              color: "var(--ink-secondary)",
                            }}
                          >
                            AUTHORIZED FOLDERS:{" "}
                            {conn.authorizedFolderNames.join(", ")}
                          </div>
                        )}
                    </div>

                    <div className="conn-footer">
                      {id === "gmail" && (
                        <a
                          href="/api/oauth/google/start?service=gmail"
                          className="btn-secondary"
                        >
                          Authorize Gmail OAuth
                        </a>
                      )}
                      {id === "gdrive" && (
                        <>
                          <a
                            href="/api/oauth/google/start?service=gdrive"
                            className="btn-secondary"
                          >
                            Authorize Drive OAuth
                          </a>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={handleOpenDrivePicker}
                          >
                            Pick Drive Folders
                          </button>
                        </>
                      )}
                      {id === "outlook" && (
                        <a
                          href="/api/oauth/microsoft/start"
                          className="btn-secondary"
                        >
                          Authorize Outlook OAuth
                        </a>
                      )}
                      {id === "github" && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setActiveTab("setup")}
                        >
                          <SlidersHorizontal size={14} /> Configure GitHub
                        </button>
                      )}
                      {id === "local_fs" && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={handlePickLocalFolder}
                          >
                            <FolderOpen size={14} /> Pick Local Folder
                          </button>
                          <input
                            ref={fallbackInputRef}
                            type="file"
                            style={{ display: "none" }}
                            // @ts-expect-error webkitdirectory is standard in modern browsers
                            webkitdirectory=""
                            onChange={handleFallbackFolderInput}
                          />
                        </>
                      )}

                      {conn.mode === "live" && (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleDisconnect(id)}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {showDrivePicker && (
              <div className="diff-box" style={{ marginTop: "2rem" }}>
                <div className="diff-box-title">
                  AUTHORIZED GOOGLE DRIVE FOLDERS
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {driveFolders.map((f) => {
                    const checked = selectedDriveFolderIds.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.6rem",
                          cursor: "pointer",
                          fontFamily: "var(--font-code)",
                          fontSize: "0.82rem",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedDriveFolderIds((prev) =>
                              checked
                                ? prev.filter((x) => x !== f.id)
                                : [...prev, f.id]
                            )
                          }
                        />
                        <span>{f.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveDriveFolders}
                  >
                    Save Folder Selection
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowDrivePicker(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* TAB 3: SETUP WIZARD */}
      {activeTab === "setup" && (
        <main>
          <section className="masthead">
            <div>
              <div className="masthead-kicker">
                <span>OAUTH CREDENTIALS, GITHUB, LOCAL ALLOWLIST &amp; LLM</span>
              </div>
              <h1 className="masthead-title">
                SETUP
                <br />
                WIZARD.
              </h1>
            </div>
          </section>

          <section className="section-block" style={{ borderBottom: "none" }}>
            <div className="notice-bar" style={{ marginBottom: "2rem" }}>
              <div style={{ fontFamily: "var(--font-code)", fontSize: "0.78rem" }}>
                <div>
                  <strong>GOOGLE REDIRECT URI:</strong>{" "}
                  {origin}/api/oauth/google/callback
                </div>
                <div style={{ marginTop: "0.25rem" }}>
                  <strong>MICROSOFT REDIRECT URI:</strong>{" "}
                  {origin}/api/oauth/microsoft/callback
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="googleClientId">
                    Google OAuth Client ID (Gmail &amp; Drive)
                  </label>
                  <input
                    id="googleClientId"
                    className="field-input"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="googleClientSecret">
                    Google OAuth Client Secret
                  </label>
                  <input
                    id="googleClientSecret"
                    type="password"
                    className="field-input"
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                    placeholder="GOCSPX-..."
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="microsoftClientId">
                    Microsoft Entra / Azure Client ID (Outlook)
                  </label>
                  <input
                    id="microsoftClientId"
                    className="field-input"
                    value={microsoftClientId}
                    onChange={(e) => setMicrosoftClientId(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </div>

                <div className="field-group">
                  <label
                    className="field-label"
                    htmlFor="microsoftClientSecret"
                  >
                    Microsoft Client Secret
                  </label>
                  <input
                    id="microsoftClientSecret"
                    type="password"
                    className="field-input"
                    value={microsoftClientSecret}
                    onChange={(e) => setMicrosoftClientSecret(e.target.value)}
                    placeholder="Client secret value"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="githubUsername">
                    GitHub Username (Public Repos)
                  </label>
                  <input
                    id="githubUsername"
                    className="field-input"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="octocat"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="githubToken">
                    GitHub Read-Only PAT (Optional for Private Repos)
                  </label>
                  <input
                    id="githubToken"
                    type="password"
                    className="field-input"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_..."
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="llmProvider">
                    Optional LLM Summary Provider
                  </label>
                  <select
                    id="llmProvider"
                    className="field-select"
                    value={llmProvider}
                    onChange={(e) =>
                      setLlmProvider(e.target.value as LlmProvider)
                    }
                  >
                    <option value="none">
                      None — Deterministic Synthesis (Default)
                    </option>
                    <option value="openai">OpenAI (gpt-4o-mini)</option>
                    <option value="anthropic">
                      Anthropic (claude-3-5-haiku)
                    </option>
                    <option value="gemini">Google Gemini (2.0 Flash)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="llmApiKey">
                    LLM API Key (Optional)
                  </label>
                  <input
                    id="llmApiKey"
                    type="password"
                    className="field-input"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder="sk-... / AIza..."
                  />
                </div>
              </div>

              <div className="field-group" style={{ marginTop: "1.5rem" }}>
                <label className="field-label" htmlFor="localAllowlist">
                  Server-Side Authorized Directory Paths (One per line)
                </label>
                <textarea
                  id="localAllowlist"
                  rows={3}
                  className="field-input"
                  value={localAllowlistText}
                  onChange={(e) => setLocalAllowlistText(e.target.value)}
                  placeholder="/home/antigravity/snapshot-app"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "1.5rem",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    fontFamily: "var(--font-code)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sandboxEnabled}
                    onChange={(e) => setSandboxEnabled(e.target.checked)}
                  />
                  <span>
                    Enable Sandbox Demo fallback for unconfigured OAuth sources
                  </span>
                </label>

                <button
                  id="btn-save-settings"
                  type="submit"
                  className="btn-primary"
                  disabled={busyAction !== null}
                >
                  {busyAction === "settings"
                    ? "Saving & Verifying..."
                    : "Save & Verify Configuration"}
                </button>
              </div>
            </form>
          </section>
        </main>
      )}
    </div>
  );
}
