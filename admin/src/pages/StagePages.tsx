import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  AppstoreFilled,
  CalendarOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  DollarOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  StopOutlined,
  ThunderboltOutlined,
  TrophyFilled,
  UserAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ApiError, api, errorText } from "../api";
import { useConfirm } from "../confirm";
import { useIsAdmin } from "../me";
import { t } from "../copy";

function useLoad<T>(path: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    setLoading(true);
    return api<T>(path)
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch((e) => {
        const text = errorText(e);
        setError(text);
        message.error(text);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return { data, reload, loading, error };
}

/** ISO-8601 from the API -> local "YYYY-MM-DD HH:mm" for table cells. */
function formatTime(value?: string | null) {
  if (!value) return "-";
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

type DashboardMetric = {
  day: string;
  active_users: number;
  new_users: number;
  plays: number;
  completes: number;
  paid_orders: number;
  revenue_cents: number;
  coin_spend: number;
  unlock_count: number;
  completion_rate: number;
};

type Dashboard = Partial<DashboardMetric> & {
  timezone?: string;
  window?: { start: string; end: string; days: number };
  trend?: DashboardMetric[];
  previous?: Partial<DashboardMetric>;
  top_dramas?: { id: number; title: string; plays: number; completes: number; completion_rate: number }[];
  overview?: Record<string, number>;
  recent_orders?: { order_no: string; user_id: number; amount_cents: number; currency: string; status: string; created_at: string }[];
};

const money = (cents?: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;
/** completion_rate is stored in basis points of the day's plays. */
const rate = (basisPoints?: number) => `${((basisPoints ?? 0) / 100).toFixed(1)}%`;
const int = (value?: number) => String(value ?? 0);

function DeltaBadge({ value, render }: { value: number; render?: (value: number) => string }) {
  if (value === 0) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 12,
          color: "#98a2b3",
          background: "#f2f4f7",
          padding: "2px 8px",
          borderRadius: 12,
          fontWeight: 500,
        }}
      >
        {t("dashboard.flat_vs_previous")}
      </span>
    );
  }
  const isUp = value > 0;
  const text = render ? render(Math.abs(value)) : int(Math.abs(value));
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 12,
        color: isUp ? "#027a48" : "#b42318",
        background: isUp ? "#edfcf2" : "#fef3f2",
        padding: "2px 8px",
        borderRadius: 12,
        fontWeight: 600,
      }}
    >
      {t("dashboard.period_change", {v0: isUp ? "↑" : "↓", v1: text})}
    </span>
  );
}

