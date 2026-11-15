import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  LinkOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api, errorText } from "../api";
import EpisodesPanel from "./EpisodesPanel";
import { PublishPanel } from "./StagePages";
import { DramaGroupsPanel } from "./Groups";
import { t } from "../copy";

type Drama = {
  id: number;
  title: string;
  synopsis: string;
  cover_url: string;
  status: string;
  free_episode_count: number;
  coin_price_per_episode: number;
  tags: { id: number; name_en: string; name_zh: string }[];
  episode_count: number;
};

type TagOption = { id: number; name_en: string; name_zh: string; status: string; drama_count: number };

function STATUS_LABELS(): Record<string, { text: string; color: string }> { return {
  draft: { text: t("common.draft"), color: "default" },
  in_review: { text: t("common.in_review"), color: "orange" },
  published: { text: t("common.published"), color: "green" },
  unpublished: { text: t("common.unpublished"), color: "red" },
};; }

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COVER_W = 200;
const COVER_H = 266;

export default function DramaEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [drama, setDrama] = useState<Drama | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState<null | "upload" | "delete">(null);
  const [dirty, setDirty] = useState(false);
  const [urlEditing, setUrlEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [coverUrl, setCoverUrl] = useState("");
  // 上架流程清单需要知道有多少集已经真正上传了视频
  const [episodeStats, setEpisodeStats] = useState<{ total: number; uploaded: number } | null>(null);

  const load = useCallback(async () => {
    const [d, t] = await Promise.all([
      api<Drama>(`/admin/v1/dramas/${id}`),
      api<{ items: TagOption[] }>("/admin/v1/tags"),
    ]);
    setDrama(d);
    setCoverUrl(d.cover_url ?? "");
    setTagOptions(t.items);
    form.setFieldsValue({
      title: d.title,
      synopsis: d.synopsis,
      cover_url: d.cover_url,
      free_episode_count: d.free_episode_count,
      coin_price_per_episode: d.coin_price_per_episode,
      tag_ids: d.tags.map((x) => x.id),
    });
    setDirty(false);
  }, [id, form]);

  useEffect(() => {
    load().catch((e) => message.error(t("dramaedit.load_failed", {v0: errorText(e)})));
  }, [load]);

  const loadEpisodeStats = useCallback(async () => {
    try {
      const res = await api<{ items: { bunny_video_id: string | null }[] }>(
        `/admin/v1/dramas/${id}/episodes?page_size=200`
      );
      setEpisodeStats({
        total: res.items.length,
        uploaded: res.items.filter((e) => e.bunny_video_id).length,
      });
    } catch {
      setEpisodeStats(null);
    }
  }, [id]);

  // 切换 Tab 时重新盘点（分集页可能刚登记/上传过）
  useEffect(() => {
    loadEpisodeStats();
  }, [loadEpisodeStats, activeTab]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const onSave = async (values: any) => {
    setSaving(true);
    try {
      await api(`/admin/v1/dramas/${id}`, { method: "PATCH", body: JSON.stringify(values) });
      message.success(t("common.saved"));
      setDirty(false);
      await load();
    } catch (e: any) {
      message.error(t("stagepages.save_failed", {v0: errorText(e)}));
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    setCoverBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await api<{ cover_url: string }>(`/admin/v1/dramas/${id}/cover`, {
        method: "POST",
        body: fd,
      });
      form.setFieldValue("cover_url", res.cover_url);
      setCoverUrl(res.cover_url);
      setDrama((d) => (d ? { ...d, cover_url: res.cover_url } : d));
      setUrlEditing(false);
      message.success(t("partnerdramaedit.cover_updated"));
    } catch (e: any) {
      message.error(t("dramaedit.cover_upload_failed", {v0: errorText(e)}));
    } finally {
      setCoverBusy(null);
    }
  };

  const beforeUpload: UploadProps["beforeUpload"] = (file) => {
    const okType =
      COVER_TYPES.includes(file.type || "") || /\.(jpe?g|png|webp)$/i.test(file.name || "");
    if (!okType) {
      message.error(t("dramaedit.cover_format_only"));
      return Upload.LIST_IGNORE;
    }
    if (file.size > COVER_MAX_BYTES) {
      message.error(t("dramaedit.cover_size_limit"));
      return Upload.LIST_IGNORE;
    }
    void uploadCover(file as unknown as File);
    return Upload.LIST_IGNORE;
  };

  const removeCover = async () => {
    setCoverBusy("delete");
    try {
      await api(`/admin/v1/dramas/${id}/cover`, { method: "DELETE" });
      form.setFieldValue("cover_url", "");
      setCoverUrl("");
      setDrama((d) => (d ? { ...d, cover_url: "" } : d));
      message.success(t("dramaedit.cover_deleted"));
    } catch (e: any) {
      message.error(t("dramaedit.cover_delete_failed", {v0: errorText(e)}));
    } finally {
      setCoverBusy(null);
    }
  };

  if (!drama) {
    return (
      <Card loading>
        <div style={{ height: 320 }} />
      </Card>
    );
  }

  const statusMeta = STATUS_LABELS()[drama.status] ?? { text: drama.status, color: "default" };

  // ---- 上架流程：基本信息 → 登记分集 → 上传视频 → 提交上架 ----
  const uploadedCount = episodeStats?.uploaded ?? 0;
  const basicsReady = Boolean(drama.cover_url && drama.synopsis?.trim());
  const videosReady = drama.episode_count > 0 && uploadedCount >= drama.episode_count;
  const issues = [
    !drama.cover_url ? t("dramaedit.no_cover_uploaded") : null,
    !drama.synopsis?.trim() ? t("dramaedit.no_synopsis") : null,
    drama.episode_count === 0
      ? t("dramaedit.no_episodes_registered")
      : !videosReady
        ? t("dramaedit.episodes_missing_video", {v0: drama.episode_count - uploadedCount})
        : null,
  ].filter((value): value is string => value !== null);

  const flowSteps = [
    {
      key: "info",
      title: t("episodespanel.basic_info"),
      desc: basicsReady ? t("dramaedit.basics_done") : t("dramaedit.fill_basics"),
      done: basicsReady,
    },
    {
      key: "episodes",
      title: t("dramaedit.register_episodes"),
      desc: drama.episode_count > 0 ? t("dramaedit.episode_count_text", {v0: drama.episode_count}) : t("dramaedit.no_episodes_yet"),
      done: drama.episode_count > 0,
    },
    {
      key: "episodes",
      title: t("dramaedit.upload_videos"),
      desc:
        drama.episode_count > 0
          ? t("dramaedit.episodes_uploaded", {v0: uploadedCount, v1: drama.episode_count})
          : t("dramaedit.register_episodes_first"),
      done: videosReady,
    },
    {
      key: "publish",
      title: t("dramaedit.submit_publish"),
      desc: t("dramaedit.submit_review_publish"),
      done: drama.status === "published",
    },
  ];
  const nextStepIndex = flowSteps.findIndex((step) => !step.done);

  const uploadProps: UploadProps = {
    accept: "image/jpeg,image/png,image/webp",
    showUploadList: false,
    beforeUpload,
    disabled: coverBusy !== null,
  };

  const infoTab = (
    <Card styles={{ body: { padding: 24 } }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        onValuesChange={() => setDirty(true)}
        requiredMark="optional"
      >
        {/* cover_url is edited through the cover panel; keep it in the form so saves carry it */}
        <Form.Item name="cover_url" hidden>
          <Input />
        </Form.Item>

        <Row gutter={[40, 24]}>
          <Col xs={24} md={8} lg={7}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Typography.Text strong>{t("partnerdramaedit.cover")}</Typography.Text>
              <div style={{ width: COVER_W, maxWidth: "100%" }}>
                <Upload {...uploadProps}>
                  <div
                    style={{
                      position: "relative",
                      width: COVER_W,
                      maxWidth: "100%",
                      height: COVER_H,
                      borderRadius: 12,
                      overflow: "hidden",
                      border: coverUrl ? "1px solid #f0f0f0" : "1px dashed #d9d9d9",
                      background: "#fafafa",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: coverBusy ? "wait" : "pointer",
                    }}
                  >
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={t("partnerdramaedit.cover_preview")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <Space direction="vertical" align="center" size={6} style={{ opacity: 0.55 }}>
                        <PictureOutlined style={{ fontSize: 30 }} />
                        <Typography.Text type="secondary">{t("dramaedit.click_upload_cover")}</Typography.Text>
                      </Space>
                    )}
                    {coverBusy === "upload" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(255,255,255,0.7)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Spin />
                      </div>
                    )}
                  </div>
                </Upload>

                <Space style={{ marginTop: 12 }} wrap>
                  <Upload {...uploadProps}>
                    <Button
                      size="small"
                      icon={<UploadOutlined />}
                      loading={coverBusy === "upload"}
                      disabled={coverBusy !== null}
                    >
                      {coverUrl ? t("partnerdramaedit.replace") : t("common.upload")}
                    </Button>
                  </Upload>
                  <Popconfirm
                    title={t("dramaedit.delete_cover")}
                    description={t("dramaedit.delete_cover_confirm")}
                    okText={t("common.delete")}
                    cancelText={t("common.cancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={removeCover}
                    disabled={!coverUrl}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={coverBusy === "delete"}
                      disabled={!coverUrl || coverBusy !== null}
                    >
                      {t("common.delete")}
                    </Button>
                  </Popconfirm>
                </Space>

                <div style={{ marginTop: 10 }}>
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    style={{ paddingLeft: 0 }}
                    disabled={coverBusy !== null}
                    onClick={() => {
                      if (!urlEditing) setUrlDraft(coverUrl);
                      setUrlEditing(!urlEditing);
                    }}
                  >
                    {urlEditing ? t("dramaedit.collapse_url_register") : t("dramaedit.register_by_url")}
                  </Button>
                  {urlEditing && (
                    <Input.Search
                      style={{ width: COVER_W, maxWidth: "100%" }}
                      placeholder="https://cdn.example/cover.jpg"
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      enterButton={t("dramaedit.apply")}
                      onSearch={(v) => {
                        form.setFieldValue("cover_url", v.trim());
                        setCoverUrl(v.trim());
                        setDirty(true);
                        setUrlEditing(false);
                      }}
                    />
                  )}
                </div>

                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
                  {t("dramaedit.cover_requirements")}
                </Typography.Paragraph>
              </div>
            </Space>
          </Col>

          <Col xs={24} md={16} lg={17}>
            <Form.Item
              label={t("common.drama_name")}
              name="title"
              rules={[{ required: true, message: t("partnerdramaedit.drama_name_required") }]}
              style={{ maxWidth: 480 }}
            >
              <Input maxLength={200} showCount placeholder={t("dramaedit.enter_drama_title")} />
            </Form.Item>

            <Form.Item label={t("drama.synopsis")} name="synopsis">
              <Input.TextArea rows={6} maxLength={20000} showCount placeholder={t("dramaedit.enter_synopsis")} />
            </Form.Item>

            <Form.Item label={t("partnerdramaedit.tags")} name="tag_ids" style={{ maxWidth: 640 }}>
              <Select
                mode="multiple"
                placeholder={t("dramaedit.select_tags")}
                allowClear
                optionFilterProp="label"
                options={tagOptions.map((t) => ({
                  value: t.id,
                  label: `${t.name_zh || t.name_en}（${t.name_en}）`,
                }))}
              />
            </Form.Item>

            <Row gutter={24} style={{ maxWidth: 640 }}>
              <Col span={12}>
                <Form.Item
                  label={t("partnerdramaedit.free_episodes")}
                  name="free_episode_count"
                  tooltip={t("dramaedit.free_episodes_tip")}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={t("partnerdramaedit.coins_per_episode")}
                  name="coin_price_per_episode"
                  tooltip={t("dramaedit.coins_per_episode_tip")}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: "8px 0 16px" }} />

            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                {t("common.save")}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                disabled={!dirty || saving}
                onClick={() => load().catch((e) => message.error(t("dramaedit.reset_failed", {v0: errorText(e)})))}
              >
                {t("partnerdramaedit.reset")}
              </Button>
              {dirty && <Typography.Text type="warning">{t("partnerdramaedit.unsaved_changes")}</Typography.Text>}
            </Space>
          </Col>
        </Row>
      </Form>
    </Card>
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card styles={{ body: { padding: "16px 24px" } }}>
        <Space wrap size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/dramas")}>
            {t("partnerdramaedit.back_to_list")}
          </Button>
          <Divider type="vertical" style={{ height: 24 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {drama.title}
          </Typography.Title>
          <Tag color={statusMeta.color}>{statusMeta.text}</Tag>
          <Typography.Text type="secondary">
            ID #{drama.id} · {drama.episode_count} {t("common.episodes_unit")}
          </Typography.Text>
        </Space>
      </Card>

      {drama.status !== "published" && (
        <Card
          size="small"
          title={t("partnerdramaedit.publish_flow")}
          extra={
            nextStepIndex >= 0 ? (
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => setActiveTab(flowSteps[nextStepIndex].key)}
              >
                {t("drama.complete_next_step", {v0: flowSteps[nextStepIndex].title})}
              </Button>
            ) : null
          }
        >
          <Steps
            size="small"
            current={nextStepIndex === -1 ? flowSteps.length : nextStepIndex}
            items={flowSteps.map((step, index) => ({
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
          { key: "episodes", label: t("drama.episodes"), children: <EpisodesPanel dramaId={id!} /> },
          { key: "groups", label: t("groups.home_groups"), children: <DramaGroupsPanel dramaId={id!} /> },
          {
            key: "publish",
            label: t("dramaedit.publish_unpublish"),
            children: (
              <PublishPanel
                dramaId={id!}
                dramaTitle={drama.title}
                episodeCount={drama.episode_count}
                status={drama.status}
                issues={issues}
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
