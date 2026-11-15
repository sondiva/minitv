import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { useLoad, formatTime } from "../hooks";
import {
  MAX_UPLOAD_BYTES,
  type UploadSession,
  directUpload,
  formatDuration,
  formatFileSize,
  probeVideo,
} from "./episodeUpload";
import { partnerStage, partnerStageColor } from "./partnerStage";
import { t } from "../copy";

type Episode = {
  id: number;
  episode_number: number;
  title: string;
  status: string;
  upload_status: string | null;
  duration_seconds: number;
  size_bytes: number;
  /** Server-side flag: only an episode with a Bunny video can be previewed. */
  has_video?: boolean;
};

type EpisodePreview = {
  open: boolean;
  /** Bunny iframe embed URL; absent while signing or after a failure. */
  url?: string;
  title: string;
};

type Drama = {
  id: number;
  title: string;
  synopsis: string;
  cover_url: string;
  status: string;
  review_state: string;
  review_note: string | null;
  free_episode_count: number;
  coin_price_per_episode: number;
  episode_count: number;
  editable: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
  episodes: Episode[];
  tag_ids: number[];
};

function EPISODE_STATUS(): Record<string, { text: string; color?: string }> { return {
  not_uploaded: { text: t("partnerdramaedit.pending_upload") },
  transcoding: { text: t("episodespanel.transcoding"), color: "orange" },
  transcode_failed: { text: t("episodespanel.transcode_failed"), color: "red" },
  in_review: { text: t("partnerdramaedit.ready"), color: "green" },
  published: { text: t("common.published"), color: "green" },
  unpublished: { text: t("common.unpublished") },
};; }

const COVER_W = 168;
const COVER_H = 224;

