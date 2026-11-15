/**
 * Batch upload UI: the toolbar button, the queue modal and the floating
 * progress pill shown after the modal is collapsed. All state lives in
 * ``batchUpload.ts`` — these components only render it and forward actions.
 */
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Upload,
  message,
} from "antd";
import type { TableColumnsType, UploadProps } from "antd";
import { CloudUploadOutlined, CloseOutlined } from "@ant-design/icons";
import { MAX_CONCURRENT_UPLOADS, batchQueue, canEdit, useBatchQueue } from "./batchUpload";
import type { BatchItem, TitleRule } from "./batchUpload";
import { formatDuration, formatFileSize } from "./episodeUpload";
import { t } from "../copy";

function RULE_OPTIONS(){ return [
  { value: "episode-en", label: "Episode {n}" },
  { value: "episode-cn", label: t("batchuploadpanel.episode_number_label") },
  { value: "custom", label: t("batchuploadpanel.custom") },
];; }

function isActive(item: BatchItem): boolean {
  return item.status !== "done" && item.status !== "failed";
}

/* ------------------------------ toolbar button ------------------------------ */

export function BatchUploadButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { items } = useBatchQueue();
  const active = items.filter(isActive).length;
  return (
    <Button icon={<CloudUploadOutlined />} disabled={disabled} onClick={onClick}>
      {t("batchuploadpanel.batch_upload_tag")}{active > 0 ? `（${active}）` : ""}
    </Button>
  );
}

/* -------------------------------- status cell ------------------------------- */

function StatusCell({ item, queuedRank }: { item: BatchItem; queuedRank: number | null }) {
  if (item.status === "probing") return <Tag>{t("batchuploadpanel.reading")}</Tag>;
  if (item.status === "queued") {
    return (
      <Space size={6}>
        <Tag style={{ marginRight: 0 }}>{t("batchuploadpanel.queued")}</Tag>
        {queuedRank === 1 && <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("batchuploadpanel.next_up")}</span>}
      </Space>
    );
  }
  if (item.status === "uploading") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Tag color="processing" style={{ marginRight: 0 }}>
          {t("batchuploadpanel.uploading")}
        </Tag>
        <Progress percent={item.progress} size="small" showInfo={false} style={{ flex: 1, margin: 0 }} />
        <span style={{ fontSize: 12, color: "#8c8c8c", width: 34, textAlign: "right" }}>
          {Math.floor(item.progress)}%
        </span>
      </div>
    );
  }
  if (item.status === "transcoding") {
    return (
      <Space size={6}>
        <Tag color="orange" style={{ marginRight: 0 }}>
          {t("episodespanel.transcoding")}
        </Tag>
        {item.overdue && (
          <Tooltip title={t("batchuploadpanel.bunny_processing_tip")}>
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("batchuploadpanel.sync_later")}</span>
          </Tooltip>
        )}
      </Space>
    );
  }
  if (item.status === "done") {
    return (
      <Tag color="green" style={{ marginRight: 0 }}>
        {t("batchuploadpanel.completed")}
      </Tag>
    );
  }
  return (
    <Tooltip title={item.error ?? undefined}>
      <Tag color="red" style={{ marginRight: 0 }}>
        {t("batchuploadpanel.upload_failed")}
      </Tag>
    </Tooltip>
  );
}

/* ---------------------------------- modal ----------------------------------- */

