import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Form,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  AppstoreFilled,
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  FileTextFilled,
  PlusOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { useConfirm } from "../confirm";
import { useCanWriteContent } from "../me";
import { t } from "../copy";

type DramaRow = {
  id: number;
  title: string;
  cover_url: string;
  status: string;
  tags: { id: number; name_en: string; name_zh: string }[];
  free_episode_count: number;
  coin_price_per_episode: number;
  episode_count: number;
  play_count: number;
  updated_at: string | null;
};

function STATUS_LABELS(): Record<string, { text: string; color: string }> { return {
  draft: { text: t("common.draft"), color: "default" },
  in_review: { text: t("common.in_review"), color: "orange" },
  published: { text: t("common.published"), color: "green" },
  unpublished: { text: t("common.unpublished"), color: "red" },
};; }

/** 顶部统计条的顺序、配色与专属高亮背景配置 */
function STAT_CARDS(): {
  value?: string;
  label: string;
  color: string;
  activeBg: string;
  activeBorder: string;
  icon: React.ReactNode;
}[] { return [
  {
    label: t("dramas.all_dramas"),
    color: "#1677ff",
    activeBg: "#eff8ff",
    activeBorder: "#b2ddff",
    icon: <AppstoreFilled style={{ color: "#1677ff", fontSize: 14 }} />,
  },
  {
    value: "published",
    label: t("common.published"),
    color: "#12b76a",
    activeBg: "#edfcf2",
    activeBorder: "#a6f4c5",
    icon: <CheckCircleFilled style={{ color: "#12b76a", fontSize: 14 }} />,
  },
  {
    value: "in_review",
    label: t("common.in_review"),
    color: "#f79009",
    activeBg: "#fff9f0",
    activeBorder: "#fedf89",
    icon: <ClockCircleFilled style={{ color: "#f79009", fontSize: 14 }} />,
  },
  {
    value: "draft",
    label: t("common.draft"),
    color: "#667085",
    activeBg: "#f8f9fa",
    activeBorder: "#d0d5dd",
    icon: <FileTextFilled style={{ color: "#667085", fontSize: 14 }} />,
  },
  {
    value: "unpublished",
    label: t("common.unpublished"),
    color: "#f04438",
    activeBg: "#fef3f2",
    activeBorder: "#fecdca",
    icon: <CloseCircleFilled style={{ color: "#f04438", fontSize: 14 }} />,
  },
];; }

type StatusCounts = {
  all: number;
  draft: number;
  in_review: number;
  published: number;
  unpublished: number;
};

const EMPTY_COUNTS: StatusCounts = { all: 0, draft: 0, in_review: 0, published: 0, unpublished: 0 };

function StatCardItem({
  card,
  active,
  count,
  onClick,
}: {
  card: ReturnType<typeof STAT_CARDS>[number];
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        borderRadius: 10,
        padding: "12px 16px",
        background: active ? card.activeBg : "#fff",
        border: active ? `1.5px solid ${card.color}` : `1px solid ${hovered ? "#d0d5dd" : "#eaecf0"}`,
        boxShadow: active
          ? `0 2px 6px ${card.color}20`
          : hovered
          ? "0 4px 12px rgba(16,24,40,0.06)"
          : "0 1px 3px rgba(16,24,40,0.04)",
        transform: hovered && !active ? "translateY(-1px)" : "none",
        transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, color: active ? "#101828" : "#667085", fontWeight: active ? 600 : 500 }}>
          {card.label}
        </span>
        {card.icon}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.1,
            color: active ? card.color : "#101828",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
        <span style={{ fontSize: 12, color: "#98a2b3" }}>{t("common.dramas_unit")}</span>
      </div>
    </div>
  );
}

