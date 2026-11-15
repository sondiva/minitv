import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  CloseOutlined,
  CloudUploadOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { useCanWriteContent } from "../me";
import {
  MAX_UPLOAD_BYTES,
  directUpload,
  formatDuration,
  formatFileSize,
  orientationLabel,
  probeVideo,
  waitForTranscode,
} from "./episodeUpload";
import type { UploadSession, VideoMeta } from "./episodeUpload";
import { batchQueue } from "./batchUpload";
import { BatchUploadButton, BatchUploadModal, BatchUploadPill } from "./BatchUploadPanel";
import { t } from "../copy";

type EpisodeRow = {
  id: number;
  episode_number: number;
  title: string;
  status: string;
  duration_seconds: number;
  bunny_video_id: string;
};

function STATUS_META(): Record<string, { text: string; color: string }> { return {
  not_uploaded: { text: t("episodespanel.not_uploaded"), color: "default" },
  transcoding: { text: t("episodespanel.transcoding"), color: "processing" },
  transcode_failed: { text: t("episodespanel.transcode_failed"), color: "error" },
  in_review: { text: t("common.in_review"), color: "orange" },
  published: { text: t("common.published"), color: "green" },
  unpublished: { text: t("common.unpublished"), color: "red" },
};; }

/* ---------- video picker (shared by the create and edit dialogs) ---------- */

type VideoPick = {
  fileList: UploadFile[];
  file: File | null;
  meta: VideoMeta | null;
  error: string | null;
  probing: boolean;
  onFileChange: UploadProps["onChange"];
  reset: () => void;
};

function useVideoPick(): VideoPick {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  /** Sequence guard: a slow probe must not overwrite a newer pick. */
  const probeSeq = useRef(0);

  const reset = useCallback(() => {
    probeSeq.current += 1;
    setFileList([]);
    setFile(null);
    setMeta(null);
    setError(null);
    setProbing(false);
  }, []);

  const onFileChange: UploadProps["onChange"] = async (info) => {
    const next = info.fileList.slice(-1);
    setFileList(next);
    setError(null);
    setMeta(null);
    const picked = (next[0]?.originFileObj as File | undefined) ?? null;
    setFile(picked);
    if (!picked) {
      setProbing(false);
      return;
    }
    const looksLikeVideo =
      ["video/mp4", "video/quicktime"].includes(picked.type) || /\.(mp4|mov)$/i.test(picked.name);
    if (!looksLikeVideo) {
      setFileList([]);
      setFile(null);
      setProbing(false);
      setError(t("episodespanel.only_mp4_mov"));
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setFileList([]);
      setFile(null);
      setProbing(false);
      setError(t("episodespanel.file_over_limit", {v0: formatFileSize(picked.size)}));
      return;
    }
    probeSeq.current += 1;
    const seq = probeSeq.current;
    setProbing(true);
    try {
      // Resolution only: orientation is not restricted. Ops uploads both
      // vertical and landscape episodes, so never gate on width vs height here.
      const probed = await probeVideo(picked);
      if (probeSeq.current !== seq) return;
      setMeta(probed);
    } catch (e) {
      if (probeSeq.current !== seq) return;
      setFileList([]);
      setFile(null);
      setError(errorText(e));
    } finally {
      if (probeSeq.current === seq) setProbing(false);
    }
  };

  return { fileList, file, meta, error, probing, onFileChange, reset };
}

function VideoDrop({
  pick,
  disabled,
  title,
  hint,
}: {
  pick: VideoPick;
  disabled: boolean;
  title: string;
  hint: string;
}) {
  return (
    <Upload.Dragger
      className="ep-drop"
      accept=".mp4,.mov,video/mp4,video/quicktime"
      maxCount={1}
      fileList={pick.fileList}
      showUploadList={false}
      beforeUpload={() => false}
      onChange={pick.onFileChange}
      disabled={disabled}
    >
      <div className="ep-drop-inner">
        <CloudUploadOutlined className="ep-drop-icon" />
        <div className="ep-drop-title">{title}</div>
        <div className="ep-drop-hint">{hint}</div>
      </div>
    </Upload.Dragger>
  );
}