export function BatchUploadModal({
  open,
  onClose,
  dramaId,
  existingNumbers,
}: {
  open: boolean;
  onClose: () => void;
  dramaId: string;
  existingNumbers: number[];
}) {
  const { items, paused } = useBatchQueue();
  const mine = items.filter((item) => item.dramaId === dramaId);
  const [startInput, setStartInput] = useState(1);
  const [ruleKind, setRuleKind] = useState<string>("episode-en");
  const [customTpl, setCustomTpl] = useState("");
  const seenPick = useRef(new Set<string>());
  const prevOpen = useRef(false);

  const currentRule = (): TitleRule =>
    ruleKind === "custom" ? { kind: "custom", template: customTpl } : { kind: ruleKind as "episode-en" | "episode-cn" };

  // Suggest the next free number each time the dialog opens (not on every
  // table refresh, so an edit the operator is mid-way through is not lost).
  useEffect(() => {
    if (open && !prevOpen.current) {
      setStartInput(batchQueue.nextSuggested(dramaId, existingNumbers));
    }
    prevOpen.current = open;
  }, [open, dramaId, existingNumbers]);

  const onPick: UploadProps["onChange"] = (info) => {
    const fresh: File[] = [];
    for (const entry of info.fileList) {
      if (seenPick.current.has(entry.uid)) continue;
      seenPick.current.add(entry.uid);
      const raw = entry.originFileObj as File | undefined;
      if (raw) fresh.push(raw);
    }
    if (fresh.length === 0) return;
    const res = batchQueue.addFiles({ dramaId, files: fresh, startNumber: startInput, rule: currentRule() });
    if (res.added > 0) setStartInput(res.nextNumber);
    if (res.skippedDup > 0) message.info(t("batchuploadpanel.skipped_duplicates", {v0: res.skippedDup}));
    if (res.rejected.length > 0) {
      const preview = res.rejected.slice(0, 3).join("；");
      message.error(t("batchuploadpanel.skipped_files", {v0: res.rejected.length, v1: preview, v2: res.rejected.length > 3 ? "…" : ""}));
    }
  };

  const commitStart = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return;
    const actual = batchQueue.renumberFrom({ dramaId, start: value, rule: currentRule(), reserved: existingNumbers });
    setStartInput(actual);
    if (actual !== value) message.info(t("batchuploadpanel.episode_taken", {v0: value, v1: actual}));
  };

  const onRuleChange = (kind: string) => {
    setRuleKind(kind);
    const rule: TitleRule = kind === "custom" ? { kind: "custom", template: customTpl } : { kind: kind as "episode-en" | "episode-cn" };
    batchQueue.retitle(dramaId, rule);
  };

  const onCustomChange = (template: string) => {
    setCustomTpl(template);
    batchQueue.retitle(dramaId, { kind: "custom", template });
  };

  // Ranks for queued rows: the head of the queue is "next up".
  const queueRank = new Map<number, number>();
  let rankCursor = 0;
  for (const item of mine) {
    if (item.status === "queued") queueRank.set(item.uid, ++rankCursor);
  }

  const stats = {
    total: mine.length,
    uploading: mine.filter((item) => item.status === "uploading").length,
    queued: mine.filter((item) => item.status === "queued" || item.status === "probing").length,
    transcoding: mine.filter((item) => item.status === "transcoding").length,
    done: mine.filter((item) => item.status === "done").length,
    failed: mine.filter((item) => item.status === "failed").length,
  };

  const columns: TableColumnsType<BatchItem> = [
    {
      title: t("common.episodes_unit"),
      width: 76,
      render: (_, item) =>
        canEdit(item) ? (
          <InputNumber
            size="small"
            min={1}
            max={2000}
            style={{ width: 64 }}
            value={item.episodeNumber}
            onChange={(value) => {
              if (typeof value === "number") batchQueue.editNumber(item.uid, value);
            }}
          />
        ) : (
          <span>{item.episodeNumber}</span>
        ),
    },
    {
      title: t("batchuploadpanel.video_files"),
      ellipsis: true,
      render: (_, item) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.file.name}>
            {item.file.name}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 1 }}>
            {formatFileSize(item.file.size)}
            {item.meta
              ? ` · ${formatDuration(item.meta.durationSeconds)}`
              : item.status === "probing"
                ? t("batchuploadpanel.reading_suffix")
                : ""}
          </div>
          {item.status === "failed" && item.error && (
            <div style={{ fontSize: 12, color: "#cf1322", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.error}>
              {item.error}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("common.title"),
      width: 200,
      render: (_, item) =>
        canEdit(item) ? (
          <Input
            size="small"
            value={item.title}
            maxLength={200}
            onChange={(event) => batchQueue.editTitle(item.uid, event.target.value)}
          />
        ) : (
          <span style={{ display: "inline-block", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }} title={item.title}>
            {item.title}
          </span>
        ),
    },
    {
      title: t("batchuploadpanel.upload_status"),
      width: 216,
      render: (_, item) => <StatusCell item={item} queuedRank={queueRank.get(item.uid) ?? null} />,
    },
    {
      title: t("common.actions"),
      width: 92,
      render: (_, item) => (
        <Space size={4}>
          {item.status === "failed" && (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => batchQueue.retry(item.uid)}>
              {t("common.retry")}
            </Button>
          )}
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label={t("homeops.remove")}
            onClick={() => batchQueue.remove(item.uid)}
          />
        </Space>
      ),
    },
  ];

  const handleCollapse = () => {
    const active = mine.some(isActive);
    onClose();
    if (active) message.info(t("batchuploadpanel.collapsed_background"));
  };

  return (
    <Modal
      open={open}
      width={880}
      title={t("batchuploadpanel.batch_upload_episodes")}
      maskClosable={false}
      onCancel={handleCollapse}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#595959" }}>
            {t("batchuploadpanel.total_uploading", {v0: stats.total})}{" "}<span style={{ color: "#185fa5", fontWeight: 500 }}>{stats.uploading} / {MAX_CONCURRENT_UPLOADS}</span>
            {" · "}{t("batchuploadpanel.queued_count", {v0: stats.queued})}
            {" · "}{t("episodespanel.transcoding")} {stats.transcoding}
            {" · "}{t("batchuploadpanel.completed")} {stats.done}
            {" · "}{t("finance.filter_failed", {v0: stats.failed})}
          </div>
          <Space size={8}>
            <Button size="small" disabled={stats.done === 0} onClick={() => batchQueue.clearDone()}>
              {t("batchuploadpanel.clear_completed")}
            </Button>
            <Tooltip title={paused ? t("batchuploadpanel.resume_queued_files") : t("batchuploadpanel.pause_after_current")}>
              <Button size="small" onClick={() => batchQueue.setPaused(!paused)}>
                {paused ? t("batchuploadpanel.resume_queue") : t("batchuploadpanel.pause_queue")}
              </Button>
            </Tooltip>
            <Button size="small" type="primary" onClick={handleCollapse}>
              {t("batchuploadpanel.collapse_background_upload")}
            </Button>
          </Space>
        </div>
      }
    >
      {mine.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t("batchuploadpanel.do_not_refresh")}
          description={t("batchuploadpanel.queue_page_only")}
        />
      )}

      <Upload.Dragger
        className="ep-drop"
        multiple
        accept=".mp4,.mov,video/mp4,video/quicktime"
        fileList={[]}
        showUploadList={false}
        beforeUpload={() => false}
        onChange={onPick}
      >
        <div className="ep-drop-inner">
          <CloudUploadOutlined className="ep-drop-icon" />
          <div className="ep-drop-title">{t("batchuploadpanel.drop_videos_hint")}</div>
          <div className="ep-drop-hint">{t("batchuploadpanel.support_hint")}</div>
        </div>
      </Upload.Dragger>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: "12px 0 8px", fontSize: 13, color: "#595959" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {t("batchuploadpanel.start_episode")}
          <InputNumber
            size="small"
            min={1}
            max={2000}
            style={{ width: 70 }}
            value={startInput}
            onChange={(value) => {
              if (typeof value === "number") setStartInput(value);
            }}
            onBlur={() => commitStart(startInput)}
          />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {t("batchuploadpanel.title_rule")}
          <Select size="small" style={{ width: 130 }} value={ruleKind} options={RULE_OPTIONS()} onChange={onRuleChange} />
        </span>
        {ruleKind === "custom" && (
          <Input
            size="small"
            style={{ width: 220 }}
            placeholder={t("batchuploadpanel.title_example")}
            value={customTpl}
            onChange={(event) => onCustomChange(event.target.value)}
          />
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#8c8c8c" }}>{t("batchuploadpanel.auto_numbering")}</span>
      </div>

      <Table<BatchItem>
        rowKey="uid"
        size="small"
        pagination={false}
        dataSource={mine}
        columns={columns}
        scroll={{ y: 320 }}
        locale={{ emptyText: t("batchuploadpanel.empty_files") }}
      />
    </Modal>
  );
}