export default function PartnerDramaEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dramaId = Number(id);

  const { data: drama, reload, loading } = useLoad<Drama | null>(
    `/partner/v1/dramas/${dramaId}`,
    null,
    { enabled: Number.isFinite(dramaId) }
  );
  const { data: tags } = useLoad<{ items: { id: number; name_zh: string }[] }>(
    "/partner/v1/tags",
    { items: [] }
  );

  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState("info");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [episodeForm] = Form.useForm();
  const [editing, setEditing] = useState<Episode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<EpisodePreview>({ open: false, title: "" });
  const closePreview = () => setPreview({ open: false, title: "" });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<number | null>(null);

  useEffect(() => {
    if (uploadingId === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingId]);

  const floor = drama ? Math.min(5, drama.episode_count) : 0;
  const coverUrl = drama?.cover_url ?? "";

  useEffect(() => {
    if (!drama) return;
    const cap = Math.max(drama.episode_count, 1);
    form.setFieldsValue({
      title: drama.title,
      synopsis: drama.synopsis,
      free_episode_count: Math.min(drama.free_episode_count, cap),
      tag_ids: drama.tag_ids ?? [],
    });
    setDirty(false);
  }, [drama, form]);

  const tagOptions = useMemo(
    () => tags.items.map((tag) => ({ value: tag.id, label: tag.name_zh })),
    [tags.items]
  );

  const save = async (silent = false) => {
    if (!drama) return true;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api(`/partner/v1/dramas/${drama.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: values.title,
          synopsis: values.synopsis,
          free_episode_count: values.free_episode_count,
          tag_ids: values.tag_ids ?? [],
        }),
      });
      setDirty(false);
      if (!silent) message.success(t("common.saved"));
      await reload();
      return true;
    } catch (e) {
      message.error(errorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!drama) return;
    const free = Number(form.getFieldValue("free_episode_count") ?? 0);
    if (drama.episode_count > 0 && free > drama.episode_count) {
      message.error(t("partnerdramaedit.free_exceeds_total", {v0: drama.episode_count}));
      return;
    }
    if (dirty) {
      const ok = await save(true);
      if (!ok) return;
    }
    Modal.confirm({
      title: t("drama.submit_review"),
      content: t("partnerdramaedit.submit_locked_confirm"),
      okText: t("partnerdramaedit.submit"),
      onOk: async () => {
        setSubmitting(true);
        try {
          await api(`/partner/v1/dramas/${drama.id}/submit`, { method: "POST" });
          message.success(t("partnerdramaedit.submitted_waiting"));
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const removeDrama = () => {
    if (!drama) return;
    Modal.confirm({
      title: t("partnerdramaedit.delete_drama_confirm", {v0: drama.title}),
      content: t("partnerdramaedit.delete_draft_only"),
      okText: t("common.delete"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/partner/v1/dramas/${drama.id}`, { method: "DELETE" });
          message.success(t("common.deleted"));
          navigate("/partner/dramas");
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const uploadCover = async (file: File) => {
    if (!drama) return;
    if (file.size > 5 * 1024 * 1024) {
      message.error(t("partnerdramaedit.cover_over_5mb"));
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setCoverBusy(true);
    try {
      await api(`/partner/v1/dramas/${drama.id}/cover`, { method: "POST", body });
      message.success(t("partnerdramaedit.cover_updated"));
      await reload();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setCoverBusy(false);
    }
  };

  const addEpisode = async (values: any) => {
    if (!drama) return;
    try {
      await api(`/partner/v1/dramas/${drama.id}/episodes`, {
        method: "POST",
        body: JSON.stringify({
          episode_number: values.episode_number,
          title: (values.title ?? "").trim(),
        }),
      });
      setEpisodeOpen(false);
      episodeForm.resetFields();
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const openPreview = async (episode: Episode) => {
    try {
      const signed = await api<{ url: string; embed_url?: string }>(
        `/partner/v1/episodes/${episode.id}/preview-url`
      );
      setPreview({
        open: true,
        url: signed.embed_url ?? signed.url,
        title: t("drama.preview_episode", {v0: episode.episode_number}),
      });
    } catch (e) {
      message.error(t("stagepages.preview_failed", {v0: errorText(e)}));
    }
  };

  const openEdit = (episode: Episode) => {
    setEditing(episode);
    editForm.setFieldsValue({ episode_number: episode.episode_number, title: episode.title });
    setEditOpen(true);
  };

  const saveEpisode = async (values: any) => {
    if (!editing) return;
    try {
      await api(`/partner/v1/episodes/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          episode_number: values.episode_number,
          title: (values.title ?? "").trim(),
        }),
      });
      setEditOpen(false);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const removeEpisode = (episode: Episode) => {
    Modal.confirm({
      title: t("partnerdramaedit.delete_episode_confirm", {v0: episode.episode_number}),
      content: t("partnerdramaedit.delete_episode_only"),
      okText: t("common.delete"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/partner/v1/episodes/${episode.id}`, { method: "DELETE" });
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const pickFile = (episode: Episode) => {
    uploadTarget.current = episode.id;
    fileRef.current?.click();
  };

  const pollStatus = async (episodeId: number) => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      try {
        const res = await api<{ status: string }>(
          `/partner/v1/episodes/${episodeId}/upload-status`
        );
        if (res.status !== "transcoding") return res.status;
      } catch {
        /* keep polling: bytes are already at Bunny */
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return "transcoding";
  };

  const onFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const episodeId = uploadTarget.current;
    if (!file || !episodeId || !drama) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      message.error(t("partnerdramaedit.single_video_limit"));
      return;
    }
    setUploadingId(episodeId);
    setProgress(0);
    try {
      const meta = await probeVideo(file);
      const session = await api<UploadSession>(
        `/partner/v1/episodes/${episodeId}/upload-session`,
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            mime: file.type || "video/mp4",
            size_bytes: file.size,
            width: meta.width,
            height: meta.height,
            duration_seconds: meta.durationSeconds,
          }),
        }
      );
      await directUpload(session, file, setProgress, () => undefined);
      message.info(t("partnerdramaedit.uploaded_waiting_transcode"));
      const final = await pollStatus(episodeId);
      if (final === "transcode_failed") message.error(t("partnerdramaedit.transcode_failed_retry"));
      else if (final === "in_review") message.success(t("partnerdramaedit.episode_ready_submit"));
      else message.info(t("partnerdramaedit.bunny_transcoding_refresh"));
      await reload();
    } catch (e) {
      // Release the session server-side: create_upload_session already moved
      // the episode to transcoding, so a silent abort would look like a
      // never-ending transcode and block retries.
      try {
        await api(`/partner/v1/episodes/${episodeId}/upload-failed`, { method: "POST" });
      } catch {
        /* the stale sweeper will catch it */
      }
      message.error(errorText(e));
      await reload();
    } finally {
      setUploadingId(null);
      setProgress(0);
    }
  };

  const cancelUpload = async (episode: Episode) => {
    try {
      const res = await api<{ updated?: boolean; status: string }>(
        `/partner/v1/episodes/${episode.id}/upload-failed`,
        { method: "POST" }
      );
      if (res.updated === false) message.info(t("partnerdramaedit.file_already_uploaded"));
      else message.success(t("partnerdramaedit.cancelled_reupload"));
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  if (loading && !drama) return <Card loading />;
  if (!drama) return <Alert type="error" message={t("partnerdramaedit.drama_not_found")} />;

  const readyEpisodes = drama.episodes.filter((item) => item.status === "in_review").length;
  const steps = [
    {
      title: t("episodespanel.basic_info"),
      desc: t("partnerdramaedit.cover_synopsis_chars"),
      done: Boolean(coverUrl) && (drama.synopsis || "").trim().length >= 30,
    },
    {
      title: t("drama.episodes"),
      desc: t("partnerdramaedit.at_least_one_ready", {v0: readyEpisodes, v1: drama.episode_count}),
      done: drama.episode_count > 0 && drama.episodes.every((e) => e.status === "in_review"),
    },
    {
      title: t("drama.submit_review"),
      desc: drama.review_state === "pending" ? t("partnerdramaedit.ops_reviewing") : t("partnerdramaedit.waiting_submit"),
      done: ["pending", "approved", "rejected"].includes(drama.review_state),
    },
    {
      title: t("episodespanel.publish"),
      desc: drama.status === "published" ? t("common.published") : t("partnerdramaedit.ops_arrange"),
      done: drama.status === "published",
    },
  ];
  const nextStepIndex = steps.findIndex((step) => !step.done);
  const stageTag = (
    <Tag color={partnerStageColor(drama.status, drama.review_state)}>
      {partnerStage(drama.status, drama.review_state)}
    </Tag>
  );

  const infoTab = (
    <Card styles={{ body: { padding: 24 } }}>
      <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
        <Row gutter={[40, 24]}>
          <Col xs={24} md={8} lg={7}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Typography.Text strong>{t("partnerdramaedit.cover")}</Typography.Text>
              <div style={{ width: COVER_W, maxWidth: "100%" }}>
                <div
                  style={{
                    position: "relative",
                    width: COVER_W,
                    height: COVER_H,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: coverUrl ? "1px solid #f0f0f0" : "1px dashed #d9d9d9",
                    background: "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={t("partnerdramaedit.cover_preview")}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <Typography.Text type="secondary">{t("partnerdramaedit.no_cover")}</Typography.Text>
                  )}
                </div>
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  style={{ marginTop: 12 }}
                  loading={coverBusy}
                  disabled={!drama.editable}
                  onClick={() => document.getElementById("partner-cover-input")?.click()}
                >
                  {coverUrl ? t("partnerdramaedit.replace_cover") : t("partnerdramaedit.upload_cover")}
                </Button>
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}
                >
                  {t("partnerdramaedit.cover_format_hint")}
                </Typography.Paragraph>
              </div>
            </Space>
            <input
              id="partner-cover-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) uploadCover(file);
              }}
            />
          </Col>

          <Col xs={24} md={16} lg={17}>
            <Form.Item
              label={t("common.drama_name")}
              name="title"
              rules={[{ required: true, message: t("partnerdramaedit.drama_name_required") }]}
              style={{ maxWidth: 480 }}
            >
              <Input maxLength={200} showCount disabled={!drama.editable} />
            </Form.Item>
            <Form.Item label={t("drama.synopsis")} name="synopsis">
              <Input.TextArea
                rows={6}
                maxLength={5000}
                showCount
                disabled={!drama.editable}
                placeholder={t("partnerdramaedit.synopsis_min_chars")}
              />
            </Form.Item>
            <Form.Item label={t("partnerdramaedit.tags")} name="tag_ids" style={{ maxWidth: 640 }}>
              <Select
                mode="multiple"
                allowClear
                disabled={!drama.editable}
                options={tagOptions}
                placeholder={t("partnerdramaedit.select_from_tag_library")}
                optionFilterProp="label"
              />
            </Form.Item>
            <Row gutter={24} style={{ maxWidth: 640 }}>
              <Col span={12}>
                <Form.Item
                  label={t("partnerdramaedit.free_episodes")}
                  name="free_episode_count"
                  extra={t("partnerdramaedit.free_episode_range", {v0: floor, v1: drama.episode_count || 5})}
                >
                  <InputNumber
                    min={0}
                    max={Math.max(drama.episode_count, 1)}
                    disabled={!drama.editable}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={t("partnerdramaedit.coins_per_episode")} extra={t("partnerdramaedit.platform_pricing")}>
                  <Input value={t("partnerdramaedit.coins_value", {v0: drama.coin_price_per_episode})} disabled />
                </Form.Item>
              </Col>
            </Row>
            {drama.editable && (
              <Space>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={() => save()}
                >
                  {t("common.save")}
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  disabled={!dirty || saving}
                  onClick={() => reload()}
                >
                  {t("partnerdramaedit.reset")}
                </Button>
                {dirty && <Typography.Text type="warning">{t("partnerdramaedit.unsaved_changes")}</Typography.Text>}
              </Space>
            )}
          </Col>
        </Row>
      </Form>
    </Card>
  );

  const episodesTab = (
    <Card
      styles={{ body: { padding: 24 } }}
      title={t("partnerdramaedit.episodes_count_title", {v0: drama.episode_count})}
      extra={
        <Button disabled={!drama.editable} onClick={() => setEpisodeOpen(true)}>
          {t("partnerdramaedit.add_episode")}
        </Button>
      }
    >
      <Table<Episode>
        rowKey="id"
        size="middle"
        pagination={false}
        dataSource={drama.episodes}
        locale={{ emptyText: t("partnerdramaedit.no_episodes_hint") }}
        columns={[
          { title: t("common.episodes_unit"), dataIndex: "episode_number", width: 70 },
          { title: t("common.title"), dataIndex: "title" },
          {
            title: t("common.status"),
            key: "status",
            width: 120,
            render: (_, row) => {
              if (uploadingId === row.id) return <Tag color="blue">{t("batchuploadpanel.uploading")} {progress}%</Tag>;
              if (row.status === "transcoding" && row.upload_status === "created") {
                return <Tag color="blue">{t("partnerdramaedit.waiting_upload_done")}</Tag>;
              }
              const meta = EPISODE_STATUS()[row.status] ?? { text: row.status };
              return <Tag color={meta.color}>{meta.text}</Tag>;
            },
          },
          {
            title: t("episodespanel.duration"),
            dataIndex: "duration_seconds",
            width: 80,
            render: (value: number) => formatDuration(value),
          },
          {
            title: t("partnerdramaedit.size"),
            dataIndex: "size_bytes",
            width: 90,
            render: (value: number) => (value ? formatFileSize(value) : "-"),
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 230,
            render: (_, row) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  disabled={!row.has_video}
                  onClick={() => openPreview(row)}
                >
                  {t("common.preview")}
                </Button>
                <Button
                  type="link"
                  size="small"
                  disabled={!drama.editable || uploadingId !== null}
                  onClick={() => pickFile(row)}
                >
                  {row.status === "not_uploaded" ? t("common.upload") : t("partnerdramaedit.replace")}
                </Button>
                {row.status === "transcoding" && row.upload_status === "created" && (
                  <Button
                    type="link"
                    size="small"
                    danger
                    disabled={uploadingId !== null}
                    onClick={() => cancelUpload(row)}
                  >
                    {t("episodespanel.cancel_upload")}
                  </Button>
                )}
                <Button
                  type="link"
                  size="small"
                  disabled={!drama.editable}
                  onClick={() => openEdit(row)}
                >
                  {t("common.edit")}
                </Button>
                {row.status === "not_uploaded" && (
                  <Button type="link" size="small" danger onClick={() => removeEpisode(row)}>
                    {t("common.delete")}
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      {uploadingId !== null && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          <Progress percent={progress} size="small" />
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime"
        style={{ display: "none" }}
        onChange={onFilePicked}
      />
    </Card>
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card styles={{ body: { padding: "16px 24px" } }}>
        <Space wrap size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/partner/dramas")}>
            {t("partnerdramaedit.back_to_list")}
          </Button>
          <Divider type="vertical" style={{ height: 24 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {drama.title}
          </Typography.Title>
          {stageTag}
          <Typography.Text type="secondary">
            ID #{drama.id} · {drama.episode_count} {t("common.episodes_unit")}
          </Typography.Text>
          <span style={{ flex: 1 }} />
          {drama.editable && (
            <Button danger icon={<DeleteOutlined />} onClick={removeDrama}>
              {t("partnerdramaedit.delete_draft")}
            </Button>
          )}
          <Button onClick={submit} loading={submitting} disabled={!drama.editable}>
            {t("drama.submit_review")}
          </Button>
        </Space>
      </Card>

      {drama.review_note && (
        <Alert type="error" showIcon message={t("partnerdramaedit.reject_reason", {v0: drama.review_note})} />
      )}
      {!drama.editable && (
        <Alert
          type="info"
          showIcon
          message={
            drama.review_state === "pending"
              ? t("partnerdramaedit.submitted_locked")
              : t("partnerdramaedit.locked_after_approval")
          }
        />
      )}

      {drama.status !== "published" && (
        <Card
          size="small"
          title={t("partnerdramaedit.publish_flow")}
          extra={
            nextStepIndex >= 0 ? (
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => setActiveTab(nextStepIndex === 1 ? "episodes" : "info")}
              >
                {t("drama.complete_next_step", {v0: steps[nextStepIndex].title})}
              </Button>
            ) : null
          }
        >
          <Steps
            size="small"
            current={nextStepIndex === -1 ? steps.length : nextStepIndex}
            items={steps.map((step, index) => ({
              title: step.title,
              description: step.desc,
              status: step.done ? "finish" : index === nextStepIndex ? "process" : "wait",
            }))}
          />
        </Card>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "info", label: t("episodespanel.basic_info"), children: infoTab },
          { key: "episodes", label: t("drama.episodes"), children: episodesTab },
        ]}
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("partnerdrama.submit_requirements", {v0: floor})}
      </Typography.Text>

      <Modal
        title={t("partnerdramaedit.add_episode_btn")}
        open={episodeOpen}
        onCancel={() => setEpisodeOpen(false)}
        onOk={() => episodeForm.submit()}
        okText={t("partnerdramaedit.add")}
        forceRender
      >
        <Form form={episodeForm} layout="vertical" onFinish={addEpisode} preserve={false}>
          <Form.Item label={t("partnerdramaedit.episode_number")} name="episode_number" extra={t("partnerdramaedit.blank_auto_increment")}>
            <InputNumber min={1} max={300} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label={t("common.title")} name="title" extra={t("partnerdramaedit.blank_auto_title")}>
            <Input maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? t("episodespanel.edit_episode_number", {v0: editing.episode_number}) : t("partnerdramaedit.edit_episode")}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        okText={t("common.save")}
        forceRender
      >
        <Form form={editForm} layout="vertical" onFinish={saveEpisode} preserve={false}>
          <Form.Item label={t("partnerdramaedit.episode_number")} name="episode_number" rules={[{ required: true }]}>
            <InputNumber min={1} max={300} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label={t("common.title")} name="title" rules={[{ required: true, message: t("episodespanel.enter_title") }]}>
            <Input maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={preview.open}
        title={preview.title}
        footer={null}
        width={460}
        centered
        destroyOnHidden
        onCancel={closePreview}
        styles={{ body: { padding: 0, background: "#000" } }}
      >
        {preview.url ? (
          <iframe
            src={preview.url}
            title="episode preview"
            style={{ display: "block", width: "100%", height: "74vh", border: 0, background: "#000" }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </Modal>
    </Space>
  );
}
