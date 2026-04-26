"use client";

import dynamic from "next/dynamic";
import { usePanel } from "@/hooks/usePanel";

const PreviewPanel = dynamic(() => import("./panels/PreviewPanel").then(m => ({ default: m.PreviewPanel })), { ssr: false });
const GitPanelContainer = dynamic(() => import("./panels/GitPanel").then(m => ({ default: m.GitPanelContainer })), { ssr: false });
const FileTreePanel = dynamic(() => import("./panels/FileTreePanel").then(m => ({ default: m.FileTreePanel })), { ssr: false });
const DashboardPanel = dynamic(() => import("./panels/DashboardPanel").then(m => ({ default: m.DashboardPanel })), { ssr: false });

export function PanelZone() {
  const { previewOpen, previewFile, gitPanelOpen, fileTreeOpen, dashboardPanelOpen } = usePanel();

  const anyOpen = (previewOpen && !!previewFile) || gitPanelOpen || fileTreeOpen || dashboardPanelOpen;

  if (!anyOpen) return null;

  return (
    <div className="flex h-full shrink-0 border-l border-border/40 overflow-hidden">
      {previewOpen && previewFile && <PreviewPanel />}
      {gitPanelOpen && <GitPanelContainer />}
      {fileTreeOpen && <FileTreePanel />}
      {dashboardPanelOpen && <DashboardPanel />}
    </div>
  );
}