/** 现代仪表板柱状图：限宽、轨道底色与数值提示 */
function MiniBars({
  rows,
  pick,
  color,
  format,
}: {
  rows: DashboardMetric[];
  pick: (row: DashboardMetric) => number;
  color: string;
  format: (value: number) => string;
}) {
  const values = rows.map(pick);
  const max = Math.max(1, ...values);
  return (
    <div style={{ width: "100%", padding: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 116 }}>
        {rows.map((row, index) => {
          const val = values[index];
          const heightPercent = val > 0 ? (val / max) * 100 : 0;
          return (
            <Tooltip key={row.day} title={`${row.day} · ${format(val)}`}>
              <div
                style={{
                  flex: 1,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                {/* 柱顶数值 */}
                <div
                  style={{
                    fontSize: 11,
                    color: val > 0 ? "#475467" : "#d0d5dd",
                    fontWeight: 600,
                    marginBottom: 4,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    transform: "scale(0.9)",
                  }}
                >
                  {val > 0 ? format(val).replace(/ 次|\.00/g, "") : ""}
                </div>
                {/* 柱条轨道 */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 32,
                    height: "80%",
                    background: "#f2f4f7",
                    borderRadius: "6px 6px 0 0",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: `${heightPercent}%`,
                      minHeight: val > 0 ? 4 : 0,
                      background: val > 0 ? color : "transparent",
                      borderRadius: "6px 6px 0 0",
                      transition: "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, borderTop: "1px solid #eaecf0", paddingTop: 8 }}>
        {rows.map((row) => (
          <div
            key={row.day}
            style={{
              flex: 1,
              fontSize: 11,
              color: "#98a2b3",
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.day.slice(5)}
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  color,
  bg,
}: {
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <Card
      bordered
      styles={{ body: { padding: "16px 18px" } }}
      style={{
        borderRadius: 12,
        borderColor: "#eaecf0",
        boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
        background: "#fff",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#667085", fontWeight: 500 }}>{title}</span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: bg,
            color: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
      <div style={{ margin: "8px 0 6px" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#101828", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>{hint}</div>
    </Card>
  );
}

export function DashboardPage() {
  const [day, setDay] = useState("");
  const [days, setDays] = useState(7);
  const query = `/admin/v1/dashboard?days=${days}${day ? `&day=${day}` : ""}`;
  const { data, reload, loading, error } = useLoad<Dashboard>(query, {});
  const trend = data.trend ?? [];
  const previous = data.previous ?? {};
  const overview = data.overview ?? {};
  const delta = (current: number | undefined, before: number | undefined, render?: (value: number) => string) => (
    <DeltaBadge value={(current ?? 0) - (before ?? 0)} render={render} />
  );

  const kpis: {
    title: string;
    value: ReactNode;
    hint: ReactNode;
    icon: ReactNode;
    color: string;
    bg: string;
  }[] = [
    {
      title: t("dashboard.active_users_dedup"),
      value: int(data.active_users),
      hint: delta(data.active_users, previous.active_users),
      icon: <UserOutlined />,
      color: "#1677ff",
      bg: "#eff8ff",
    },
    {
      title: t("dashboard.new_users"),
      value: int(data.new_users),
      hint: delta(data.new_users, previous.new_users),
      icon: <UserAddOutlined />,
      color: "#0ea5e9",
      bg: "#f0f9ff",
    },
    {
      title: t("dashboard.plays_count"),
      value: int(data.plays),
      hint: delta(data.plays, previous.plays),
      icon: <PlayCircleOutlined />,
      color: "#e53b3e",
      bg: "#fff1f0",
    },
    {
      title: t("dashboard.completions_count"),
      value: int(data.completes),
      hint: delta(data.completes, previous.completes),
      icon: <CheckCircleOutlined />,
      color: "#8b5cf6",
      bg: "#f5f3ff",
    },
    {
      title: t("common.completion_rate"),
      value: rate(data.completion_rate),
      hint: delta(data.completion_rate, previous.completion_rate, (val) => `${(val / 100).toFixed(1)}pp`),
      icon: <RiseOutlined />,
      color: "#12b76a",
      bg: "#edfcf2",
    },
    {
      title: t("dashboard.revenue"),
      value: money(data.revenue_cents),
      hint: delta(data.revenue_cents, previous.revenue_cents, money),
      icon: <DollarOutlined />,
      color: "#d97706",
      bg: "#fffbeb",
    },
    {
      title: t("dashboard.paid_orders"),
      value: int(data.paid_orders),
      hint: delta(data.paid_orders, previous.paid_orders),
      icon: <ShoppingCartOutlined />,
      color: "#f97316",
      bg: "#fff7ed",
    },
    {
      title: t("dashboard.coins_spent"),
      value: int(data.coin_spend),
      hint: delta(data.coin_spend, previous.coin_spend),
      icon: <ThunderboltOutlined />,
      color: "#f59e0b",
      bg: "#fefce8",
    },
  ];

  const overviewItems: { title: string; value: string; isPending?: boolean; isHighlight?: boolean }[] = [
    { title: t("dashboard.total_users"), value: int(overview.total_users) },
    { title: t("dashboard.active_members"), value: int(overview.active_members), isHighlight: true },
    { title: t("dashboard.published_dramas"), value: int(overview.published_dramas) },
    { title: t("dashboard.published_episodes"), value: int(overview.published_episodes) },
    { title: t("dashboard.pending_episodes"), value: int(overview.episodes_awaiting_publish), isPending: true },
    { title: t("dashboard.pending_comments"), value: int(overview.pending_comments), isPending: true },
    { title: t("dashboard.total_plays"), value: int(overview.lifetime_plays), isHighlight: true },
    { title: t("dashboard.total_revenue"), value: money(overview.lifetime_revenue_cents), isHighlight: true },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* 顶部标题与时区控件 */}
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap align="center">
        <Space align="center" size={10} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("dashboard.title")}
          </Typography.Title>
          <Tag bordered={false} style={{ background: "#eff8ff", color: "#175cd3", borderRadius: 12, padding: "2px 10px", margin: 0 }}>
            {t("dashboard.west_coast_tz", {v0: data.timezone ?? "America/Los_Angeles"})}
          </Tag>
          <Tag bordered={false} style={{ background: "#f2f4f7", color: "#475467", borderRadius: 12, margin: 0 }}>
            {t("dashboard.metric_day", {v0: data.day ?? "-"})}
          </Tag>
        </Space>
        <Space wrap size={10}>
          <div style={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
            <CalendarOutlined style={{ position: "absolute", left: 10, color: "#98a2b3", zIndex: 1, pointerEvents: "none" }} />
            <Input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              style={{ width: 160, paddingLeft: 30, borderRadius: 6 }}
            />
          </div>
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 160 }}
            options={[
              { value: 7, label: t("dashboard.last_7_days") },
              { value: 14, label: t("dashboard.last_14_days") },
              { value: 30, label: t("dashboard.last_30_days") },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading} style={{ borderRadius: 6 }}>
            {t("common.refresh")}
          </Button>
        </Space>
      </Space>

      {/* 业务规则轻提示 */}
      <Alert
        type="info"
        showIcon
        message={
          <span style={{ fontSize: 13, color: "#475467" }}>
            {t("dashboard.timezone_note")}
          </span>
        }
        style={{
          borderRadius: 8,
          border: "1px solid #d0d5dd",
          background: "#fafbfd",
        }}
      />

      {error ? <Alert type="error" showIcon message={t("dashboard.load_failed")} description={error} /> : null}

      {loading && trend.length === 0 ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          {/* 8 个核心 KPI 卡片 */}
          <Row gutter={[16, 16]}>
            {kpis.map((item) => (
              <Col key={item.title} xs={12} sm={12} md={6} xl={3}>
                <KpiCard
                  title={item.title}
                  value={item.value}
                  hint={item.hint}
                  icon={item.icon}
                  color={item.color}
                  bg={item.bg}
                />
              </Col>
            ))}
          </Row>

          {/* 全站累计与待办面板 */}
          <Card
            bordered
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.site_totals_todos")}</span>
                <Tag bordered={false} style={{ background: "#f2f4f7", color: "#667085", borderRadius: 10, fontSize: 11, margin: 0 }}>
                  {t("dashboard.business_overview")}
                </Tag>
              </div>
            }
            styles={{ body: { padding: "16px 20px" }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
            style={{
              borderRadius: 12,
              borderColor: "#eaecf0",
              boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
              background: "#fff",
            }}
          >
            <Row gutter={[12, 12]}>
              {overviewItems.map((item) => {
                const isAlert = item.isPending && Number(item.value) > 0;
                return (
                  <Col key={item.title} xs={12} sm={8} md={6} xl={3}>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: isAlert ? "#fff9f0" : "#f8f9fa",
                        border: isAlert ? "1px solid #fedf89" : "1px solid #f2f4f7",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#667085", marginBottom: 4 }}>{item.title}</div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: item.isHighlight ? "#1677ff" : isAlert ? "#d97706" : "#101828",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>

          {/* 柱状趋势图双栏 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card
                bordered
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.plays_trend")}</span>
                    <Tag bordered={false} style={{ background: "#f2f4f7", color: "#667085", borderRadius: 10, fontSize: 11, margin: 0 }}>
                      {data.window?.start ?? "-"} ~ {data.window?.end ?? "-"}
                    </Tag>
                  </div>
                }
                styles={{ body: { padding: "16px 20px" }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
                style={{
                  borderRadius: 12,
                  borderColor: "#eaecf0",
                  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                  background: "#fff",
                }}
              >
                <MiniBars rows={trend} pick={(row) => row.plays} color="#E53B3E" format={(val) => t("dashboard.times_format", {v0: val})} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                bordered
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.revenue_trend")}</span>
                    <Tag bordered={false} style={{ background: "#edfcf2", color: "#027a48", borderRadius: 10, fontSize: 11, margin: 0 }}>
                      {t("dashboard.payment_settlement")}
                    </Tag>
                  </div>
                }
                styles={{ body: { padding: "16px 20px" }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
                style={{
                  borderRadius: 12,
                  borderColor: "#eaecf0",
                  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                  background: "#fff",
                }}
              >
                <MiniBars rows={trend} pick={(row) => row.revenue_cents} color="#12b76a" format={money} />
              </Card>
            </Col>
          </Row>

          {/* 趋势明细表格 */}
          <Card
            bordered
            title={<span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.trend_details")}</span>}
            styles={{ body: { padding: 0 }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
            style={{
              borderRadius: 12,
              borderColor: "#eaecf0",
              boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <Table
              rowKey="day"
              loading={loading}
              dataSource={trend}
              pagination={false}
              scroll={{ x: 920 }}
              columns={[
                {
                  title: t("dashboard.date"),
                  dataIndex: "day",
                  fixed: "left",
                  width: 120,
                  render: (v: string) => <span style={{ fontWeight: 600, color: "#101828" }}>{v}</span>,
                },
                {
                  title: t("dashboard.new_users"),
                  dataIndex: "new_users",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
                {
                  title: t("dashboard.active_users"),
                  dataIndex: "active_users",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
                {
                  title: t("dashboard.plays"),
                  dataIndex: "plays",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{v}</span>,
                },
                {
                  title: t("dashboard.completions"),
                  dataIndex: "completes",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
                {
                  title: t("common.completion_rate"),
                  dataIndex: "completion_rate",
                  render: (v: number) => (
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: v > 0 ? "#12b76a" : "#667085" }}>
                      {rate(v)}
                    </span>
                  ),
                },
                {
                  title: t("dashboard.paid_orders"),
                  dataIndex: "paid_orders",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
                {
                  title: t("dashboard.revenue"),
                  dataIndex: "revenue_cents",
                  render: (v: number) => (
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: v > 0 ? "#027a48" : "#667085" }}>
                      {money(v)}
                    </span>
                  ),
                },
                {
                  title: t("dashboard.coins_spent"),
                  dataIndex: "coin_spend",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
                {
                  title: t("dashboard.unlocks_count"),
                  dataIndex: "unlock_count",
                  render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                },
              ]}
            />
          </Card>

          {/* 热门剧集与最近订单双栏 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card
                bordered
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.top_dramas")}</span>
                    <Tag bordered={false} style={{ background: "#f2f4f7", color: "#667085", borderRadius: 10, fontSize: 11, margin: 0 }}>
                      {t("dashboard.real_plays_in_window")}
                    </Tag>
                  </div>
                }
                styles={{ body: { padding: 0 }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
                style={{
                  borderRadius: 12,
                  borderColor: "#eaecf0",
                  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={data.top_dramas ?? []}
                  pagination={false}
                  locale={{ emptyText: t("dashboard.no_plays_in_window") }}
                  columns={[
                    {
                      title: t("dashboard.rank"),
                      key: "rank",
                      width: 64,
                      render: (_, __, index) => {
                        const rankStyles = [
                          { bg: "#fff1f0", color: "#e53b3e" },
                          { bg: "#fff9f0", color: "#f79009" },
                          { bg: "#eff8ff", color: "#1677ff" },
                        ];
                        const style = rankStyles[index] ?? { bg: "#f2f4f7", color: "#667085" };
                        return (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              background: style.bg,
                              color: style.color,
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {index + 1}
                          </span>
                        );
                      },
                    },
                    {
                      title: t("drama.drama"),
                      dataIndex: "title",
                      render: (title: string, row) => (
                        <Link to={`/dramas/${row.id}`} style={{ fontWeight: 600, color: "#101828" }}>
                          {title}
                        </Link>
                      ),
                    },
                    {
                      title: t("dashboard.plays"),
                      dataIndex: "plays",
                      width: 80,
                      render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{v}</span>,
                    },
                    {
                      title: t("dashboard.completions"),
                      dataIndex: "completes",
                      width: 80,
                      render: (v: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>,
                    },
                    {
                      title: t("common.completion_rate"),
                      dataIndex: "completion_rate",
                      width: 100,
                      render: (v: number) => (
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#12b76a" }}>
                          {rate(v)}
                        </span>
                      ),
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card
                bordered
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t("dashboard.recent_orders")}</span>
                    <Tag bordered={false} style={{ background: "#edfcf2", color: "#027a48", borderRadius: 10, fontSize: 11, margin: 0 }}>
                      {t("dashboard.live_sales")}
                    </Tag>
                  </div>
                }
                styles={{ body: { padding: 0 }, header: { borderBottom: "1px solid #eaecf0", padding: "12px 20px" } }}
                style={{
                  borderRadius: 12,
                  borderColor: "#eaecf0",
                  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <Table
                  rowKey="order_no"
                  loading={loading}
                  dataSource={data.recent_orders ?? []}
                  pagination={false}
                  scroll={{ x: 560 }}
                  locale={{ emptyText: t("dashboard.no_orders_data") }}
                  columns={[
                    {
                      title: t("finance.order_no"),
                      dataIndex: "order_no",
                      render: (v: string) => (
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#475467" }}>{v}</span>
                      ),
                    },
                    {
                      title: t("users.user"),
                      dataIndex: "user_id",
                      width: 90,
                      render: (v: number) => (
                        <span style={{ fontSize: 12, color: "#667085" }}>#{v}</span>
                      ),
                    },
                    {
                      title: t("finance.amount"),
                      dataIndex: "amount_cents",
                      width: 100,
                      render: (v: number) => (
                        <span style={{ fontWeight: 700, color: "#027a48", fontVariantNumeric: "tabular-nums" }}>
                          {money(v)}
                        </span>
                      ),
                    },
                    {
                      title: t("common.status"),
                      dataIndex: "status",
                      width: 90,
                      render: (value: string) => (
                        <Tag
                          bordered={false}
                          style={{
                            background: value === "paid" ? "#edfcf2" : "#f2f4f7",
                            color: value === "paid" ? "#027a48" : "#667085",
                            borderRadius: 4,
                            fontWeight: 500,
                            margin: 0,
                          }}
                        >
                          {value === "paid" ? t("finance.paid") : value}
                        </Tag>
                      ),
                    },
                    {
                      title: t("finance.time"),
                      dataIndex: "created_at",
                      width: 150,
                      render: formatTime,
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Space>
  );
}

type AdminUserRow = {
  id: number;
  public_id?: string | null;
  display_name: string;
  email?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  bio?: string | null;
  region?: string | null;
  locale?: string | null;
  coins: number;
  member: boolean;
  member_until?: string | null;
  /** 订阅已设为到期不续费（Stripe cancel_at_period_end）。 */
  canceling?: boolean;
  /** 当前生效窗口的类型：subscription 自动续费 / one_time 时长包。 */
  billing_mode?: string | null;
  created_at: string;
};

function GENDER_OPTIONS(){ return [
  { value: "unspecified", label: t("users.gender_unspecified") },
  { value: "female", label: t("users.female") },
  { value: "male", label: t("users.male") },
  { value: "other", label: t("users.other") },
];; }

const LOCALE_OPTIONS = ["en", "zh", "ja", "ko", "es", "pt"].map((value) => ({ value, label: value }));

/** 头像 + 昵称 + 副标题（简介 / 邮箱）两行单元格。 */
function UserCell({ row }: { row: AdminUserRow }) {
  const initial = row.display_name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <Space size={10} align="center">
      <Avatar src={row.avatar_url || undefined} style={{ background: "#f0f0f0", color: "#8c8c8c", flex: "none" }}>
        {initial}
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, lineHeight: "20px" }}>{row.display_name || "-"}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: row.bio || row.email || "" }}>
          {row.bio || row.email || "—"}
        </Typography.Text>
      </div>
    </Space>
  );
}

/** 行内「调账」弹窗：预选用户、方向切换、快捷金额、改后余额实时预览。 */
function CoinAdjustModal({ user, onClose, onSaved }: { user: AdminUserRow; onClose: () => void; onSaved: (text: string) => void }) {
  const [form] = Form.useForm<{ amount: number; reason: string }>();
  const [direction, setDirection] = useState<"add" | "sub">("add");
  const [saving, setSaving] = useState(false);
  const amount = Form.useWatch("amount", form);
  const delta = (typeof amount === "number" ? amount : 0) * (direction === "add" ? 1 : -1);
  const after = user.coins + delta;
  const negative = after < 0;

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return; // antd 已经把出错字段标红了
    setSaving(true);
    try {
      const res = await api<{ before: number; delta: number; after: number }>(`/admin/v1/users/${user.id}/coins`, {
        method: "POST",
        body: JSON.stringify({ delta: direction === "add" ? values.amount : -values.amount, reason: values.reason.trim() }),
      });
      onSaved(t("users.coins_credited", {v0: res.before, v1: res.after}));
    } catch (e: any) {
      message.error(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t("users.adjust_coins")}
      okText={t("users.confirm_adjustment")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      okButtonProps={{ disabled: negative }}
      onOk={submit}
      onCancel={onClose}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Card size="small" style={{ background: "#fafafa" }}>
          <Space size={16} wrap>
            <span>
              <Typography.Text type="secondary">{t("users.user_label")}</Typography.Text>
              <Typography.Text strong>{user.display_name}</Typography.Text>
            </span>
            <span>
              <Typography.Text type="secondary">ID：</Typography.Text>
              {user.public_id || user.id}
            </span>
            <span>
              <Typography.Text type="secondary">{t("users.current_balance")}</Typography.Text>
              <Typography.Text strong>{user.coins}</Typography.Text>
            </span>
          </Space>
        </Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ amount: 100, reason: "" }}
          onFinish={submit}
        >
          <Form.Item label={t("users.adjustment_method")}>
            <Radio.Group value={direction} onChange={(e) => setDirection(e.target.value)} optionType="button" buttonStyle="solid">
              <Radio.Button value="add">{t("users.add_coins")}</Radio.Button>
              <Radio.Button value="sub">{t("users.deduct_coins")}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="amount"
            label={t("users.quantity")}
            rules={[
              { required: true, message: t("users.enter_quantity") },
              { type: "number", min: 1, message: t("users.quantity_gt_zero") },
            ]}
          >
            <InputNumber min={1} precision={0} style={{ width: 160 }} placeholder={t("users.coins_quantity")} />
          </Form.Item>
          <Space size={8} style={{ marginTop: -8, marginBottom: 14 }}>
            <Typography.Text type="secondary">{t("users.quick_label")}</Typography.Text>
            {[100, 200, 500].map((value) => (
              <Button key={value} size="small" onClick={() => form.setFieldValue("amount", value)}>
                {value}
              </Button>
            ))}
          </Space>
          <Form.Item name="reason" label={t("finance.reason")} rules={[{ required: true, whitespace: true, message: t("users.enter_adjust_reason") }]}>
            <Input placeholder={t("users.adjust_reason_example")} maxLength={200} />
          </Form.Item>
        </Form>
        {negative ? (
          <Alert type="error" showIcon message={t("users.deduct_negative_warning", {v0: after})} />
        ) : (
          <Alert type="info" showIcon message={t("users.balance_after_adjust", {v0: user.coins, v1: after})} />
        )}
      </Space>
    </Modal>
  );
}

/** 行内「编辑」弹窗：管理员修改昵称 / 邮箱 / 性别 / 地区 / 语言 / 头像 / 简介。 */
function UserEditModal({ user, onClose, onSaved }: { user: AdminUserRow; onClose: () => void; onSaved: (text: string) => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return; // antd 已经把出错字段标红了
    setSaving(true);
    try {
      await api(`/admin/v1/users/${user.id}`, { method: "PATCH", body: JSON.stringify(values) });
      onSaved(t("users.profile_updated", {v0: values.display_name || user.display_name}));
    } catch (e: any) {
      message.error(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t("users.edit_user_title", {v0: user.display_name})}
      okText={t("common.save")}
      cancelText={t("common.cancel")}
      width={560}
      confirmLoading={saving}
      onOk={submit}
      onCancel={onClose}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          display_name: user.display_name ?? "",
          email: user.email ?? "",
          gender: user.gender || "unspecified",
          region: user.region ?? "",
          locale: user.locale || "en",
          avatar_url: user.avatar_url ?? "",
          bio: user.bio ?? "",
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="display_name" label={t("users.nickname")} rules={[{ required: true, whitespace: true, message: t("users.nickname_required"), max: 64 }]}>
              <Input maxLength={64} placeholder={t("users.nickname_placeholder")} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="email"
              label={t("common.email")}
              tooltip={t("users.blank_unbinds_email")}
              rules={[{ type: "email", message: t("users.invalid_email_format") }]}
            >
              <Input maxLength={320} placeholder="user@example.com" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="gender" label={t("users.gender")}>
              <Select options={GENDER_OPTIONS()} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="region" label={t("users.region")} tooltip={t("users.region_code_hint")}>
              <Input maxLength={8} placeholder="US" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="locale" label={t("users.language")}>
              <Select options={LOCALE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="avatar_url" label={t("users.avatar_url")}>
              <Input maxLength={500} placeholder="https://…" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="bio" label={t("drama.synopsis")}>
          <Input.TextArea rows={3} maxLength={500} showCount placeholder={t("users.bio_placeholder")} />
        </Form.Item>
        <Typography.Text type="secondary">{t("users.edit_restriction_note")}</Typography.Text>
      </Form>
    </Modal>
  );
}

type MembershipDetail = {
  active: boolean;
  plan_code: string | null;
  plan_name?: string | null;
  until: string | null;
  subscription_until: string | null;
  pass_until: string | null;
  canceling: boolean;
  billing_mode: string | null;
  source: "subscription" | "one_time" | null;
  has_stripe_subscription: boolean;
  user: { id: number; public_id?: string | null; display_name: string; email?: string | null };
  history: {
    id: number;
    plan_code: string;
    plan_name: string;
    status: string;
    start: string;
    end: string;
    pass_end: string | null;
    canceled_at: string | null;
    billing_mode: string;
    source: string;
  }[];
  last_adjust: {
    action: string;
    actor_id: number | null;
    actor_name?: string;
    at: string;
    payload: any;
  } | null;
};

const PLAN_DAYS: Record<string, number> = { weekly: 7, monthly: 30, yearly: 365 };

/** 与后端一致：续期从 `max(now, 当前到期)` 起算，「重算」从今天起算。 */
function previewExpiry(detail: MembershipDetail | null, days: number, mode: string): Date {
  const now = new Date();
  const live = detail?.active && detail.until ? new Date(detail.until) : null;
  const base = mode === "extend" && live && live.getTime() > now.getTime() ? live : now;
  return new Date(base.getTime() + Math.max(0, days || 0) * 86400000);
}

/** 行内「会员」弹窗：真实状态 + 开通/续期 + 取消会员。 */
function MembershipModal({ user, onClose, onSaved }: { user: AdminUserRow; onClose: () => void; onSaved: (text: string) => void }) {
  const isAdmin = useIsAdmin();
  const [detail, setDetail] = useState<MembershipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [form] = Form.useForm<{ plan_code: string; days: number; mode: "extend" | "restart"; reason: string }>();
  const [revokeForm] = Form.useForm<{ mode: "now" | "period_end"; reason: string }>();
  const { data: plans } = useLoad<{ items: PlanItem[] }>("/admin/v1/plans", { items: [] });

  const planCode = Form.useWatch("plan_code", form) ?? "monthly";
  const days = Form.useWatch("days", form);
  const mode = Form.useWatch("mode", form) ?? "extend";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<MembershipDetail>(`/admin/v1/users/${user.id}/membership`)
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch((e) => message.error(errorText(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.id]);

  // 换套餐时把天数带成该套餐的默认值；手改过的天数只在换套餐时被重置。
  useEffect(() => {
    form.setFieldValue("days", PLAN_DAYS[planCode] ?? 30);
  }, [planCode, form]);

  const planOptions = plans.items.length
    ? plans.items.map((item) => ({
        code: item.code,
        label: t("plans.plan_days_label", {v0: item.name_zh || item.name_en, v1: PLAN_DAYS[item.code] ?? "?"}),
      }))
    : Object.keys(PLAN_DAYS).map((code) => ({ code, label: t("plans.plan_days_label", {v0: code, v1: PLAN_DAYS[code]}) }));

  const remainDays =
    detail?.active && detail.until
      ? Math.max(0, Math.ceil((new Date(detail.until).getTime() - Date.now()) / 86400000))
      : 0;
  const after = previewExpiry(detail, typeof days === "number" ? days : 0, mode);
  const overwrite = mode === "restart" && remainDays > 0;

  const submitGrant = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setGranting(true);
    try {
      const res = await api<{ after_until: string; added_days: number }>(`/admin/v1/users/${user.id}/membership`, {
        method: "POST",
        body: JSON.stringify({
          plan_code: values.plan_code,
          days: values.days,
          mode: values.mode,
          reason: values.reason.trim(),
        }),
      });
      onSaved(t("users.membership_granted", {v0: res.added_days, v1: formatTime(res.after_until)}));
    } catch (e: any) {
      message.error(errorText(e));
      setGranting(false);
    }
  };

  const submitRevoke = async () => {
    const values = await revokeForm.validateFields().catch(() => null);
    if (!values) return;
    setRevoking(true);
    try {
      const res = await api<{ mode: string; after_until: string }>(`/admin/v1/users/${user.id}/membership`, {
        method: "DELETE",
        body: JSON.stringify({ mode: values.mode, reason: values.reason.trim() }),
      });
      onSaved(
        res.mode === "now" ? t("users.membership_revoked_now") : t("users.membership_expire_no_renew", {v0: formatTime(res.after_until)}),
      );
    } catch (e: any) {
      message.error(errorText(e));
      setRevoking(false);
    }
  };

  return (
    <Modal
      open
      title={t("users.membership_title", {v0: user.display_name})}
      width={560}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}
      styles={{ body: { maxHeight: "calc(100vh - 200px)", overflowY: "auto", paddingRight: 4 } }}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : !detail ? (
        <Alert type="error" showIcon message={t("users.membership_load_failed")} />
      ) : (
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Card size="small" style={{ background: "#fafafa" }} styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Space size={8} wrap>
                <Tag
                  color={detail.active ? (detail.canceling ? "orange" : "green") : "default"}
                  style={{ marginInlineEnd: 0 }}
                >
                  {detail.active ? (detail.canceling ? t("users.expire_no_renew") : t("common.active")) : t("common.none")}
                </Tag>
                <Typography.Text>
                  {detail.until ? t("users.valid_until", {v0: formatTime(detail.until)}) : t("users.no_membership")}
                </Typography.Text>
                {detail.active && detail.source ? (
                  <Tag style={{ marginInlineEnd: 0 }}>
                    {detail.source === "subscription" ? t("finance.subscription") : t("finance.duration_pack")}
                  </Tag>
                ) : null}
                {detail.plan_name ? <Typography.Text type="secondary">{detail.plan_name}</Typography.Text> : null}
              </Space>
              {detail.active && detail.has_stripe_subscription ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t("users.subscription_until", {v0: formatTime(detail.subscription_until)})}
                  {detail.pass_until ? t("users.duration_pack_until", {v0: formatTime(detail.pass_until)}) : ""}
                </Typography.Text>
              ) : null}
              {detail.last_adjust ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t("users.last_admin_adjustment")}
                  {detail.last_adjust.actor_name || `#${detail.last_adjust.actor_id}`} ·{" "}
                  {formatTime(detail.last_adjust.at)} ·{" "}
                  {detail.last_adjust.action === "membership_grant"
                    ? t("users.gifted_days", {v0: detail.last_adjust.payload?.days ?? "?", v1: detail.last_adjust.payload?.reason ?? "-"})
                    : t("users.cancel_membership_note", {v0: detail.last_adjust.payload?.reason ?? "-"})}
                </Typography.Text>
              ) : null}
            </Space>
          </Card>

          {!isAdmin ? (
            <Alert type="info" showIcon message={t("users.admin_only_membership")} />
          ) : (
            <>
              <Form
                form={form}
                layout="vertical"
                initialValues={{ plan_code: "monthly", days: 30, mode: "extend", reason: "" }}
                onFinish={submitGrant}
              >
                <Form.Item name="plan_code" label={t("plans.plan")}>
                  <Radio.Group optionType="button" buttonStyle="solid">
                    {planOptions.map((item) => (
                      <Radio.Button key={item.code} value={item.code}>
                        {item.label}
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </Form.Item>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="days"
                      label={t("users.duration_days")}
                      rules={[
                        { required: true, message: t("users.enter_days") },
                        { type: "number", min: 1, max: 3650, message: t("users.days_range") },
                      ]}
                    >
                      <InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item name="mode" label={t("users.grant_method")}>
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="extend">{t("users.extend")}</Radio.Button>
                        <Radio.Button value="restart">{t("users.restart_today")}</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  name="reason"
                  label={t("finance.reason")}
                  rules={[{ required: true, whitespace: true, message: t("users.enter_membership_reason") }]}
                >
                  <Input maxLength={200} placeholder={t("users.membership_reason_example")} />
                </Form.Item>
                <Alert
                  type={overwrite ? "warning" : "info"}
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={
                    overwrite
                      ? t("users.restart_overrides", {v0: remainDays, v1: formatTime(after.toISOString())})
                      : t("users.expiry_change", {
                          v0: detail.until ? formatTime(detail.until) : t("users.not_activated"),
                          v1: formatTime(after.toISOString()),
                        })
                  }
                />
                <Button type="primary" htmlType="submit" loading={granting} block>
                  {t("users.confirm_grant")}
                </Button>
              </Form>

              {detail.active ? (
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                  {/* 默认折叠：收回权益是低频操作，展开才占版面，也少一次误点。 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography.Text strong style={{ color: "#cf1322" }}>
                      {t("users.dangerous_action")}
                    </Typography.Text>
                    <Button type="link" size="small" danger onClick={() => setShowRevoke((value) => !value)}>
                      {showRevoke ? t("users.collapse") : t("users.cancel_membership")}
                    </Button>
                  </div>
                  {showRevoke ? (
                    <>
                      <Form
                        form={revokeForm}
                        layout="vertical"
                        style={{ marginTop: 8 }}
                        initialValues={{ mode: detail.has_stripe_subscription ? "period_end" : "now", reason: "" }}
                      >
                        <Form.Item name="mode" label={t("users.method")}>
                          <Radio.Group>
                            <Radio value="now">{t("users.revoke_now")}</Radio>
                            <Radio value="period_end" disabled={!detail.has_stripe_subscription}>
                              {t("users.no_renew_at_expiry")}
                            </Radio>
                          </Radio.Group>
                        </Form.Item>
                        <Form.Item
                          name="reason"
                          label={t("finance.reason")}
                          rules={[{ required: true, whitespace: true, message: t("users.enter_cancel_reason") }]}
                        >
                          <Input maxLength={200} placeholder={t("users.cancel_reason_example")} />
                        </Form.Item>
                      </Form>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {detail.has_stripe_subscription
                          ? t("users.stripe_cancel_note")
                          : t("users.duration_pack_revoke_note")}
                      </Typography.Text>
                      <Checkbox
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        style={{ marginTop: 10, display: "block" }}
                      >
                        {t("users.confirm_revoke_rights")}
                      </Checkbox>
                      <Button
                        danger
                        type="primary"
                        block
                        style={{ marginTop: 8 }}
                        disabled={!confirmed}
                        loading={revoking}
                        onClick={submitRevoke}
                      >
                        {t("users.confirm_revoke")}
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Space>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const isAdmin = useIsAdmin();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [coinTarget, setCoinTarget] = useState<AdminUserRow | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [memberTarget, setMemberTarget] = useState<AdminUserRow | null>(null);
  const { data, reload, loading } = useLoad<{ items: AdminUserRow[] }>(
    query ? `/admin/v1/users?q=${encodeURIComponent(query)}` : "/admin/v1/users",
    { items: [] }
  );

  // 输入停顿 300ms 后再查，避免每敲一个字符都打一次接口。
  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const saved = (text: string) => {
    message.success(text);
    setCoinTarget(null);
    setEditTarget(null);
    setMemberTarget(null);
    reload();
  };

  const adminOnly = isAdmin ? "" : t("users.admin_only");

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>{t("users.title")}</Typography.Title>
      <Card
        title={query ? t("users.list_search_title", {v0: query}) : t("users.list_title")}
        extra={
          <Space>
            <Input.Search
              allowClear
              placeholder={t("users.search_placeholder")}
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={(value) => setQuery(value.trim())}
            />
            <Button onClick={() => reload()} loading={loading}>{t("common.refresh")}</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          dataSource={data.items}
          loading={loading}
          size="middle"
          scroll={{ x: 1060 }}
          locale={{ emptyText: query ? t("users.no_match", {v0: query}) : t("users.no_users") }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t("users.total_users", {v0: total}) }}
          columns={[
            { title: t("users.user"), dataIndex: "display_name", width: 240, render: (_, row) => <UserCell row={row} /> },
            {
              title: "ID",
              dataIndex: "public_id",
              width: 130,
              render: (value: string | null, row) => (
                <Typography.Text copyable={{ text: value ?? String(row.id) }} style={{ fontFamily: "monospace" }}>
                  {value || row.id}
                </Typography.Text>
              ),
            },
            {
              title: t("common.coins_unit"),
              dataIndex: "coins",
              width: 100,
              align: "right",
              sorter: (a: AdminUserRow, b: AdminUserRow) => a.coins - b.coins,
              render: (value: number) => <Typography.Text strong>{value}</Typography.Text>,
            },
            {
              title: t("users.member"),
              dataIndex: "member",
              width: 230,
              render: (value: boolean, row) => (
                <Space size={6} style={{ cursor: "pointer" }} onClick={() => setMemberTarget(row)}>
                  <Tag
                    color={value ? (row.canceling ? "orange" : "green") : "default"}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {value ? (row.canceling ? t("users.expire_no_renew") : t("common.active")) : t("common.none")}
                  </Tag>
                  {value ? (
                    <>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("users.valid_until", {v0: formatTime(row.member_until)})}
                      </Typography.Text>
                      {row.billing_mode ? (
                        <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>
                          {row.billing_mode === "subscription" ? t("finance.subscription") : t("finance.duration_pack")}
                        </Tag>
                      ) : null}
                    </>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t("users.not_granted")}
                    </Typography.Text>
                  )}
                </Space>
              ),
            },
            { title: t("users.registered_at"), dataIndex: "created_at", width: 160, render: (v: string) => formatTime(v) },
            {
              title: t("common.actions"),
              key: "action",
              width: 200,
              fixed: "right",
              render: (_, row) => (
                <Space size={0}>
                  <Tooltip title={adminOnly}>
                    <Button type="link" size="small" disabled={!isAdmin} onClick={() => setCoinTarget(row)}>
                      {t("users.adjust_balance")}
                    </Button>
                  </Tooltip>
                  <Tooltip title={adminOnly}>
                    <Button type="link" size="small" disabled={!isAdmin} onClick={() => setEditTarget(row)}>
                      {t("common.edit")}
                    </Button>
                  </Tooltip>
                  <Button type="link" size="small" onClick={() => setMemberTarget(row)}>
                    {row.member ? t("users.member") : isAdmin ? t("users.grant") : t("users.member")}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      {coinTarget ? <CoinAdjustModal user={coinTarget} onClose={() => setCoinTarget(null)} onSaved={saved} /> : null}
      {editTarget ? <UserEditModal user={editTarget} onClose={() => setEditTarget(null)} onSaved={saved} /> : null}
      {memberTarget ? <MembershipModal user={memberTarget} onClose={() => setMemberTarget(null)} onSaved={saved} /> : null}
    </Space>
  );
}

function COMMENT_STATUS(): Record<string, { color: string; label: string }> { return {
  approved: { color: "green", label: t("drama.published_status") },
  pending: { color: "orange", label: t("common.pending_review") },
  deleted: { color: "red", label: t("common.deleted") },
};; }

function MODERATION_VERDICT(): Record<string, { color: string; label: string }> { return {
  allow: { color: "green", label: t("moderation.approve") },
  review: { color: "orange", label: t("moderation.escalate_manual") },
  block: { color: "red", label: t("moderation.block") },
};; }

type CommentRow = {
  id: number;
  body: string;
  status: string;
  drama_id: number;
  drama_title: string;
  episode_id: number;
  episode_number: number | null;
  user_id: number;
  user_display_name: string;
  user_email: string | null;
  created_at: string | null;
  moderation_verdict: string | null;
  moderation_score: number | null;
  moderation_reason: string | null;
  moderation_state: string | null;
};

function COMMENT_TABS(){ return [
  { label: t("common.all"), value: "" },
  { label: t("common.pending_review"), value: "pending" },
  { label: t("drama.published_status"), value: "approved" },
  { label: t("common.deleted"), value: "deleted" },
];; }

type CommentCounts = { pending: number; approved: number; deleted: number; total: number };

const EMPTY_COMMENT_COUNTS: CommentCounts = { pending: 0, approved: 0, deleted: 0, total: 0 };

export function CommentsPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<{ items: CommentRow[]; total: number; counts?: CommentCounts }>({
    items: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  const counts = data.counts ?? EMPTY_COMMENT_COUNTS;
  const share = (value: number) => (counts.total ? `${((value / counts.total) * 100).toFixed(1)}%` : "0%");
  const tabCount = (value: string) => {
    if (!value) return counts.total;
    return counts[value as keyof CommentCounts] ?? 0;
  };

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    api<{ items: CommentRow[]; total: number; counts?: CommentCounts }>(`/admin/v1/comments?${params}`)
      .then(setData)
      .catch((e) => message.error(t("comments.load_failed", {v0: errorText(e)})))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, pageSize, q]);

  const moderate = async (row: CommentRow, next: "approved" | "deleted") => {
    try {
      await api(`/admin/v1/comments/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ status: next }),
      });
      message.success(next === "approved" ? t("comments.approved_visible") : t("comments.deleted_hidden"));
      load();
    } catch (e) {
      message.error(t("comments.action_failed", {v0: errorText(e)}));
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <Space direction="vertical" size={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("comments.title")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("comments.isolation_note")}
          </Typography.Text>
        </Space>
        <Space>
          <Input.Search
            allowClear
            placeholder={t("comments.search_placeholder")}
            style={{ width: 220 }}
            onSearch={(value) => {
              setPage(1);
              setQ(value);
            }}
          />
          <Link to="/moderation">
            <Button size="small">{t("comments.auto_moderation_config")}</Button>
          </Link>
          <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
            {t("common.refresh")}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("comments.total_count")}
            value={counts.total}
            hint={<span style={{ fontSize: 12, color: "#667085" }}>{t("comments.filtered_total_hint")}</span>}
            icon={<CommentOutlined />}
            color="#175cd3"
            bg="#eff8ff"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("common.pending_review")}
            value={counts.pending}
            hint={<span style={{ fontSize: 12, color: "#667085" }}>{t("common.share_of_total", {v0: share(counts.pending)})}</span>}
            icon={<ClockCircleOutlined />}
            color="#b54708"
            bg="#fffaeb"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("drama.published_status")}
            value={counts.approved}
            hint={<span style={{ fontSize: 12, color: "#667085" }}>{t("common.share_of_total", {v0: share(counts.approved)})}</span>}
            icon={<CheckCircleOutlined />}
            color="#027a48"
            bg="#ecfdf3"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("common.deleted")}
            value={counts.deleted}
            hint={<span style={{ fontSize: 12, color: "#667085" }}>{t("common.share_of_total", {v0: share(counts.deleted)})}</span>}
            icon={<StopOutlined />}
            color="#b42318"
            bg="#fef3f2"
          />
        </Col>
      </Row>

      <Segmented
        value={status}
        options={COMMENT_TABS().map((tab) => ({
          label: `${tab.label} ${tabCount(tab.value)}`,
          value: tab.value,
        }))}
        onChange={(value) => {
          setPage(1);
          setStatus(String(value));
        }}
      />

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data.items}
        scroll={{ x: 1080 }}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          showTotal: (total) => t("comments.total_items", {v0: total}),
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
        columns={[
          { title: t("comments.content"), dataIndex: "body", width: 280, render: (value: string) => <span style={{ whiteSpace: "pre-wrap" }}>{value}</span> },
          {
            title: t("drama.drama"),
            width: 190,
            render: (_, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text ellipsis style={{ maxWidth: 180 }}>
                  {row.drama_title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  EP {row.episode_number ?? "-"} · #{row.episode_id}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: t("users.user"),
            width: 190,
            render: (_, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text>{row.user_display_name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.user_email ?? `#${row.user_id}`}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 90,
            render: (value: string) => (
              <Tag color={COMMENT_STATUS()[value]?.color ?? "default"}>
                {COMMENT_STATUS()[value]?.label ?? value}
              </Tag>
            ),
          },
          {
            title: t("comments.auto_decision"),
            width: 110,
            render: (_, row) => {
              if (!row.moderation_verdict) {
                if (row.moderation_state === "queued" || row.moderation_state === "running") {
                  return <Tag color="processing">{t("common.in_review")}</Tag>;
                }
                return <Typography.Text type="secondary">{t("comments.not_modeled")}</Typography.Text>;
              }
              const meta = MODERATION_VERDICT()[row.moderation_verdict];
              return (
                <Tooltip
                  title={
                    <span>
                      {row.moderation_reason || t("comments.no_reason")}
                      {row.moderation_score != null ? t("comments.confidence", {v0: row.moderation_score}) : ""}
                    </span>
                  }
                >
                  <Tag color={meta?.color ?? "default"} style={{ cursor: "help" }}>
                    {meta?.label ?? row.moderation_verdict}
                  </Tag>
                </Tooltip>
              );
            },
          },
          {
            title: t("finance.time"),
            dataIndex: "created_at",
            width: 150,
            render: (value: string | null) => (value ? new Date(value).toLocaleString("vi-VN") : "-"),
          },
          {
            title: t("common.actions"),
            width: 150,
            render: (_, row) => (
              <Space>
                <Button size="small" disabled={row.status === "approved"} onClick={() => moderate(row, "approved")}>
                  {t("moderation.approve")}
                </Button>
                <Button size="small" danger disabled={row.status === "deleted"} onClick={() => moderate(row, "deleted")}>
                  {t("common.delete")}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
}

type OrderUserInfo = {
  id: number;
  public_id: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string;
  region: string;
  locale: string;
  created_at: string;
};

type OrderPlanInfo = {
  code: string;
  name_en: string;
  name_zh: string;
  version: number | null;
  price_cents: number | null;
  currency: string | null;
  benefits: { items?: string[]; best?: boolean } | null;
};

type FinanceOrder = {
  order_no: string;
  user_id: number;
  amount_cents: number;
  currency: string;
  billing_mode: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  external_txn_id: string | null;
  user: OrderUserInfo | null;
  plan: OrderPlanInfo | null;
};

type FinanceSummary = {
  total_orders: number;
  paid_orders: number;
  refunded_orders: number;
  created_orders: number;
  failed_orders: number;
  paid_cents: number;
  refunded_cents: number;
  pending_cents: number;
  gross_cents: number;
  net_cents: number;
  today_paid_cents: number;
  today_orders: number;
  currency: string;
};

type FinanceOrdersPayload = {
  items: FinanceOrder[];
  total: number;
  page: number;
  page_size: number;
  summary?: FinanceSummary;
};

type FinanceOrderDetail = FinanceOrder & {
  user_stats: { paid_orders: number; paid_cents: number; refunded_cents: number } | null;
  membership: {
    active: boolean;
    plan_code: string | null;
    until: string | null;
    canceling?: boolean;
  } | null;
};

function ORDER_STATUS_META(): Record<string, { label: string; color: string; bg: string }> { return {
  paid: { label: t("finance.paid"), color: "#027a48", bg: "#edfcf2" },
  created: { label: t("finance.pending_payment"), color: "#b54708", bg: "#fffaeb" },
  refunded: { label: t("finance.refunded"), color: "#175cd3", bg: "#eff8ff" },
  failed: { label: t("finance.payment_failed"), color: "#b42318", bg: "#fef3f2" },
};; }

function FINANCE_PERIOD_LABEL(): Record<string, string> { return {
  weekly: t("plans.duration_7_days"),
  monthly: t("apikeys.duration_30_days"),
  yearly: t("apikeys.duration_365_days"),
};; }

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", CNY: "¥", EUR: "€", GBP: "£" };

function formatAmount(cents?: number | null, currency = "USD") {
  if (cents === null || cents === undefined) return "-";
  const symbol = CURRENCY_SYMBOL[currency];
  const value = (cents / 100).toFixed(2);
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

function OrderStatusTag({ status }: { status: string }) {
  const meta = ORDER_STATUS_META()[status] ?? {
    label: status,
    color: "#667085",
    bg: "#f2f4f7",
  };
  return (
    <Tag
      bordered={false}
      style={{
        background: meta.bg,
        color: meta.color,
        borderRadius: 4,
        fontWeight: 500,
        margin: 0,
      }}
    >
      {meta.label}
    </Tag>
  );
}

/** 用户单元格：头像 + 昵称 / 邮箱 / 公开 ID，订单里最常见的识别信息一屏可见。 */
function OrderUserCell({ order }: { order: FinanceOrder }) {
  const account = order.user;
  const name = account?.display_name || account?.email || t("finance.user_fallback", {v0: order.user_id});
  return (
    <Space size={10} align="start">
      <Avatar
        size={34}
        src={account?.avatar_url || undefined}
        style={{ background: "#f2f4f7", color: "#667085", flexShrink: 0 }}
      >
        {name.slice(0, 1).toUpperCase()}
      </Avatar>
      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "#101828",
            maxWidth: 168,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#667085",
            maxWidth: 168,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {account?.email || t("users.no_email_bound")}
        </div>
        <div style={{ fontSize: 11, color: "#98a2b3", fontFamily: "monospace" }}>
          ID {account?.public_id || order.user_id}
        </div>
      </div>
    </Space>
  );
}

function FinanceOrderDrawer({ order, onClose }: { order: FinanceOrder; onClose: () => void }) {
  // 列表只带下单时快照；用户累计消费 / 会员状态再按需取一次，避免列表做重查询。
  const [detail, setDetail] = useState<FinanceOrderDetail | null>(null);
  useEffect(() => {
    let alive = true;
    api<FinanceOrderDetail>(`/admin/v1/finance/orders/${encodeURIComponent(order.order_no)}`)
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch(() => {
        /* 详情失败时仍展示列表已有字段 */
      });
    return () => {
      alive = false;
    };
  }, [order.order_no]);

  const account = detail?.user ?? order.user;
  const plan = detail?.plan ?? order.plan;
  const benefits = plan?.benefits?.items ?? [];
  const standardPrice = plan?.price_cents;
  const hasDiscount =
    standardPrice !== null && standardPrice !== undefined && standardPrice !== order.amount_cents;
  const stats = detail?.user_stats;
  const membership = detail?.membership;

  return (
    <Drawer
      open
      width="min(560px, 100vw)"
      onClose={onClose}
      title={
        <Space size={10}>
          <span>{t("finance.order_details")}</span>
          <OrderStatusTag status={order.status} />
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card
          variant="borderless"
          styles={{ body: { padding: 20 } }}
          style={{ background: "#f9fafb", borderRadius: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#667085", marginBottom: 4 }}>{t("finance.order_amount")}</div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: order.status === "refunded" ? "#667085" : "#101828",
                  lineHeight: 1.1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatAmount(order.amount_cents, order.currency)}
              </div>
              <div style={{ fontSize: 12, color: "#667085", marginTop: 6 }}>
                {order.billing_mode === "one_time" ? t("finance.one_time_duration_pack") : t("finance.auto_renew_subscription")}
                {hasDiscount ? t("finance.standard_price_suffix", {v0: formatAmount(standardPrice, order.currency)}) : ""}
              </div>
            </div>
            <Typography.Text
              copyable={{ text: order.order_no, tooltips: [t("finance.copy_order_no"), t("stagepages.copied")] }}
              style={{ fontFamily: "monospace", fontSize: 12, color: "#475467" }}
            >
              {order.order_no}
            </Typography.Text>
          </div>
        </Card>

        <Card size="small" title={t("finance.user_info")} variant="borderless" style={{ border: "1px solid #eaecf0", borderRadius: 12 }}>
          <Space size={12} align="start" style={{ width: "100%", marginBottom: 12 }}>
            <Avatar size={44} src={account?.avatar_url || undefined} style={{ background: "#E53B3E" }}>
              {(account?.display_name || account?.email || String(order.user_id)).slice(0, 1).toUpperCase()}
            </Avatar>
            <div style={{ lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#101828" }}>
                {account?.display_name || t("finance.user_fallback", {v0: order.user_id})}
              </div>
              <div style={{ fontSize: 12, color: "#667085" }}>{account?.email || t("users.no_email_bound")}</div>
              <div style={{ fontSize: 12, color: "#98a2b3", fontFamily: "monospace" }}>
                ID {account?.public_id || order.user_id}
              </div>
            </div>
          </Space>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={12}>
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#667085" }}>{t("finance.total_spent")}</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#101828",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.4,
                  }}
                >
                  {stats ? (
                    formatAmount(stats.paid_cents, order.currency)
                  ) : (
                    <span style={{ color: "#98a2b3", fontSize: 12, fontWeight: 400 }}>{t("common.loading")}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#98a2b3" }}>
                  {stats
                    ? t("finance.paid_refund_summary", {v0: stats.paid_orders, v1: formatAmount(stats.refunded_cents, order.currency)})
                    : t("finance.user_all_orders")}
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#667085" }}>{t("finance.current_membership")}</div>
                <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>
                  {!membership ? (
                    <span style={{ color: "#98a2b3", fontSize: 12, fontWeight: 400 }}>{t("common.loading")}</span>
                  ) : membership.active ? (
                    <Space size={6}>
                      <Tag color="green" style={{ marginInlineEnd: 0 }}>
                        {t("common.active")}
                      </Tag>
                      <span style={{ fontSize: 12, color: "#475467", fontWeight: 400 }}>
                        {t("users.valid_until", {v0: formatTime(membership.until)})}
                      </span>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t("finance.no_active_membership")}
                    </Typography.Text>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#98a2b3" }}>
                  {membership?.active && membership.plan_code
                    ? t("finance.plan_with_cancel", {
                        v0: membership.plan_code,
                        v1: membership.canceling ? " · " + t("users.no_renew_at_expiry") : "",
                      })
                    : t("users.no_membership")}
                </div>
              </div>
            </Col>
          </Row>
          <Descriptions column={1} size="small" colon={false} styles={{ label: { width: 96, color: "#667085" } }}>
            <Descriptions.Item label={t("finance.user_pk")}>{order.user_id}</Descriptions.Item>
            <Descriptions.Item label={t("finance.region_language")}>
              {account ? `${account.region || "-"} · ${account.locale || "-"}` : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={t("users.registered_at")}>
              {account ? formatTime(account.created_at) : "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card size="small" title={t("finance.plan_info")} variant="borderless" style={{ border: "1px solid #eaecf0", borderRadius: 12 }}>
          <Descriptions column={1} size="small" colon={false} styles={{ label: { width: 96, color: "#667085" } }}>
            <Descriptions.Item label={t("finance.plan_name")}>
              {plan ? (
                <Space size={8}>
                  <span>{plan.name_zh || plan.name_en}</span>
                  <Tag bordered={false} style={{ background: "#f2f4f7", color: "#475467", margin: 0 }}>
                    {plan.code}
                  </Tag>
                </Space>
              ) : (
                "-"
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.plan_duration")}>
              {plan ? FINANCE_PERIOD_LABEL()[plan.code] ?? "-" : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.version_billing")}>
              {plan
                ? t("finance.version_billing_value", {
                    v0: plan.version ? `v${plan.version}` : "-",
                    v1: order.billing_mode === "one_time" ? t("plans.one_time") : t("plans.auto_renew"),
                  })
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.plan_standard_price")}>
              {plan ? formatAmount(plan.price_cents, plan.currency ?? order.currency) : "-"}
            </Descriptions.Item>
          </Descriptions>
          {benefits.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#667085", marginBottom: 6 }}>{t("finance.benefits_snapshot")}</div>
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                {benefits.map((item) => (
                  <div key={item} style={{ fontSize: 12, color: "#475467" }}>
                    <CheckCircleOutlined style={{ color: "#12b76a", marginRight: 6 }} />
                    {item}
                  </div>
                ))}
              </Space>
            </div>
          ) : null}
        </Card>

        <Card size="small" title={t("finance.order_payment")} variant="borderless" style={{ border: "1px solid #eaecf0", borderRadius: 12 }}>
          <Descriptions column={1} size="small" colon={false} styles={{ label: { width: 96, color: "#667085" } }}>
            <Descriptions.Item label={t("finance.order_no")}>
              <Typography.Text copyable style={{ fontFamily: "monospace", fontSize: 12 }}>
                {order.order_no}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.payment_status")}>
              <OrderStatusTag status={order.status} />
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.channel_txn_no")}>
              {order.external_txn_id ? (
                <Typography.Text copyable style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {order.external_txn_id}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">{t("finance.no_txn_unpaid")}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t("finance.ordered_at")}>{formatTime(order.created_at)}</Descriptions.Item>
            <Descriptions.Item label={t("finance.paid_at")}>
              {order.paid_at ? (
                <span style={{ color: "#027a48" }}>{formatTime(order.paid_at)}</span>
              ) : (
                <Typography.Text type="secondary">{t("finance.unpaid")}</Typography.Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Space>
    </Drawer>
  );
}

export function FinancePage() {
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<FinanceOrder | null>(null);

  // 输入停顿 300ms 再查；筛选条件变化时回到第一页，避免停在空页。
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (mode) params.set("billing_mode", mode);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  const { data, reload, loading } = useLoad<FinanceOrdersPayload>(
    `/admin/v1/finance/orders?${params.toString()}`,
    { items: [], total: 0, page: 1, page_size: 20 },
  );
  const summary = data.summary;
  const paidRate =
    summary && summary.total_orders
      ? `${((summary.paid_orders / summary.total_orders) * 100).toFixed(1)}%`
      : "0%";

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }} data-testid="finance-page">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("finance.net_revenue")}
            value={formatAmount(summary?.net_cents ?? 0)}
            hint={
              <span style={{ fontSize: 12, color: "#667085" }}>
                {t("finance.completed_refund", {v0: formatAmount(summary?.gross_cents ?? 0), v1: formatAmount(summary?.refunded_cents ?? 0)})}
              </span>
            }
            icon={<DollarOutlined />}
            color="#027a48"
            bg="#ecfdf3"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("finance.paid_orders")}
            value={`${summary?.paid_orders ?? 0}`}
            hint={
              <span style={{ fontSize: 12, color: "#667085" }}>
                {t("finance.total_orders_rate", {v0: summary?.total_orders ?? 0, v1: paidRate})}
              </span>
            }
            icon={<ShoppingCartOutlined />}
            color="#175cd3"
            bg="#eff8ff"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("finance.today_sales")}
            value={formatAmount(summary?.today_paid_cents ?? 0)}
            hint={
              <span style={{ fontSize: 12, color: "#667085" }}>
                {t("finance.today_new_orders", {v0: summary?.today_orders ?? 0})}
              </span>
            }
            icon={<RiseOutlined />}
            color="#5925dc"
            bg="#f4f3ff"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title={t("finance.pending_or_refunded")}
            value={`${summary?.created_orders ?? 0} / ${summary?.refunded_orders ?? 0}`}
            hint={
              <span style={{ fontSize: 12, color: "#667085" }}>
                {t("finance.pending_refund", {v0: formatAmount(summary?.pending_cents ?? 0), v1: formatAmount(summary?.refunded_cents ?? 0)})}
              </span>
            }
            icon={<ClockCircleOutlined />}
            color="#b54708"
            bg="#fffaeb"
          />
        </Col>
      </Row>

      <Card
        title={t("finance.order_items")}
        styles={{ body: { paddingTop: 16 } }}
        extra={
          <Space wrap size={8}>
            <Segmented
              size="small"
              value={status}
              onChange={(value) => {
                setStatus(String(value));
                setPage(1);
              }}
              options={[
                { label: t("finance.filter_all_orders", {v0: summary?.total_orders ?? 0}), value: "" },
                { label: t("finance.filter_paid", {v0: summary?.paid_orders ?? 0}), value: "paid" },
                { label: t("finance.filter_pending", {v0: summary?.created_orders ?? 0}), value: "created" },
                { label: t("finance.filter_refunded", {v0: summary?.refunded_orders ?? 0}), value: "refunded" },
                { label: t("finance.filter_failed", {v0: summary?.failed_orders ?? 0}), value: "failed" },
              ]}
            />
            <Select
              size="small"
              value={mode}
              style={{ width: 160 }}
              onChange={(value) => {
                setMode(value);
                setPage(1);
              }}
              options={[
                { label: t("finance.all_billing"), value: "" },
                { label: t("plans.auto_renew"), value: "subscription" },
                { label: t("plans.one_time"), value: "one_time" },
              ]}
            />
            <Input.Search
              allowClear
              size="small"
              placeholder={t("finance.order_search_placeholder")}
              style={{ width: 260 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={(value) => {
                setQuery(value.trim());
                setPage(1);
              }}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              {t("common.refresh")}
            </Button>
          </Space>
        }
      >
        <Table<FinanceOrder>
          rowKey="order_no"
          dataSource={data.items}
          loading={loading}
          size="middle"
          scroll={{ x: 1120 }}
          locale={{ emptyText: query ? t("finance.no_matching_orders", {v0: query}) : t("finance.no_orders") }}
          pagination={{
            current: data.page ?? page,
            pageSize: data.page_size ?? pageSize,
            total: data.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total) => t("finance.total_orders", {v0: total}),
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
          columns={[
            {
              title: t("finance.order_no"),
              dataIndex: "order_no",
              width: 210,
              render: (value: string, order) => (
                <div style={{ lineHeight: 1.45 }}>
                  <Typography.Text
                    copyable={{ text: value }}
                    style={{ fontFamily: "monospace", fontSize: 12, color: "#344054" }}
                  >
                    {value}
                  </Typography.Text>
                  <div style={{ fontSize: 11, color: "#98a2b3" }}>
                    {order.external_txn_id
                      ? t("finance.txn_id", {
                          v0:
                            order.external_txn_id.length > 16
                              ? `${order.external_txn_id.slice(0, 16)}…`
                              : order.external_txn_id,
                        })
                      : t("finance.no_channel_txn")}
                  </div>
                </div>
              ),
            },
            {
              title: t("users.user"),
              dataIndex: "user",
              width: 240,
              render: (_, order) => <OrderUserCell order={order} />,
            },
            {
              title: t("plans.plan"),
              dataIndex: "plan",
              width: 200,
              render: (_, order) => {
                const plan = order.plan;
                if (!plan) return <Typography.Text type="secondary">-</Typography.Text>;
                return (
                  <div style={{ lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#101828" }}>
                      {plan.name_zh || plan.name_en}
                    </div>
                    <div style={{ fontSize: 11, color: "#667085" }}>
                      {FINANCE_PERIOD_LABEL()[plan.code] ?? plan.code} ·{" "}
                      {order.billing_mode === "one_time" ? t("finance.duration_pack") : t("finance.subscription")}
                      {plan.version ? ` · v${plan.version}` : ""}
                    </div>
                  </div>
                );
              },
            },
            {
              title: t("finance.amount"),
              dataIndex: "amount_cents",
              width: 130,
              align: "right",
              render: (cents: number, order) => (
                <div style={{ lineHeight: 1.45 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: order.status === "refunded" ? "#98a2b3" : "#101828",
                      textDecoration: order.status === "refunded" ? "line-through" : undefined,
                    }}
                  >
                    {formatAmount(cents, order.currency)}
                  </div>
                  <div style={{ fontSize: 11, color: "#98a2b3" }}>
                    {order.plan?.price_cents !== null &&
                    order.plan?.price_cents !== undefined &&
                    order.plan.price_cents !== cents
                      ? t("finance.listed_price", {v0: formatAmount(order.plan.price_cents, order.currency)})
                      : order.currency === "USD"
                        ? ""
                        : order.currency}
                  </div>
                </div>
              ),
            },
            {
              title: t("common.status"),
              dataIndex: "status",
              width: 108,
              render: (value: string) => <OrderStatusTag status={value} />,
            },
            {
              title: t("finance.order_or_pay"),
              dataIndex: "created_at",
              width: 176,
              render: (value: string, order) => (
                <div style={{ lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontSize: 12, color: "#344054" }}>{formatTime(value)}</div>
                  <div style={{ fontSize: 11, color: order.paid_at ? "#027a48" : "#98a2b3" }}>
                    {order.paid_at ? t("finance.paid_time_value", {v0: formatTime(order.paid_at)}) : t("finance.unpaid")}
                  </div>
                </div>
              ),
            },
            {
              title: t("common.actions"),
              key: "action",
              width: 88,
              fixed: "right",
              render: (_, order) => (
                <Button type="link" size="small" onClick={() => setDetail(order)}>
                  {t("finance.details")}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {detail ? <FinanceOrderDrawer order={detail} onClose={() => setDetail(null)} /> : null}
    </Space>
  );
}

type PlanItem = {
  code: string;
  name_en: string;
  name_zh: string;
  price_cents: number;
  currency: string;
  version: number;
  benefits?: { items?: string[]; best?: boolean };
};

type BillingMode = "subscription" | "one_time";

function PLAN_PERIOD(): Record<string, string> { return {
  weekly: t("plans.duration_7_days"),
  monthly: t("apikeys.duration_30_days"),
  yearly: t("apikeys.duration_365_days"),
};; }

function PLAN_UNIT(): Record<string, string> { return {
  weekly: t("plans.week"),
  monthly: t("plans.month"),
  yearly: t("plans.year"),
};; }

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

export function PlansPage() {
  const { data, reload, loading } = useLoad<{ items: PlanItem[]; billing_mode?: BillingMode }>(
    "/admin/v1/plans",
    { items: [] },
  );
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<BillingMode>("one_time");
  const [pendingMode, setPendingMode] = useState<BillingMode | null>(null);
  const [switching, setSwitching] = useState(false);
  const [form] = Form.useForm<{ price: number; benefits: string; best: boolean }>();

  useEffect(() => {
    if (data.billing_mode) setMode(data.billing_mode);
  }, [data.billing_mode]);

  const switchMode = async () => {
    if (!pendingMode) return;
    setSwitching(true);
    try {
      const result = await api<{ billing_mode: BillingMode; prices: { code: string; ok: boolean }[] }>(
        "/admin/v1/billing/settings",
        { method: "POST", body: JSON.stringify({ billing_mode: pendingMode }) },
      );
      setMode(result.billing_mode);
      message.success(
        result.billing_mode === "one_time" ? t("plans.switched_one_time") : t("plans.switched_auto_renew"),
      );
      const failed = (result.prices ?? []).filter((item) => !item.ok);
      if (failed.length) {
        message.warning(t("plans.partial_price_failed", {v0: failed.map((item) => item.code).join("、")}));
      }
      setPendingMode(null);
      reload();
    } catch (e) {
      message.error(t("plans.switch_failed", {v0: errorText(e)}));
    } finally {
      setSwitching(false);
    }
  };

  const openEdit = (plan: PlanItem) => {
    setEditing(plan);
    form.setFieldsValue({
      price: Number(centsToDollars(plan.price_cents)),
      benefits: (plan.benefits?.items ?? []).join("\n"),
      best: Boolean(plan.benefits?.best),
    });
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const onSave = async (values: { price: number; benefits: string; best: boolean }) => {
    if (!editing) return;
    const priceCents = dollarsToCents(values.price);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      message.error(t("plans.price_gt_zero"));
      return;
    }
    if (mode === "one_time" && priceCents < 50) {
      message.error(t("plans.one_time_min_price"));
      return;
    }
    const items = values.benefits
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const result = await api<{ version: number; price_cents: number }>(`/admin/v1/plans/${editing.code}/price`, {
        method: "POST",
        body: JSON.stringify({
          price_cents: priceCents,
          benefits: { items, best: values.best },
        }),
      });
      message.success(t("plans.new_version_written", {v0: result.version, v1: centsToDollars(result.price_cents)}));
      setEditing(null);
      reload();
    } catch (e) {
      message.error(t("stagepages.save_failed", {v0: errorText(e)}));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={20}>
      {/* 页面顶部标题与说明 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <Space direction="vertical" size={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("plans.title")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("plans.maintain_note")}
          </Typography.Text>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
          {t("common.refresh")}
        </Button>
      </div>

      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap size={16} align="center">
          <Space direction="vertical" size={0} style={{ minWidth: 160 }}>
            <Typography.Text strong>{t("plans.billing_mode")}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("plans.global_effect")}
            </Typography.Text>
          </Space>
          <Segmented
            value={mode}
            options={[
              { label: t("plans.auto_renew"), value: "subscription" },
              { label: t("plans.one_time_purchase"), value: "one_time" },
            ]}
            onChange={(value) => {
              const next = value as BillingMode;
              if (next !== mode) setPendingMode(next);
            }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("plans.switch_scope_note")}
          </Typography.Text>
        </Space>
      </Card>

      <Modal
        open={pendingMode !== null}
        title={t("plans.switch_billing_mode")}
        okText={t("plans.confirm_switch")}
        cancelText={t("common.cancel")}
        confirmLoading={switching}
        onCancel={() => (switching ? undefined : setPendingMode(null))}
        onOk={switchMode}
      >
        <p style={{ marginTop: 0 }}>
          {t("plans.after_switch")}
          <strong>{pendingMode === "one_time" ? t("plans.one_time_payment") : t("finance.auto_renew_subscription")}</strong>。
        </p>
        <p style={{ marginBottom: 0, color: "#8c8c8c" }}>
          {t("plans.switch_existing_note")}
        </p>
      </Modal>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t("plans.version_mechanism")}
        description={t("plans.version_note")}
        style={{ borderRadius: 8 }}
      />

      {/* 3 列并排卡片布局 */}
      <Row gutter={[20, 20]} align="stretch">
        {(data.items ?? []).map((plan) => {
          const items = plan.benefits?.items ?? [];
          const isBest = Boolean(plan.benefits?.best);
          const periodText = PLAN_PERIOD()[plan.code] ?? plan.code;

          return (
            <Col xs={24} sm={24} md={8} key={plan.code} style={{ display: "flex" }}>
              <Card
                hoverable
                loading={loading && !data.items.length}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 12,
                  border: isBest ? "1.5px solid #ff4d4f" : "1px solid #e8e8e8",
                  boxShadow: isBest ? "0 6px 16px rgba(255, 77, 79, 0.08)" : "0 2px 8px rgba(0, 0, 0, 0.04)",
                  overflow: "hidden",
                  position: "relative",
                  transition: "all 0.3s ease",
                }}
                styles={{
                  body: {
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                  },
                }}
              >
                {/* 推荐角标 */}
                {isBest && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      background: "linear-gradient(135deg, #ff4d4f, #f5222d)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 14px 4px 12px",
                      borderBottomLeftRadius: 10,
                      letterSpacing: "0.5px",
                      boxShadow: "0 2px 6px rgba(245, 34, 45, 0.3)",
                    }}
                  >
                    ★ BEST VALUE
                  </div>
                )}

                {/* 卡片头部：套餐名与时长 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Typography.Title level={4} style={{ margin: 0, fontSize: 18 }}>
                      {plan.name_zh || plan.name_en}
                    </Typography.Title>
                    <Tag color="default" style={{ margin: 0, borderRadius: 10, padding: "0 8px" }}>
                      {periodText}
                    </Tag>
                    <Tag
                      color={mode === "one_time" ? "orange" : "blue"}
                      style={{ margin: 0, borderRadius: 10, padding: "0 8px" }}
                    >
                      {mode === "one_time" ? t("plans.one_time") : t("plans.auto_renew")}
                    </Tag>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {t("plans.plan_code_label", {v0: plan.code})}
                  </Typography.Text>
                </div>

                {/* 价格展示区 */}
                <div
                  style={{
                    padding: "16px",
                    background: isBest ? "rgba(255, 77, 79, 0.03)" : "#fafafa",
                    borderRadius: 8,
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 28, fontWeight: 700, color: isBest ? "#f5222d" : "#1f1f1f" }}>
                      ${centsToDollars(plan.price_cents)}
                    </span>
                    <span style={{ fontSize: 13, color: "#8c8c8c", marginLeft: 4 }}>
                      / {mode === "one_time" ? periodText : PLAN_UNIT()[plan.code] ?? periodText}
                    </span>
                  </div>
                  <Tag color="processing" style={{ borderRadius: 4, margin: 0 }}>
                    v{plan.version}
                  </Tag>
                </div>

                {/* 权益列表区 */}
                <div style={{ flex: 1, marginBottom: 24 }}>
                  <Typography.Text strong style={{ fontSize: 13, display: "block", marginBottom: 12, color: "#595959" }}>
                    {t("plans.included_benefits")}
                  </Typography.Text>
                  {items.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {items.map((item) => (
                        <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <CheckCircleFilled style={{ color: isBest ? "#ff4d4f" : "#52c41a", fontSize: 14, flexShrink: 0 }} />
                          <Typography.Text style={{ fontSize: 13 }}>{item}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t("plans.no_benefits")}
                    </Typography.Text>
                  )}
                </div>

                {/* 操作按钮区 */}
                <div style={{ paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
                  <Button
                    type={isBest ? "primary" : "default"}
                    danger={isBest}
                    icon={<EditOutlined />}
                    block
                    size="middle"
                    onClick={() => openEdit(plan)}
                    style={{ borderRadius: 6, fontWeight: 500 }}
                  >
                    {t("plans.edit_plan_config")}
                  </Button>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 修改价格与权益弹窗 */}
      <Modal
        title={editing ? t("plans.edit_config_title", {v0: editing.name_zh || editing.name_en}) : t("plans.edit_config")}
        open={editing !== null}
        onCancel={closeEdit}
        onOk={() => form.submit()}
        okText={t("plans.save_new_version")}
        cancelText={t("common.cancel")}
        confirmLoading={saving}
        maskClosable={!saving}
        keyboard={!saving}
        destroyOnClose
        width={480}
      >
        {editing ? (
          <Form form={form} layout="vertical" onFinish={onSave} requiredMark={false} style={{ marginTop: 8 }}>
            <Alert
              type="warning"
              showIcon
              message={t("plans.current_version", {v0: editing.version, v1: centsToDollars(editing.price_cents)})}
              description={t("plans.save_version_note")}
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
            <Form.Item
              label={t("plans.plan_price_usd")}
              name="price"
              extra={mode === "one_time" ? t("plans.one_time_min_note") : undefined}
              rules={[
                { required: true, message: t("plans.enter_price") },
                {
                  type: "number",
                  min: mode === "one_time" ? 0.5 : 0.01,
                  message: mode === "one_time" ? t("plans.one_time_price_min") : t("plans.price_min"),
                },
              ]}
            >
              <InputNumber
                min={mode === "one_time" ? 0.5 : 0.01}
                step={0.01}
                precision={2}
                prefix="$"
                style={{ width: "100%" }}
                autoFocus
              />
            </Form.Item>
            <Form.Item
              label={t("plans.benefits_lines")}
              name="benefits"
              tooltip={t("plans.benefits_hint")}
            >
              <Input.TextArea rows={4} placeholder={"Unlock all\nNo ads\n1080p"} />
            </Form.Item>
            <Form.Item label={t("plans.recommended_tag")} name="best">
              <Radio.Group>
                <Radio value={true}>{t("plans.mark_best")}</Radio>
                <Radio value={false}>{t("plans.no_mark")}</Radio>
              </Radio.Group>
            </Form.Item>
          </Form>
        ) : null}
      </Modal>
    </Space>
  );
}

export function OpsCenterPage() {
  const [title, setTitle] = useState("");
  const { data, reload } = useLoad<{ items: any[] }>("/admin/v1/pushes", { items: [] });
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Title level={4}>{t("ops.title")}</Typography.Title>
      <Space>
        <Input placeholder={t("ops.push_title")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="primary" onClick={async () => { await api(`/admin/v1/pushes?title=${encodeURIComponent(title)}`, { method: "POST" }); setTitle(""); reload(); }}>{t("ops.record_push")}</Button>
      </Space>
      <Table rowKey="id" dataSource={data.items} pagination={false} scroll={{ x: 480 }} columns={[{ title: t("comments.content"), dataIndex: "title" }, { title: t("ops.delivered"), dataIndex: "delivered_count" }, { title: t("finance.time"), dataIndex: "sent_at" }]} />
    </Space>
  );
}

type EpisodePreview = {
  open: boolean;
  /** iframe embed URL shown in the modal; falls back to the player page URL. */
  url?: string;
  title: string;
};

export function EpisodesPanel({ dramaId }: { dramaId: string }) {
  const [status, setStatus] = useState<string | undefined>();
  const [preview, setPreview] = useState<EpisodePreview>({ open: false, title: "" });
  const closePreview = () => setPreview({ open: false, title: "" });
  const { data, reload } = useLoad<{ items: any[] }>(`/admin/v1/dramas/${dramaId}/episodes?page_size=200${status ? `&status=${status}` : ""}`, { items: [] });

  const openPreview = async (episodeId: number, episodeNumber: number) => {
    try {
      const signed = await api<{ url: string; embed_url?: string }>(`/admin/v1/episodes/${episodeId}/preview-url`);
      setPreview({
        open: true,
        url: signed.embed_url ?? signed.url,
        title: t("drama.preview_episode", {v0: episodeNumber}),
      });
    } catch (e) {
      message.error(t("stagepages.preview_failed", {v0: errorText(e)}));
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Select allowClear placeholder={t("common.status")} style={{ width: 160 }} value={status} onChange={setStatus} options={["not_uploaded", "transcoding", "transcode_failed", "in_review", "published"].map((v) => ({ value: v, label: v }))} />
        <Button onClick={reload}>{t("ops.filter")}</Button>
        <Button onClick={async () => { await api(`/admin/v1/dramas/${dramaId}/episodes/bulk`, { method: "POST", body: JSON.stringify({ count: 64 }) }); reload(); }}>{t("drama.register_64_episodes")}</Button>
      </Space>
      <Table rowKey="id" dataSource={data.items} pagination={{ pageSize: 20 }} scroll={{ x: 560 }} columns={[
        { title: t("common.episodes_unit"), dataIndex: "episode_number" },
        { title: t("common.title"), dataIndex: "title" },
        { title: t("common.status"), dataIndex: "status" },
        { title: t("common.actions"), render: (_, row) => (
          row.bunny_video_id ? (
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => openPreview(row.id, row.episode_number)}>{t("common.preview")}</Button>
          ) : (
            <Button size="small" onClick={async () => {
              await api(`/admin/v1/episodes/${row.id}/upload-session`, { method: "POST", body: JSON.stringify({ filename: "ep.mp4", mime: "video/mp4", size_bytes: 1024, width: 720, height: 1280 }) });
              message.success(t("drama.direct_upload_note"));
              reload();
            }}>{t("common.upload")}</Button>
          )
        ) },
      ]} />
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

export function GroupsPanel({ dramaId }: { dramaId: string }) {
  const { data, reload } = useLoad<{ items: any[] }>("/admin/v1/groups", { items: [] });
  const [name, setName] = useState("");
  return (
    <Space direction="vertical">
      <Space>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groups.group_title")} />
        <Button onClick={async () => { await api("/admin/v1/groups", { method: "POST", body: JSON.stringify({ name, position: data.items.length }) }); setName(""); reload(); }}>{t("groups.create_group")}</Button>
      </Space>
      {data.items.map((group) => (
        <Card key={group.id} size="small" title={t("groups.name_sort", {v0: group.name, v1: group.position})}>
          <Button onClick={async () => { await api(`/admin/v1/groups/${group.id}/dramas`, { method: "POST", body: JSON.stringify({ drama_id: Number(dramaId), confirm: true }) }); message.success(t("groups.joined")); }}>{t("groups.join_group")}</Button>
        </Card>
      ))}
    </Space>
  );
}

type PublishAction = { to: string; label: string; primary?: boolean; danger?: boolean };

function DRAMA_STATUS_TEXT(): Record<string, string> { return {
  draft: t("common.draft"),
  in_review: t("common.in_review"),
  published: t("common.published"),
  unpublished: t("common.unpublished"),
};; }

const DRAMA_STATUS_COLOR: Record<string, string> = {
  draft: "default",
  in_review: "orange",
  published: "green",
  unpublished: "red",
};

type DeleteImpact = {
  groups?: string[];
  banner_count?: number;
  push_count?: number;
  episode_count?: number;
};

/**
 * 删除预检：后端用 409 + {confirm_required, impact} 返回“删除会带走什么”。
 * 走 api() 而不是裸 fetch，才能复用统一的 401 跳登录与错误解析（403 会抛出
 * “admin only”，之前直接被丢进 JSON.stringify 里展示给用户）。
 */
async function previewDramaDelete(dramaId: string): Promise<DeleteImpact | null> {
  try {
    await api(`/admin/v1/dramas/${dramaId}/delete`, {
      method: "POST",
      body: JSON.stringify({ confirm: false }),
    });
    // 后端总会先返回 409；真的 200 说明剧集已经被删掉了。
    return null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.detail?.confirm_required) {
      return (e.detail.impact ?? {}) as DeleteImpact;
    }
    throw e;
  }
}

function DeleteConfirmContent({
  dramaTitle,
  impact,
  fallbackEpisodeCount,
}: {
  dramaTitle: string;
  impact: DeleteImpact;
  fallbackEpisodeCount?: number;
}) {
  const groups = impact.groups ?? [];
  const episodes = impact.episode_count ?? fallbackEpisodeCount ?? 0;
  const rows: [string, string][] = [
    [t("drama.episodes"), t("drama.delete_episodes_note", {v0: episodes})],
    [t("groups.home_refs"), groups.length ? t("groups.count_list", {v0: groups.length, v1: groups.join("、")}) : t("common.none")],
    [t("groups.banner_refs"), impact.banner_count ? t("groups.banner_count", {v0: impact.banner_count}) : t("common.none")],
    [t("ops.push_records"), impact.push_count ? t("groups.banner_count", {v0: impact.push_count}) : t("common.none")],
    [t("drama.user_data"), t("drama.user_data_detail")],
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        type="error"
        showIcon
        message={t("drama.delete_irreversible")}
        description={t("drama.delete_permanent_note", {v0: dramaTitle})}
      />
      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
        {rows.map(([label, value]) => (
          <li key={label}>
            {label}：{value}
          </li>
        ))}
      </ul>
    </Space>
  );
}

export function PublishPanel({
  dramaId,
  dramaTitle,
  episodeCount,
  status,
  issues = [],
}: {
  dramaId: string;
  dramaTitle: string;
  episodeCount?: number;
  status: string;
  issues?: string[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { confirm, confirmModal } = useConfirm();
  const navigate = useNavigate();
  // 删除剧集是高危操作，后端只放行 admin（docs/software-architecture.md 角色矩阵）。
  const isAdmin = useIsAdmin();

  const submitStatus = async (to_status: string, label: string) => {
    setBusy(to_status);
    try {
      await api(`/admin/v1/dramas/${dramaId}/status`, {
        method: "POST",
        body: JSON.stringify({ to_status }),
      });
      message.success(t("drama.status_action_success", {v0: label}));
      window.location.reload();
    } catch (e) {
      // 409 = 状态机不允许的跳转（例如草稿直接上架）
      message.error(t("drama.status_action_failed", {v0: label, v1: errorText(e)}));
      setBusy(null);
    }
  };

  const act = async (to_status: string, label: string) => {
    if (issues.length === 0) {
      await submitStatus(to_status, label);
      return;
    }
    confirm({
      title: t("drama.pending_steps_title", {v0: label}),
      okText: t("drama.still_action", {v0: label}),
      cancelText: t("common.cancel"),
      content: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Alert type="warning" showIcon message={t("drama.pending_items_note")} />
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {issues.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Space>
      ),
      onOk: () => submitStatus(to_status, label),
    });
  };

  const onDelete = async () => {
    setDeleting(true);
    let impact: DeleteImpact | null = null;
    try {
      impact = await previewDramaDelete(dramaId);
    } catch (e) {
      message.error(
        e instanceof ApiError && e.status === 403
          ? t("drama.delete_failed_admin_only")
          : t("drama.delete_impact_failed", {v0: errorText(e)}),
      );
      return;
    } finally {
      setDeleting(false);
    }
    if (impact === null) {
      message.success(t("drama.deleted_success", {v0: dramaTitle}));
      navigate("/dramas");
      return;
    }
    confirm({
      title: t("drama.delete_drama"),
      danger: true,
      okText: t("common.delete"),
      cancelText: t("common.cancel"),
      width: 480,
      content: (
        <DeleteConfirmContent
          dramaTitle={dramaTitle}
          impact={impact}
          fallbackEpisodeCount={episodeCount}
        />
      ),
      onOk: async () => {
        try {
          await api(`/admin/v1/dramas/${dramaId}/delete`, {
            method: "POST",
            body: JSON.stringify({ confirm: true }),
          });
        } catch (e) {
          message.error(
            e instanceof ApiError && e.status === 403
              ? t("drama.delete_failed_admin_only")
              : t("drama.delete_failed", {v0: errorText(e)}),
          );
          throw e;
        }
        message.success(t("drama.deleted_success", {v0: dramaTitle}));
        navigate("/dramas");
      },
    });
  };

  // 状态机见 backend/app/modules/content/service.py：
  // draft -> in_review -> published，published -> unpublished，unpublished 可重新上架。
  // 这里只列出当前状态下合法的动作，避免点了按钮才吃到 409。
  const actions: PublishAction[] =
    status === "draft"
      ? [{ to: "in_review", label: t("drama.submit_review"), primary: true }]
      : status === "in_review"
        ? [
            { to: "published", label: t("drama.approve_publish"), primary: true },
            { to: "draft", label: t("drama.back_to_draft") },
          ]
        : status === "published"
          ? [{ to: "unpublished", label: t("drama.unpublish"), primary: true, danger: true }]
          : [
              { to: "published", label: t("drama.republish"), primary: true },
              { to: "in_review", label: t("drama.submit_re_review") },
            ];

  return (
    <>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space size={8}>
          <Typography.Text>{t("drama.current_status")}</Typography.Text>
          <Tag color={DRAMA_STATUS_COLOR[status]}>{DRAMA_STATUS_TEXT()[status] ?? status}</Tag>
        </Space>

      {issues.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ width: "100%" }}
          message={t("drama.before_publish_note")}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {issues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          }
        />
      )}

      <Space wrap>
        {actions.map((action) => (
          <Button
            key={action.to}
            type={action.primary ? "primary" : "default"}
            danger={action.danger}
            loading={busy === action.to}
            disabled={busy !== null && busy !== action.to}
            onClick={() => act(action.to, action.label)}
          >
            {action.label}
          </Button>
        ))}
      </Space>

      <Typography.Text type="secondary">
        {t("drama.workflow_note")}
      </Typography.Text>

      <Tooltip title={isAdmin ? "" : t("drama.admin_only_delete")}>
        {/* Tooltip 在 disabled 元素上不触发，所以包一层 span */}
        <span style={{ display: "inline-block" }}>
          <Button danger disabled={!isAdmin} loading={deleting} onClick={onDelete}>
            {t("drama.delete_drama")}
          </Button>
        </span>
      </Tooltip>

      </Space>

      {/* 自定义确认弹框（替代 window.confirm），放在 Space 外，避免多出一个空间距 */}
      {confirmModal}
    </>
  );
}