export default function Dramas() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DramaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // 正在切换上下架的那一行；同一时间只允许一个在途请求
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<{ title: string }>();
  const canWrite = useCanWriteContent();
  const { confirm, confirmModal } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await api<{ total: number; items: DramaRow[]; status_counts?: StatusCounts }>(
        `/admin/v1/dramas?${params.toString()}`
      );
      setRows(res.items);
      setTotal(res.total);
      if (res.status_counts) setCounts(res.status_counts);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * 列表内快速上下架。状态机只允许 published <-> unpublished 这两步互跳，
   * 草稿 / 审核中必须先走审核流程。
   */
  const togglePublish = async (row: DramaRow, next: boolean) => {
    const missing = next
      ? [!row.cover_url ? t("dramas.no_cover_yet") : null, row.episode_count === 0 ? t("dramaedit.no_episodes_yet") : null].filter(Boolean)
      : [];
    if (missing.length) {
      confirm({
        title: t("dramas.incomplete_title", {v0: row.title}),
        okText: t("dramas.publish_anyway"),
        cancelText: t("common.cancel"),
        content: (
          <Typography.Text>
            {t("dramas.publish_confirm_missing", {v0: missing.join("、")})}
          </Typography.Text>
        ),
        onOk: () => setPublishStatus(row, next),
      });
      return;
    }
    await setPublishStatus(row, next);
  };

  const setPublishStatus = async (row: DramaRow, next: boolean) => {
    const to_status = next ? "published" : "unpublished";
    setTogglingId(row.id);
    try {
      const res = await api<{ status: string }>(`/admin/v1/dramas/${row.id}/status`, {
        method: "POST",
        body: JSON.stringify({ to_status }),
      });
      message.success(
        t("dramas.publish_status_changed", {
          v0: row.title,
          v1: next ? t("episodespanel.publish") : t("drama.unpublish"),
        })
      );
      if (status) {
        await load();
      } else {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: res.status } : r)));
        setCounts((prev) => {
          const from = row.status as keyof StatusCounts;
          const to = res.status as keyof StatusCounts;
          if (from === to || !(from in prev) || !(to in prev)) return prev;
          return { ...prev, [from]: prev[from] - 1, [to]: prev[to] + 1 };
        });
      }
    } catch (e) {
      message.error(
        t("drama.status_action_failed", {
          v0: next ? t("episodespanel.publish") : t("drama.unpublish"),
          v1: errorText(e),
        })
      );
    } finally {
      setTogglingId(null);
    }
  };

  /** 新建剧集：只要求剧名，创建后跳入详情页继续编辑 */
  const onCreate = async (values: { title: string }) => {
    setCreating(true);
    try {
      const created = await api<{ id: number; title: string }>("/admin/v1/dramas", {
        method: "POST",
        body: JSON.stringify({ title: values.title.trim() }),
      });
      message.success(t("dramas.draft_created", {v0: created.id}));
      setCreateOpen(false);
      createForm.resetFields();
      navigate(`/dramas/${created.id}`);
    } catch (e) {
      message.error(t("dramas.create_failed", {v0: errorText(e)}));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        {/* 顶部指标卡栅格 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {STAT_CARDS().map((card) => {
            const active = (status ?? undefined) === card.value;
            const n = card.value ? counts[card.value as keyof StatusCounts] : counts.all;
            return (
              <StatCardItem
                key={card.label}
                card={card}
                active={active}
                count={n}
                onClick={() => {
                  setPage(1);
                  setStatus(card.value);
                }}
              />
            );
          })}
        </div>

        {/* 表格主卡片容器 */}
        <Card
          bordered
          styles={{ body: { padding: 0 } }}
          style={{
            borderRadius: 12,
            borderColor: "#eaecf0",
            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.05)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* 工具栏与快捷过滤 */}
          <div
            style={{
              padding: "16px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              borderBottom: "1px solid #eaecf0",
              background: "#fff",
            }}
          >
            <Space size={10} wrap align="center">
              {canWrite && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateOpen(true)}
                  style={{ fontWeight: 500 }}
                >
                  {t("dramas.create_drama")}
                </Button>
              )}
              <Select
                allowClear
                placeholder={t("common.all_status")}
                style={{ width: 160 }}
                value={status}
                onChange={(v) => {
                  setPage(1);
                  setStatus(v);
                }}
                options={Object.entries(STATUS_LABELS()).map(([value, { text }]) => ({ value, label: text }))}
              />
              <Input.Search
                placeholder={t("dramas.search_title_id")}
                style={{ width: 260 }}
                onSearch={(v) => {
                  setPage(1);
                  setQ(v);
                }}
                allowClear
              />
            </Space>
            <Space size={8}>
              <Tag
                bordered={false}
                style={{
                  background: "#f2f4f7",
                  color: "#475467",
                  borderRadius: 12,
                  padding: "2px 10px",
                  margin: 0,
                  fontSize: 12,
                }}
              >
                {t("dramas.current_filter")} <strong>{total}</strong> {t("common.dramas_unit")}
              </Tag>
            </Space>
          </div>

          {/* 剧集列表 Table */}
          <Table<DramaRow>
            rowKey="id"
            loading={loading}
            dataSource={rows}
            scroll={{ x: 1080 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total) => t("dramas.total_dramas", {v0: total}),
              style: { padding: "16px 20px", margin: 0 },
              onChange: (p, s) => {
                setPage(p);
                setPageSize(s);
              },
            }}
            columns={[
              {
                title: t("dramas.cover_id"),
                key: "cover",
                width: 124,
                render: (_, r) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {r.cover_url ? (
                      <Image
                        src={r.cover_url}
                        width={40}
                        height={54}
                        style={{
                          objectFit: "cover",
                          borderRadius: 6,
                          flexShrink: 0,
                          border: "1px solid rgba(0,0,0,0.08)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                        }}
                        preview={false}
                      />
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 54,
                          borderRadius: 6,
                          background: "#f2f4f7",
                          border: "1px dashed #d0d5dd",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#98a2b3",
                          fontSize: 10,
                          flexShrink: 0,
                        }}
                      >
                        {t("groups.no_cover")}
                      </div>
                    )}
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#475467",
                        background: "#f2f4f7",
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      #{r.id}
                    </span>
                  </div>
                ),
              },
              {
                title: t("dramas.title_tags"),
                key: "title",
                minWidth: 240,
                render: (_, r) => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Link
                      to={`/dramas/${r.id}`}
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "#101828",
                        lineHeight: 1.4,
                      }}
                    >
                      {r.title}
                    </Link>
                    {r.tags && r.tags.length > 0 ? (
                      <Space wrap size={4}>
                        {r.tags.map((t) => (
                          <Tag
                            key={t.id}
                            bordered={false}
                            style={{
                              fontSize: 11,
                              lineHeight: "18px",
                              padding: "0 6px",
                              background: "#f2f4f7",
                              color: "#475467",
                              borderRadius: 4,
                              margin: 0,
                            }}
                          >
                            {t.name_zh || t.name_en}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("dramas.no_tags")}
                      </Typography.Text>
                    )}
                  </div>
                ),
              },
              {
                title: t("common.status"),
                dataIndex: "status",
                width: 160,
                render: (s: string, r) => {
                  const meta = STATUS_LABELS()[s] ?? { text: s, color: "default" };
                  const checked = s === "published";
                  const toggleable = s === "published" || s === "unpublished";
                  const tip = !toggleable
                    ? s === "draft"
                      ? t("dramas.draft_tip")
                      : t("dramas.reviewing_tip")
                    : checked
                      ? t("dramas.unpublish_tip")
                      : t("dramas.republish_tip");
                  return (
                    <Space size={8} align="center">
                      <Tooltip title={canWrite ? tip : t("dramas.view_only_role")}>
                        <span style={{ display: "inline-flex" }}>
                          <Switch
                            size="small"
                            checked={checked}
                            disabled={!toggleable || !canWrite}
                            loading={togglingId === r.id}
                            style={checked ? { backgroundColor: "#12b76a" } : undefined}
                            onChange={(next) => togglePublish(r, next)}
                          />
                        </span>
                      </Tooltip>
                      <Tag
                        color={meta.color}
                        style={{
                          margin: 0,
                          borderRadius: 4,
                          fontWeight: 500,
                          fontSize: 12,
                          padding: "1px 8px",
                        }}
                      >
                        {meta.text}
                      </Tag>
                    </Space>
                  );
                },
              },
              {
                title: t("partnerdramaedit.free_episodes"),
                dataIndex: "free_episode_count",
                width: 96,
                render: (v: number) => (
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#344054", fontWeight: 500 }}>
                    {v} <span style={{ fontSize: 12, color: "#98a2b3" }}>{t("common.episodes_unit")}</span>
                  </span>
                ),
              },
              {
                title: t("partnerdramaedit.coins_per_episode"),
                dataIndex: "coin_price_per_episode",
                width: 96,
                render: (v: number) =>
                  v === 0 ? (
                    <Tag bordered={false} style={{ background: "#ecfdf3", color: "#027a48", borderRadius: 4, margin: 0 }}>
                      {t("dramas.free")}
                    </Tag>
                  ) : (
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "#d97706", fontWeight: 600 }}>
                      {v} <span style={{ fontSize: 12, color: "#98a2b3", fontWeight: 400 }}>{t("dramas.coins_suffix")}</span>
                    </span>
                  ),
              },
              {
                title: t("dramas.total_episodes"),
                dataIndex: "episode_count",
                width: 88,
                render: (v: number) => (
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#344054", fontWeight: 500 }}>
                    {v} <span style={{ fontSize: 12, color: "#98a2b3" }}>{t("common.episodes_unit")}</span>
                  </span>
                ),
              },
              {
                title: t("dramas.play_count"),
                dataIndex: "play_count",
                width: 92,
                render: (v: number) => (
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: v > 0 ? "#101828" : "#98a2b3",
                      fontWeight: v > 0 ? 600 : 400,
                    }}
                  >
                    {v.toLocaleString()}
                  </span>
                ),
              },
              {
                title: t("dramas.recently_updated"),
                dataIndex: "updated_at",
                width: 140,
                render: (v: string | null) => {
                  if (!v) return <span style={{ color: "#98a2b3" }}>-</span>;
                  const date = v.slice(0, 10);
                  const time = v.length >= 19 ? v.slice(11, 19) : "";
                  return (
                    <div style={{ lineHeight: 1.4, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      <div style={{ fontSize: 13, color: "#344054" }}>{date}</div>
                      {time && <div style={{ color: "#98a2b3", fontSize: 11 }}>{time}</div>}
                    </div>
                  );
                },
              },
              {
                title: t("common.actions"),
                key: "actions",
                width: 90,
                render: (_, r) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    style={{ fontWeight: 600, paddingInline: 4 }}
                    onClick={() => navigate(`/dramas/${r.id}`)}
                  >
                    {t("dramas.enter")}
                  </Button>
                ),
              },
            ]}
          />
        </Card>

        {/* 新建剧集弹窗 */}
        <Modal
          title={t("dramas.create_drama")}
          open={createOpen}
          okText={t("dramas.create_and_complete")}
          cancelText={t("common.cancel")}
          confirmLoading={creating}
          onCancel={() => {
            setCreateOpen(false);
            createForm.resetFields();
          }}
          onOk={() => createForm.submit()}
          destroyOnClose
          width={500}
        >
          <Form form={createForm} layout="vertical" onFinish={onCreate} preserve={false} style={{ marginTop: 12 }}>
            <Form.Item
              label={t("common.drama_name")}
              name="title"
              rules={[
                { required: true, whitespace: true, message: t("dramas.enter_title") },
                { max: 200, message: t("dramas.title_max_length") },
              ]}
            >
              <Input
                size="large"
                maxLength={200}
                showCount
                autoFocus
                placeholder={t("dramas.title_example")}
              />
            </Form.Item>
            <Alert
              type="info"
              showIcon
              message={t("dramas.draft_notice")}
              description={t("dramas.create_flow")}
              style={{ borderRadius: 8, background: "#fafbfd", border: "1px solid #d0d5dd" }}
            />
          </Form>
        </Modal>
      </Space>

      {/* 自定义确认弹框 */}
      {confirmModal}
    </>
  );
}