function VideoFileCard({
  pick,
  onClear,
  onPreview,
  clearDisabled,
  progress,
}: {
  pick: VideoPick;
  onClear: () => void;
  onPreview: () => void;
  clearDisabled: boolean;
  progress: number | null;
}) {
  const name = pick.file?.name ?? t("episodespanel.selected_video");
  const detail = pick.meta
    ? `${pick.meta.width}×${pick.meta.height} · ${orientationLabel(pick.meta)} · ${formatDuration(pick.meta.durationSeconds)} · ${formatFileSize(pick.file?.size ?? 0)}`
    : pick.probing
      ? t("episodespanel.reading_resolution")
      : t("episodespanel.waiting_video_info");
  return (
    <div className="ep-file">
      <div className="ep-video-mark" aria-hidden>
        <VideoCameraOutlined />
      </div>
      <div className="ep-file-main">
        <div className="ep-file-name" title={name}>
          {name}
        </div>
        <div className="ep-file-sub">{detail}</div>
        {progress != null && (
          <Progress percent={progress} size="small" status="active" style={{ margin: "8px 0 0" }} />
        )}
      </div>
      <div className="ep-file-actions">
        <Button type="link" size="small" className="ep-text-btn" icon={<PlayCircleOutlined />} onClick={onPreview}>
          {t("common.preview")}
        </Button>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          disabled={clearDisabled}
          aria-label={t("episodespanel.remove_video")}
          onClick={onClear}
        />
      </div>
    </div>
  );
}

/* ---------- create / edit dialog ---------- */

/**
 * One dialog for both flows: ``editing === null`` creates a new episode row
 * (video required); otherwise it edits an existing row - title / number are
 * patched, and picking a file additionally replaces the Bunny video.
 */