/* ------------------------------ floating pill ------------------------------- */

export function BatchUploadPill({
  dramaId,
  hidden,
  onOpen,
}: {
  dramaId: string;
  hidden: boolean;
  onOpen: () => void;
}) {
  const { items } = useBatchQueue();
  const mine = items.filter((item) => item.dramaId === dramaId);
  const active = mine.filter(isActive);
  if (hidden || active.length === 0) return null;
  const done = mine.filter((item) => item.status === "done").length;
  const uploading = mine.filter((item) => item.status === "uploading").length;
  const queued = mine.filter((item) => item.status === "queued" || item.status === "probing").length;
  const transcoding = mine.filter((item) => item.status === "transcoding").length;
  const parts = [t("batchuploadpanel.done_count", {v0: done, v1: mine.length})];
  if (uploading > 0) parts.push(t("batchuploadpanel.uploading_count", {v0: uploading, v1: MAX_CONCURRENT_UPLOADS}));
  if (queued > 0) parts.push(t("batchuploadpanel.queued_count", {v0: queued}));
  if (transcoding > 0) parts.push(t("batchuploadpanel.transcoding_count", {v0: transcoding}));

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.08)",
        padding: "10px 14px",
      }}
    >
      <Tag color="processing" style={{ marginRight: 0 }}>
        {t("batchuploadpanel.batch_upload_tag")}
      </Tag>
      <span style={{ fontSize: 13 }}>{parts.join(" · ")}</span>
      <span style={{ fontSize: 12, color: "#bfbfbf" }}>{t("batchuploadpanel.do_not_refresh_short")}</span>
      <Button size="small" type="primary" onClick={onOpen}>
        {t("batchuploadpanel.open")}
      </Button>
    </div>
  );
}