function EpisodeEditorModal({
  open,
  dramaId,
  episodes,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  dramaId: string;
  episodes: EpisodeRow[];
  editing: EpisodeRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<{ episode_number: number; title: string }>();
  const pick = useVideoPick();
  const resetPick = pick.reset;
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "transcoding">("idle");
  const [progress, setProgress] = useState(0);
  /** Existing videos stay collapsed until the operator asks to replace. */
  const [replacing, setReplacing] = useState(
    () => editing == null || !editing.bunny_video_id || editing.status === "transcode_failed"
  );
  /** Episode row id once created on the server: retries must reuse it. */
  const [episodeId, setEpisodeId] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  /** Local blob URL for a not-yet-uploaded pick; revoked on close or unmount. */
  const previewBlobRef = useRef<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<
    { open: false } | { open: true; kind: "embed" | "file"; url: string; title: string }
  >({ open: false });

  useEffect(
    () => () => {
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    },
    []
  );

  useEffect(() => {
    if (open) return;
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
    setPreview({ open: false });
  }, [open]);

  const closePreview = () => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
    setPreview({ open: false });
  };

  const previewCurrent = async () => {
    if (!editing?.bunny_video_id) return;
    setPreviewing(true);
    try {
      const signed = await api<{ url: string; embed_url?: string }>(`/admin/v1/episodes/${editing.id}/preview-url`);
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current);
        previewBlobRef.current = null;
      }
      setPreview({
        open: true,
        kind: "embed",
        url: signed.embed_url ?? signed.url,
        title: t("drama.preview_episode", {v0: editing.episode_number}),
      });
    } catch (e) {
      message.error(t("stagepages.preview_failed", {v0: errorText(e)}));
    } finally {
      setPreviewing(false);
    }
  };

  const previewPicked = () => {
    if (!pick.file) return;
    if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    const url = URL.createObjectURL(pick.file);
    previewBlobRef.current = url;
    setPreview({ open: true, kind: "file", url, title: t("episodespanel.preview_file", {v0: pick.file.name}) });
  };

  const clearPick = () => {
    if (preview.open && preview.kind === "file") closePreview();
    resetPick();
  };

  const isCreate = editing === null;
  const busy = phase !== "idle";
  /** Only the byte upload locks the dialog; transcoding runs in the background. */
  const locked = phase === "uploading";
  const canReplaceVideo = editing === null || editing.status !== "transcoding";

  const nextNumber = useMemo(
    () => episodes.reduce((max, row) => Math.max(max, row.episode_number), 0) + 1,
    [episodes]
  );

  useEffect(() => {
    if (!open) return;
    resetPick();
    setError(null);
    setProgress(0);
    setPhase("idle");
    setEpisodeId(editing?.id ?? null);
    form.setFieldsValue(
      editing
        ? { episode_number: editing.episode_number, title: editing.title }
        : { episode_number: nextNumber, title: `Episode ${nextNumber}` }
    );
  }, [open, editing, nextNumber, form, resetPick]);

  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    if (isCreate && !(pick.file && pick.meta)) {
      setError(t("episodespanel.select_video_first"));
      return;
    }
    if (pick.file && !pick.meta) {
      setError(pick.probing ? t("episodespanel.reading_video_info") : t("episodespanel.invalid_video_info"));
      return;
    }
    setPhase("saving");
    setError(null);
    let session: UploadSession | null = null;
    try {
      let targetId = episodeId;
      if (targetId == null) {
        const created = await api<{ id: number }>(`/admin/v1/dramas/${dramaId}/episodes`, {
          method: "POST",
          body: JSON.stringify({
            episode_number: values.episode_number,
            title: (values.title ?? "").trim(),
          }),
        });
        targetId = created.id;
        setEpisodeId(targetId);
      } else {
        // Metadata edits (title / number) are a plain PATCH; the video file,
        // when picked, is swapped in afterwards through the upload session.
        await api(`/admin/v1/episodes/${targetId}`, {
          method: "PATCH",
          body: JSON.stringify({
            episode_number: values.episode_number,
            title: (values.title ?? "").trim(),
          }),
        });
      }
      if (pick.file && pick.meta) {
        setPhase("uploading");
        setProgress(0);
        session = await api<UploadSession>(`/admin/v1/episodes/${targetId}/upload-session`, {
          method: "POST",
          body: JSON.stringify({
            filename: pick.file.name,
            mime: pick.file.type || "video/mp4",
            size_bytes: pick.file.size,
            // Probed values only: never substitute a default resolution, it
            // would misreport landscape uploads as portrait.
            width: pick.meta.width,
            height: pick.meta.height,
            duration_seconds: pick.meta.durationSeconds,
          }),
        });
        await directUpload(session, pick.file, setProgress, (xhr) => {
          xhrRef.current = xhr;
        });
        setPhase("transcoding");
        const finalStatus = await waitForTranscode(targetId);
        if (finalStatus === "transcode_failed") {
          setError(t("episodespanel.bunny_transcode_failed"));
          setPhase("idle");
          return;
        }
        if (finalStatus === "in_review") {
          message.success(
            isCreate
              ? t("episodespanel.episode_uploaded_review", {v0: values.episode_number})
              : t("episodespanel.episode_replaced_republish", {v0: values.episode_number})
          );
        } else {
          message.info(t("episodespanel.uploaded_transcoding_sync"));
        }
      } else {
        message.success(t("episodespanel.episode_updated"));
      }
      onSaved();
      onClose();
    } catch (e) {
      if (session) {
        // Open the retry path: transcoding rows cannot start a new session.
        try {
          await api(`/admin/v1/episodes/${session.episode_id}/upload-failed`, {
            method: "POST",
            body: JSON.stringify({ video_id: session.video_id, reason: errorText(e) }),
          });
        } catch {
          /* best effort - the row can still be synced/pruned later */
        }
      }
      setError(errorText(e));
      setPhase("idle");
    }
  };

  const cancelUpload = () => {
    xhrRef.current?.abort();
  };

  const stopReplacing = () => {
    clearPick();
    setReplacing(false);
  };

  const primaryLabel = isCreate
    ? t("episodespanel.start_upload")
    : pick.file
      ? editing?.bunny_video_id
        ? t("episodespanel.save_replace_video")
        : t("episodespanel.save_upload_video")
      : t("common.save");

  // ``editing`` is the row from when the dialog opened. Once a replace starts,
  // that badge is stale — a previous 转码失败 must not stay on the title while
  // the new file is uploading or already at Bunny.
  const liveStatus = phase === "uploading" || phase === "transcoding" ? "transcoding" : editing?.status;
  const statusMeta = liveStatus ? STATUS_META()[liveStatus] ?? { text: liveStatus, color: "default" } : null;
  const hasVideo = Boolean(editing?.bunny_video_id);
  const showFile = Boolean(pick.file);
  const showDrop = canReplaceVideo && replacing && !showFile;
  const showCurrent = hasVideo && !replacing && phase !== "uploading" && phase !== "transcoding";
  /** Failed transcodes have a Bunny id but nothing playable yet. */
  const canPreviewCurrent = Boolean(editing && editing.status !== "transcode_failed");

  const infoSection = (
    <section className="ep-section">
      <div className="ep-kicker">{t("episodespanel.basic_info")}</div>
      <Form form={form} layout="vertical" disabled={busy}>
        <div className="ep-fields">
          <Form.Item
            label={t("episodespanel.episode_count")}
            name="episode_number"
            rules={[{ required: true, message: t("episodespanel.enter_episode_count") }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber min={1} max={2000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label={t("common.title")}
            name="title"
            rules={[{ required: true, message: t("episodespanel.enter_title") }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder={t("episodespanel.episode_title_placeholder")} maxLength={200} />
          </Form.Item>
        </div>
      </Form>
    </section>
  );

  const videoSection = (
    <section className="ep-section">
      <div className="ep-section-head">
        <div className="ep-kicker">
          {t("episodespanel.video")}
          {isCreate && <span className="ep-req">{t("episodespanel.required")}</span>}
        </div>
        {hasVideo && replacing && canReplaceVideo && phase === "idle" && (
          <Button type="link" size="small" className="ep-text-btn" onClick={stopReplacing}>
            {t("episodespanel.cancel_replace")}
          </Button>
        )}
      </div>

      {!canReplaceVideo && (
        <div className="ep-note">{t("episodespanel.transcoding_no_replace")}</div>
      )}

      {editing?.status === "transcode_failed" && replacing && !showFile && (
        <div className="ep-note">{t("episodespanel.last_transcode_failed")}</div>
      )}

      {showCurrent && (
        <div className="ep-video-card">
          <div className="ep-video-mark" aria-hidden>
            <VideoCameraOutlined />
          </div>
          <div className="ep-video-copy">
            <div className="ep-video-title">{t("episodespanel.current_video")}</div>
            <div className="ep-video-sub">
              {editing?.duration_seconds ? t("episodespanel.duration_value", {v0: formatDuration(editing.duration_seconds)}) : t("episodespanel.duration_unknown")}
            </div>
          </div>
          <div className="ep-video-actions">
            {canPreviewCurrent && (
              <Button icon={<PlayCircleOutlined />} loading={previewing} onClick={previewCurrent}>
                {t("common.preview")}
              </Button>
            )}
            {canReplaceVideo && (
              <Button disabled={busy} onClick={() => setReplacing(true)}>
                {t("episodespanel.replace_video")}
              </Button>
            )}
          </div>
        </div>
      )}

      {showDrop && (
        <VideoDrop
          pick={pick}
          disabled={busy}
          title={hasVideo ? t("episodespanel.drop_new_video") : t("episodespanel.drop_video")}
          hint={
            hasVideo
              ? t("episodespanel.mp4_mov_retranscode")
              : t("episodespanel.mp4_mov_direct_bunny")
          }
        />
      )}

      {showFile && (
        <VideoFileCard
          pick={pick}
          onClear={clearPick}
          onPreview={previewPicked}
          clearDisabled={busy}
          progress={phase === "uploading" ? progress : null}
        />
      )}

      {pick.meta && hasVideo && phase === "idle" && (
        <div className="ep-warn">{t("episodespanel.save_retranscode_warn")}</div>
      )}

      {pick.error && <div className="ep-error">{pick.error}</div>}
    </section>
  );

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: "#E53B3E", borderRadius: 8 },
        components: {
          Input: {
            activeBorderColor: "#1f1f1f",
            hoverBorderColor: "#bfbfbf",
            activeShadow: "0 0 0 2px rgba(31, 31, 31, 0.06)",
          },
          InputNumber: {
            activeBorderColor: "#1f1f1f",
            hoverBorderColor: "#bfbfbf",
            activeShadow: "0 0 0 2px rgba(31, 31, 31, 0.06)",
          },
        },
      }}
    >
      <Modal
        rootClassName="ep-editor-root"
        open={open}
        title={
          <span className="ep-title">
            {editing ? t("episodespanel.edit_episode_number", {v0: editing.episode_number}) : t("episodespanel.upload_new_episode")}
            {statusMeta ? <Tag color={statusMeta.color}>{statusMeta.text}</Tag> : null}
          </span>
        }
        width={600}
        maskClosable={!locked && !preview.open}
        keyboard={!preview.open}
        closable={!locked}
        onCancel={locked ? undefined : onClose}
        styles={{ body: { paddingTop: 8 } }}
        footer={
          <div className="ep-footer">
            {locked ? (
              <Button danger onClick={cancelUpload}>
                {t("episodespanel.cancel_upload")}
              </Button>
            ) : phase === "transcoding" ? (
              <Button onClick={onClose}>{t("common.close")}</Button>
            ) : (
              <>
                <Button onClick={onClose} disabled={phase === "saving"}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="primary"
                  loading={phase === "saving"}
                  disabled={pick.probing || (isCreate && !pick.file)}
                  onClick={save}
                >
                  {primaryLabel}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="ep-editor">
          {isCreate ? videoSection : infoSection}
          {isCreate ? infoSection : videoSection}
          {phase === "transcoding" && (
            <Alert
              type="info"
              showIcon
              message={t("episodespanel.file_uploaded_transcoding")}
              description={t("episodespanel.transcode_auto_review")}
            />
          )}
          {error && <Alert type="error" showIcon message={error} />}
        </div>
      </Modal>
      <Modal
        open={preview.open}
        title={preview.open ? preview.title : t("common.preview")}
        width={720}
        footer={null}
        centered
        destroyOnHidden
        zIndex={1100}
        onCancel={closePreview}
        styles={{ body: { padding: 0, background: "#000", lineHeight: 0 } }}
      >
        {preview.open && preview.kind === "embed" ? (
          <iframe
            title={preview.title}
            src={preview.url}
            style={{ display: "block", width: "100%", aspectRatio: "9 / 16", maxHeight: "70vh", border: 0, background: "#000" }}
            allow="accelerometer; autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : null}
        {preview.open && preview.kind === "file" ? (
          <video
            key={preview.url}
            src={preview.url}
            controls
            autoPlay
            playsInline
            style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#000" }}
          />
        ) : null}
      </Modal>
    </ConfigProvider>
  );
}

export default function EpisodesPanel({ dramaId }: { dramaId: string }) {
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  /** Bumps on each open so the dialog remounts with a fresh replace/upload state. */
  const [editorNonce, setEditorNonce] = useState(0);
  /** null means the editor is in "upload new episode" mode. */
  const [editing, setEditing] = useState<EpisodeRow | null>(null);
  const [preview, setPreview] = useState<{ open: boolean; url?: string; title: string }>({
    open: false,
    title: "",
  });
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const canWrite = useCanWriteContent();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page_size: "200" });
      if (status) query.set("status", status);
      const res = await api<{ items: EpisodeRow[] }>(
        `/admin/v1/dramas/${dramaId}/episodes?${query.toString()}`
      );
      setRows(res.items);
    } catch (e) {
      message.error(t("episodespanel.load_episodes_failed", {v0: errorText(e)}));
    } finally {
      setLoading(false);
    }
  }, [dramaId, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Batch uploads run outside this component: refresh the table when an
    // item settles, coalescing bursts (upload finish → transcode → done).
    let timer: number | null = null;
    const unsubscribe = batchQueue.onSettled(() => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        load();
      }, 800);
    });
    return () => {
      unsubscribe();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [load]);

  const openEditor = (row: EpisodeRow | null) => {
    setEditing(row);
    setEditorNonce((nonce) => nonce + 1);
    setEditorOpen(true);
  };

  const openPreview = async (row: EpisodeRow) => {
    try {
      const signed = await api<{ url: string; embed_url?: string }>(`/admin/v1/episodes/${row.id}/preview-url`);
      setPreview({ open: true, url: signed.embed_url ?? signed.url, title: t("drama.preview_episode", {v0: row.episode_number}) });
    } catch (e) {
      message.error(t("stagepages.preview_failed", {v0: errorText(e)}));
    }
  };

  const syncStatus = async (row: EpisodeRow) => {
    try {
      const res = await api<{ status: string }>(`/admin/v1/episodes/${row.id}/sync-status`, { method: "POST" });
      const meta = STATUS_META()[res.status];
      message.success(t("episodespanel.episode_status", {v0: row.episode_number, v1: meta?.text ?? res.status}));
      load();
    } catch (e) {
      message.error(t("episodespanel.sync_failed", {v0: errorText(e)}));
    }
  };

  const publish = async (row: EpisodeRow) => {
    try {
      await api(`/admin/v1/episodes/${row.id}/publish`, { method: "POST" });
      message.success(t("episodespanel.episode_published", {v0: row.episode_number}));
      load();
    } catch (e) {
      message.error(t("episodespanel.publish_failed", {v0: errorText(e)}));
    }
  };

  const unpublish = async (row: EpisodeRow) => {
    try {
      await api(`/admin/v1/episodes/${row.id}/unpublish`, { method: "POST" });
      message.success(t("episodespanel.episode_unpublished", {v0: row.episode_number}));
      load();
    } catch (e) {
      message.error(t("episodespanel.unpublish_failed", {v0: errorText(e)}));
    }
  };

  const bulkStatus = async (action: "publish" | "unpublish") => {
    if (selectedKeys.length === 0) return;
    setBulkBusy(true);
    const label = action === "publish" ? t("episodespanel.publish") : t("drama.unpublish");
    try {
      const res = await api<{ updated: unknown[]; skipped: unknown[] }>(
        "/admin/v1/episodes/bulk-status",
        {
          method: "POST",
          body: JSON.stringify({ episode_ids: selectedKeys, action }),
        }
      );
      const skipped = res.skipped.length;
      message.success(
        t("episodespanel.batch_done", { v0: label, v1: res.updated.length }) +
          (skipped ? t("episodespanel.batch_done_skipped", { v0: skipped }) : "")
      );
      setSelectedKeys([]);
      load();
    } catch (e) {
      message.error(t("episodespanel.batch_failed", {v0: label, v1: errorText(e)}));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap size="middle">
        {canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openEditor(null)}
          >
            {t("episodespanel.upload_new_episode")}
          </Button>
        )}
        {canWrite && <BatchUploadButton onClick={() => setBatchOpen(true)} />}
        <Select
          allowClear
          placeholder={t("episodespanel.status_filter")}
          style={{ width: 160 }}
          value={status}
          onChange={(value) => setStatus(value)}
          options={Object.entries(STATUS_META()).map(([value, meta]) => ({ value, label: meta.text }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => load()}>
          {t("common.refresh")}
        </Button>
        <Typography.Text type="secondary">{t("episodespanel.total_episodes", {v0: rows.length})}</Typography.Text>
        {selectedKeys.length > 0 && (
          <>
            <Typography.Text>{t("episodespanel.selected_episodes", {v0: selectedKeys.length})}</Typography.Text>
            <Button
              type="primary"
              disabled={!canWrite}
              loading={bulkBusy}
              onClick={() => bulkStatus("publish")}
            >
              {t("episodespanel.batch_publish")}
            </Button>
            <Button
              danger
              disabled={!canWrite}
              loading={bulkBusy}
              onClick={() => bulkStatus("unpublish")}
            >
              {t("episodespanel.batch_unpublish")}
            </Button>
            <Button type="link" onClick={() => setSelectedKeys([])}>
              {t("episodespanel.cancel_selection")}
            </Button>
          </>
        )}
      </Space>

      <Table<EpisodeRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 720 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys as number[]),
          getCheckboxProps: (row) => ({
            // Nothing to take down/publish while a placeholder has no video.
            disabled: !row.bunny_video_id,
          }),
        }}
        columns={[
          { title: t("common.episodes_unit"), dataIndex: "episode_number", width: 70 },
          {
            title: t("common.title"),
            dataIndex: "title",
            ellipsis: true,
            render: (value: string) =>
              value || <Typography.Text type="secondary">{t("episodespanel.unnamed")}</Typography.Text>,
          },
          { title: t("episodespanel.duration"), dataIndex: "duration_seconds", width: 90, render: (value: number) => formatDuration(value) },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 110,
            render: (value: string) => {
              const meta = STATUS_META()[value] ?? { text: value, color: "default" };
              return <Tag color={meta.color}>{meta.text}</Tag>;
            },
          },
          {
            title: t("common.actions"),
            width: 300,
            render: (_, row) => (
              <Space size={12} wrap>
                {row.bunny_video_id && row.status !== "transcode_failed" && (
                  <Button size="small" type="link" style={{ padding: 0 }} onClick={() => openPreview(row)}>
                    {t("common.preview")}
                  </Button>
                )}
                {row.status === "transcoding" && (
                  <Button size="small" type="link" style={{ padding: 0 }} icon={<SyncOutlined />} onClick={() => syncStatus(row)}>
                    {t("episodespanel.sync_status")}
                  </Button>
                )}
                {canWrite && (!row.bunny_video_id || row.status === "transcode_failed") && (
                  <Button
                    size="small"
                    type={row.status === "transcode_failed" ? "link" : "primary"}
                    danger={row.status === "transcode_failed"}
                    style={row.status === "transcode_failed" ? { padding: 0 } : undefined}
                    onClick={() => openEditor(row)}
                  >
                    {row.status === "transcode_failed" ? t("episodespanel.reupload") : t("common.upload")}
                  </Button>
                )}
                {canWrite && (
                  <Button size="small" type="link" style={{ padding: 0 }} onClick={() => openEditor(row)}>
                    {t("common.edit")}
                  </Button>
                )}
                {row.status === "in_review" && canWrite && (
                  <Popconfirm title={t("episodespanel.confirm_publish_episode", {v0: row.episode_number})} onConfirm={() => publish(row)}>
                    <Button size="small" type="link" style={{ padding: 0 }}>
                      {t("episodespanel.publish")}
                    </Button>
                  </Popconfirm>
                )}
                {row.status === "unpublished" && canWrite && (
                  <Popconfirm title={t("episodespanel.confirm_republish_episode", {v0: row.episode_number})} onConfirm={() => publish(row)}>
                    <Button size="small" type="link" style={{ padding: 0 }}>
                      {t("episodespanel.publish")}
                    </Button>
                  </Popconfirm>
                )}
                {row.status === "published" && canWrite && (
                  <Popconfirm title={t("episodespanel.confirm_unpublish_episode", {v0: row.episode_number})} onConfirm={() => unpublish(row)}>
                    <Button size="small" type="link" danger style={{ padding: 0 }}>
                      {t("drama.unpublish")}
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <EpisodeEditorModal
        key={editorNonce}
        open={editorOpen}
        dramaId={dramaId}
        episodes={rows}
        editing={editing}
        onClose={() => {
          setEditorOpen(false);
          load();
        }}
        onSaved={load}
      />

      <Modal
        open={preview.open}
        title={preview.title}
        width={720}
        footer={null}
        destroyOnHidden
        onCancel={() => setPreview({ open: false, title: "" })}
      >
        {preview.url ? (
          <iframe
            title={preview.title}
            src={preview.url}
            style={{ width: "100%", aspectRatio: "9 / 16", maxHeight: "70vh", border: 0 }}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </Modal>

      <BatchUploadModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        dramaId={dramaId}
        existingNumbers={rows.map((row) => row.episode_number)}
      />

      <BatchUploadPill dramaId={dramaId} hidden={batchOpen} onOpen={() => setBatchOpen(true)} />
    </Space>
  );
}
