import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Dropdown,
  InputNumber,
  Pagination,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { MenuProps } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarCircleFilled,
  FireOutlined,
  GiftOutlined,
  HeartOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MailOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  ShareAltOutlined,
  StarOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { t } from "../copy";

/**
 * 金币与任务配置：维护 7 天签到梯度、注册奖励、绑定邮箱、绑定 Facebook、每日广告奖励。
 * 保存后的生效时间按「次日生效」执行（America/Los_Angeles）。
 */

type ConfigVersion = {
  amounts: number[];
  effective_on: string | null;
  is_default?: boolean;
};

type PendingVersion = {
  amounts: number[];
  effective_on: string;
};

type RewardItem = {
  code: string;
  name: string;
  description: string;
  kind: "gradient" | "single";
  size: number;
  default_amounts: number[];
  current: ConfigVersion;
  pending: PendingVersion | null;
};

type ChangeRow = {
  id: number;
  code: string;
  amounts: number[];
  effective_on: string | null;
  actor: string;
  created_at: string | null;
};

type Overview = {
  today: string;
  next_effective_on: string;
  items: RewardItem[];
  recent_changes: ChangeRow[];
};

const MAX_AMOUNT = 1_000_000;
const BRAND_RED = "#e24b4a";

const sameAmounts = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function formatTime(value?: string | null) {
  if (!value) return "-";
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(
    moment.getDate()
  )} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

// 任务元数据映射：提供类别、专属图标与强调色
function TASK_META(): Record<
  string,
  {
    category: "onetime" | "daily";
    categoryLabel: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    hint: string;
  }
> { return {
  register: {
    category: "onetime",
    categoryLabel: t("rewards.newbie_growth"),
    icon: <UserAddOutlined />,
    color: "#1677ff",
    bg: "#e6f4ff",
    hint: t("rewards.newbie_hint"),
  },
  bind_email: {
    category: "onetime",
    categoryLabel: t("rewards.account_security"),
    icon: <MailOutlined />,
    color: "#722ed1",
    bg: "#f9f0ff",
    hint: t("rewards.email_bind_hint"),
  },
  bind_facebook: {
    category: "onetime",
    categoryLabel: t("rewards.social_bind"),
    icon: <ShareAltOutlined />,
    color: "#1877f2",
    bg: "#e8f3ff",
    hint: t("rewards.facebook_bind_hint"),
  },
  ad: {
    category: "daily",
    categoryLabel: t("rewards.daily_incentive"),
    icon: <PlayCircleOutlined />,
    color: "#fa8c16",
    bg: "#fff7e6",
    hint: t("rewards.rewarded_ad_hint"),
  },
  like_5: {
    category: "daily",
    categoryLabel: t("rewards.daily_interaction"),
    icon: <HeartOutlined />,
    color: "#e24b4a",
    bg: "#fff1f0",
    hint: t("rewards.like_five_hint"),
  },
  favorite_5: {
    category: "daily",
    categoryLabel: t("rewards.daily_interaction"),
    icon: <StarOutlined />,
    color: "#d48806",
    bg: "#fffbe6",
    hint: t("rewards.favorite_five_hint"),
  },
  watch_8: {
    category: "daily",
    categoryLabel: t("rewards.watch_tasks"),
    icon: <PlayCircleOutlined />,
    color: "#13c2c2",
    bg: "#e6fffb",
    hint: t("rewards.watch_eight_hint"),
  },
};; }

// 预设签到梯度模板
function CHECKIN_PRESETS(){ return [
  {
    key: "ladder",
    label: t("rewards.preset_classic"),
    values: [30, 30, 50, 50, 30, 60, 90],
  },
  {
    key: "high_end",
    label: t("rewards.preset_burst"),
    values: [20, 30, 40, 50, 60, 80, 120],
  },
  {
    key: "flat",
    label: t("rewards.preset_flat"),
    values: [30, 30, 30, 40, 40, 50, 70],
  },
  {
    key: "weekend_boost",
    label: t("rewards.preset_weekend"),
    values: [25, 25, 35, 35, 40, 80, 100],
  },
];; }

export default function Rewards() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [savingCodes, setSavingCodes] = useState<Set<string>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const pageSize = 8;

  // 加载数据：preserveDrafts 为 true 时不覆盖正在编辑的项
  const load = useCallback(async (preserveDrafts = false) => {
    setLoading(true);
    try {
      const res = await api<Overview>("/admin/v1/rewards/config");
      setOverview(res);
      setDrafts((prev) => {
        const next: Record<string, number[]> = preserveDrafts ? { ...prev } : {};
        for (const item of res.items) {
          if (!preserveDrafts || !next[item.code]) {
            next[item.code] = [...(item.pending?.amounts ?? item.current.amounts)];
          }
        }
        return next;
      });
    } catch (e) {
      message.error(t("rewards.load_config_failed", {v0: errorText(e)}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = overview?.items ?? [];
  const checkin = items.find((item) => item.code === "checkin");
  const singles = items.filter((item) => item.kind === "single");

  // 当前草稿的基准参考值（有 pending 用 pending，否则用 current）
  const baseline = useCallback((item: RewardItem) => {
    return item.pending?.amounts ?? item.current.amounts;
  }, []);

  // 某项是否有未保存的改动
  const isDirty = useCallback(
    (item: RewardItem) => {
      const draft = drafts[item.code];
      if (!draft || draft.length !== item.size) return false;
      return !sameAmounts(draft, baseline(item));
    },
    [drafts, baseline]
  );

  // 所有处于脏状态的项
  const dirtyItems = useMemo(() => {
    return items.filter((item) => isDirty(item));
  }, [items, isDirty]);

  // 未保存拦截防呆
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyItems.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyItems.length]);

  const setDraftValue = (code: string, index: number, value: number | null) => {
    setDrafts((prev) => {
      const next = { ...prev, [code]: [...(prev[code] ?? [])] };
      next[code][index] = value === null ? Number.NaN : value;
      return next;
    });
  };

  const resetDraft = (item: RewardItem) => {
    setDrafts((prev) => ({ ...prev, [item.code]: [...baseline(item)] }));
    message.info(t("rewards.reverted_changes", {v0: item.name}));
  };

  const resetAllDrafts = () => {
    setDrafts(
      Object.fromEntries(
        items.map((item) => [item.code, [...baseline(item)]])
      )
    );
    message.info(t("rewards.discarded_all_changes"));
  };

  // 保存单项
  const saveOne = async (item: RewardItem) => {
    const draft = drafts[item.code] ?? [];
    if (
      draft.length !== item.size ||
      draft.some((v) => !Number.isInteger(v) || v < 1 || v > MAX_AMOUNT)
    ) {
      message.error(
        t("rewards.invalid_amounts", {v0: item.name, v1: item.size, v2: MAX_AMOUNT.toLocaleString()})
      );
      return;
    }

    setSavingCodes((prev) => new Set(prev).add(item.code));
    try {
      const row = await api<{ code: string; amounts: number[]; effective_on: string }>(
        "/admin/v1/rewards/config",
        {
          method: "POST",
          body: JSON.stringify({ code: item.code, amounts: draft }),
        }
      );
      message.success(
        t("rewards.item_saved_effective", {v0: item.name, v1: row.effective_on})
      );
      // 局部刷新，保留其他草稿不被覆盖
      await load(true);
    } catch (e) {
      message.error(t("stagepages.save_failed", {v0: errorText(e)}));
    } finally {
      setSavingCodes((prev) => {
        const next = new Set(prev);
        next.delete(item.code);
        return next;
      });
    }
  };

  // 一键批量保存全部已修改项
  const saveAllDirty = async () => {
    if (dirtyItems.length === 0) return;
    for (const item of dirtyItems) {
      const draft = drafts[item.code] ?? [];
      if (
        draft.length !== item.size ||
        draft.some((v) => !Number.isInteger(v) || v < 1 || v > MAX_AMOUNT)
      ) {
        message.error(
          t("rewards.item_invalid", {v0: item.name})
        );
        return;
      }
    }

    setBatchSaving(true);
    let successCount = 0;
    try {
      for (const item of dirtyItems) {
        await api<{ code: string; amounts: number[]; effective_on: string }>(
          "/admin/v1/rewards/config",
          {
            method: "POST",
            body: JSON.stringify({ code: item.code, amounts: drafts[item.code] }),
          }
        );
        successCount++;
      }
      message.success(
        t("rewards.batch_saved", {
          v0: successCount,
          v1: overview?.next_effective_on ?? t("common.next_day"),
        })
      );
      await load(false);
    } catch (e) {
      message.error(t("rewards.partial_save_failed", {v0: errorText(e)}));
      await load(true);
    } finally {
      setBatchSaving(false);
    }
  };

  // 格式化金额序列
  const amountText = (amounts: number[]) =>
    amounts.map((v) => (Number.isFinite(v) ? `+${v}` : "—")).join(" / ");

  // 7 天签到梯度统计分析
  const checkinStats = useMemo(() => {
    if (!checkin) return null;
    const currentAmounts = checkin.current.amounts;
    const draftAmounts = drafts[checkin.code] ?? currentAmounts;
    const baseAmounts = baseline(checkin);

    const draftSum = draftAmounts.reduce(
      (acc, v) => acc + (Number.isFinite(v) ? v : 0),
      0
    );
    const baseSum = baseAmounts.reduce((acc, v) => acc + v, 0);
    const sumDiff = draftSum - baseSum;
    const day1 = draftAmounts[0] || 1;
    const day7 = draftAmounts[6] || 0;
    const boostRatio = (day7 / day1).toFixed(1);
    const dailyAvg = (draftSum / 7).toFixed(1);

    return {
      draftSum,
      baseSum,
      sumDiff,
      boostRatio,
      dailyAvg,
      day1,
      day7,
    };
  }, [checkin, drafts, baseline]);

  // 签到预设菜单
  const presetMenuItems: MenuProps["items"] = useMemo(() => {
    const list: MenuProps["items"] = CHECKIN_PRESETS().map((p) => ({
      key: p.key,
      label: (
        <Space direction="vertical" size={0}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {p.label}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("rewards.ladder_values", {v0: p.values.join(" → "), v1: p.values.reduce((a, b) => a + b, 0)})}
          </Typography.Text>
        </Space>
      ),
      onClick: () => {
        if (!checkin) return;
        setDrafts((prev) => ({ ...prev, [checkin.code]: [...p.values] }));
        message.info(t("rewards.preset_applied", {v0: p.label}));
      },
    }));

    if (checkin?.default_amounts) {
      list.push({ type: "divider" });
      list.push({
        key: "system_default",
        label: (
          <Space>
            <Typography.Text type="danger">{t("rewards.restore_default_ladder")}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ({checkin.default_amounts.join(" / ")})
            </Typography.Text>
          </Space>
        ),
        onClick: () => {
          setDrafts((prev) => ({ ...prev, [checkin.code]: [...checkin.default_amounts] }));
          message.info(t("rewards.reset_to_default"));
        },
      });
    }

    return list;
  }, [checkin]);

  // 过滤后的单项任务
  const filteredSingles = useMemo(() => {
    if (categoryFilter === "all") return singles;
    return singles.filter((s) => {
      const meta = TASK_META()[s.code];
      return meta ? meta.category === categoryFilter : categoryFilter === "onetime";
    });
  }, [singles, categoryFilter]);

  // 任务表格列定义
  const singleColumns = [
    {
      title: t("rewards.task_type_name"),
      dataIndex: "name",
      key: "name",
      width: 320,
      render: (_: unknown, item: RewardItem) => {
        const meta = TASK_META()[item.code] ?? {
          categoryLabel: t("rewards.general_tasks"),
          icon: <GiftOutlined />,
          color: BRAND_RED,
          bg: "#fff2f0",
          hint: item.description,
        };
        const changed = isDirty(item);
        return (
          <Space align="start" size={12}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: meta.bg,
                color: meta.color,
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                flexShrink: 0,
                border: `1px solid ${meta.color}22`,
              }}
            >
              {meta.icon}
            </div>
            <Space direction="vertical" size={2}>
              <Space size={6} wrap>
                <Typography.Text strong style={{ fontSize: 14 }}>
                  {item.name}
                </Typography.Text>
                <Tag
                  bordered={false}
                  style={{
                    fontSize: 11,
                    lineHeight: "18px",
                    background: meta.bg,
                    color: meta.color,
                    fontWeight: 500,
                  }}
                >
                  {meta.categoryLabel}
                </Tag>
                <Tag style={{ fontSize: 11, margin: 0 }}>{item.code}</Tag>
                {changed ? <Tag color="gold">{t("rewards.modified_unsaved")}</Tag> : null}
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
                {meta.hint || item.description}
              </Typography.Text>
            </Space>
          </Space>
        );
      },
    },
    {
      title: t("rewards.currently_live"),
      dataIndex: "current",
      key: "current",
      width: 220,
      render: (_: unknown, item: RewardItem) => {
        const { amounts, effective_on, is_default } = item.current;
        const val = amounts[0] ?? 0;
        return (
          <Space direction="vertical" size={2}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                background: "#f6ffed",
                border: "1px solid #b7eb8f",
              }}
            >
              <DollarCircleFilled style={{ color: "#52c41a", fontSize: 15 }} />
              <Typography.Text strong style={{ color: "#237804", fontSize: 14 }}>
                +{val.toLocaleString()}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t("common.coins_unit")}
              </Typography.Text>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 2 }}>
              {is_default || !effective_on ? t("rewards.system_default") : t("rewards.effective_from", {v0: effective_on})}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: t("rewards.pending_effective"),
      key: "pending",
      width: 220,
      render: (_: unknown, item: RewardItem) => {
        if (!item.pending) {
          return (
            <Typography.Text type="secondary" style={{ color: "#bfbfbf", fontSize: 13 }}>
              —
            </Typography.Text>
          );
        }
        const val = item.pending.amounts[0] ?? 0;
        const currentVal = item.current.amounts[0] ?? 0;
        const diff = val - currentVal;
        return (
          <Space direction="vertical" size={2}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                background: "#fffbe6",
                border: "1px solid #ffe58f",
              }}
            >
              <ClockCircleOutlined style={{ color: "#faad14", fontSize: 14 }} />
              <Typography.Text strong style={{ color: "#d48806", fontSize: 14 }}>
                +{val.toLocaleString()}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t("common.coins_unit")}
              </Typography.Text>
              {diff !== 0 && (
                <Tag
                  color={diff > 0 ? "success" : "error"}
                  bordered={false}
                  style={{ fontSize: 11, margin: 0, padding: "0 4px", lineHeight: "16px" }}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </Tag>
              )}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 2 }}>
              {t("rewards.effective_soon", {v0: item.pending.effective_on})}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: t("rewards.adjust_reward_amount"),
      key: "action",
      width: 320,
      render: (_: unknown, item: RewardItem) => {
        const draftVal = drafts[item.code]?.[0];
        const baseVal = baseline(item)[0] ?? 0;
        const changed = isDirty(item);
        const isSaving = savingCodes.has(item.code) || batchSaving;
        const diff = Number.isFinite(draftVal) ? draftVal - baseVal : 0;

        return (
          <Space size={8} align="center">
            <div style={{ position: "relative" }}>
              <InputNumber
                min={1}
                max={MAX_AMOUNT}
                precision={0}
                style={{
                  width: 136,
                  borderColor: changed ? "#faad14" : undefined,
                  boxShadow: changed ? "0 0 0 2px rgba(250, 173, 20, 0.15)" : undefined,
                }}
                prefix={<span style={{ color: "#8c8c8c", fontSize: 12 }}>+</span>}
                suffix={<span style={{ color: "#8c8c8c", fontSize: 12 }}>{t("common.coins_unit")}</span>}
                value={Number.isFinite(draftVal) ? draftVal : null}
                onChange={(value) => setDraftValue(item.code, 0, value)}
                disabled={isSaving}
              />
              {changed && diff !== 0 && (
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    top: -18,
                    fontSize: 11,
                    fontWeight: 600,
                    color: diff > 0 ? "#52c41a" : "#ff4d4f",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  {diff > 0 ? (
                    <>
                      <ArrowUpOutlined style={{ fontSize: 10 }} />+{diff}
                    </>
                  ) : (
                    <>
                      <ArrowDownOutlined style={{ fontSize: 10 }} />
                      {diff}
                    </>
                  )}
                </div>
              )}
            </div>

            <Popconfirm
              title={t("rewards.confirm_save_adjustment", {v0: item.name})}
              description={t("rewards.adjustment_effective", {
                v0: draftVal,
                v1: overview?.next_effective_on ?? t("common.tomorrow"),
              })}
              onConfirm={() => saveOne(item)}
              okText={t("rewards.confirm_submit")}
              cancelText={t("common.cancel")}
              disabled={!changed}
            >
              <Button
                type={changed ? "primary" : "default"}
                size="middle"
                icon={<SaveOutlined />}
                disabled={!changed}
                loading={isSaving}
                style={
                  changed
                    ? {
                        background: BRAND_RED,
                        borderColor: BRAND_RED,
                      }
                    : undefined
                }
              >
                {t("common.save")}
              </Button>
            </Popconfirm>

            {changed ? (
              <Tooltip title={t("rewards.revert_current_input")}>
                <Button
                  size="middle"
                  icon={<RollbackOutlined />}
                  disabled={isSaving}
                  onClick={() => resetDraft(item)}
                />
              </Tooltip>
            ) : null}
          </Space>
        );
      },
    },
  ];

  // 过滤后的历史记录
  const filteredChanges = useMemo(() => {
    const list = overview?.recent_changes ?? [];
    if (historyFilter === "all") return list;
    return list.filter((r) => r.code === historyFilter);
  }, [overview?.recent_changes, historyFilter]);

  const pagedChanges = useMemo(() => {
    const start = (historyPage - 1) * pageSize;
    return filteredChanges.slice(start, start + pageSize);
  }, [filteredChanges, historyPage, pageSize]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={20}>
      {/* 顶部现代化业务导航与全局状态栏 */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #ebebeb",
        }}
        styles={{ body: { padding: "18px 24px" } }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space align="start" size={14}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)",
                  display: "grid",
                  placeItems: "center",
                  color: BRAND_RED,
                  fontSize: 22,
                  boxShadow: "0 2px 6px rgba(226, 75, 74, 0.15)",
                }}
              >
                <GiftOutlined />
              </div>
              <Space direction="vertical" size={4}>
                <Space align="center" size={10} wrap>
                  <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
                    {t("rewards.coins_tasks_config")}
                  </Typography.Title>
                  <Tag color="red" bordered={false} style={{ fontWeight: 600 }}>
                    {t("rewards.minitv_incentive")}
                  </Tag>
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t("rewards.maintain_note")}
                </Typography.Text>
              </Space>
            </Space>
          </Col>

          <Col xs={24} md={10}>
            <Row justify="end" align="middle" gutter={[10, 10]}>
              <Col>
                <Button
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={() => load(true)}
                  disabled={loading}
                >
                  {t("rewards.refresh_config")}
                </Button>
              </Col>
              {dirtyItems.length > 0 ? (
                <>
                  <Col>
                    <Button onClick={resetAllDrafts} disabled={batchSaving}>
                      {t("rewards.discard_all_changes")}
                    </Button>
                  </Col>
                  <Col>
                    <Popconfirm
                      title={t("rewards.confirm_batch_save", {v0: dirtyItems.length})}
                      description={t("rewards.batch_save_detail", {
                        v0: dirtyItems.map((d) => d.name).join("、"),
                        v1: overview?.next_effective_on ?? t("common.next_day"),
                      })}
                      onConfirm={saveAllDirty}
                      okText={t("rewards.confirm_save_all")}
                      cancelText={t("common.cancel")}
                    >
                      <Button
                        type="primary"
                        loading={batchSaving}
                        icon={<SaveOutlined />}
                        style={{
                          background: BRAND_RED,
                          borderColor: BRAND_RED,
                          boxShadow: "0 2px 8px rgba(226,75,74,0.3)",
                        }}
                      >
                        {t("rewards.batch_save_all", {v0: dirtyItems.length})}
                      </Button>
                    </Popconfirm>
                  </Col>
                </>
              ) : (
                <Col>
                  <Tag
                    color="success"
                    icon={<CheckCircleOutlined />}
                    style={{ padding: "5px 12px", fontSize: 13, borderRadius: 20 }}
                  >
                    {t("rewards.all_in_sync")}
                  </Tag>
                </Col>
              )}
            </Row>
          </Col>
        </Row>

        <Divider style={{ margin: "14px 0" }} />

        {/* 规则机制摘要胶囊栏 */}
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} lg={8}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "#f0f5ff",
                borderRadius: 8,
                border: "1px solid #d6e4ff",
              }}
            >
              <ClockCircleOutlined style={{ color: "#2f54eb", fontSize: 16 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: "#1d39c4" }}>
                  {t("rewards.next_day_mechanism")}
                </Typography.Text>
                <div style={{ fontSize: 11, color: "#597ef7" }}>
                  {t("rewards.next_day_note")}
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "#fffbe6",
                borderRadius: 8,
                border: "1px solid #ffe58f",
              }}
            >
              <CalendarOutlined style={{ color: "#d48806", fontSize: 16 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: "#d48806" }}>
                  {t("rewards.next_effective_time", {v0: overview?.next_effective_on ?? "-"})}
                </Typography.Text>
                <div style={{ fontSize: 11, color: "#faad14" }}>
                  {t("rewards.claimed_kept_note")}
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={24} lg={8}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "#f6ffed",
                borderRadius: 8,
                border: "1px solid #b7eb8f",
              }}
            >
              <SafetyCertificateOutlined style={{ color: "#389e0d", fontSize: 16 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: "#389e0d" }}>
                  {t("rewards.audit_safety")}
                </Typography.Text>
                <div style={{ fontSize: 11, color: "#52c41a" }}>
                  {t("rewards.audit_note")}
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 模块 1：7 天连续签到梯度阶梯卡片 */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #ebebeb",
        }}
        title={
          <Space align="center" size={8}>
            <CalendarOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              {checkin ? checkin.name : t("rewards.checkin_ladder")}
            </span>
            <Tag color="orange" bordered={false}>
              {t("rewards.seven_day_cycle")}
            </Tag>
          </Space>
        }
        extra={
          checkinStats ? (
            <Space size={16} wrap>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("rewards.full_checkin_total")} </span>
                <Typography.Text
                  strong
                  style={{
                    fontSize: 15,
                    color: checkinStats.sumDiff !== 0 ? BRAND_RED : "#262626",
                  }}
                >
                  +{checkinStats.draftSum.toLocaleString()} {t("common.coins_unit")}
                </Typography.Text>
                {checkinStats.sumDiff !== 0 && (
                  <Tag
                    color={checkinStats.sumDiff > 0 ? "success" : "error"}
                    bordered={false}
                    style={{ marginLeft: 6, fontSize: 11 }}
                  >
                    {checkinStats.sumDiff > 0
                      ? `+${checkinStats.sumDiff}`
                      : checkinStats.sumDiff}
                  </Tag>
                )}
              </div>
              <Divider type="vertical" />
              <div>
                <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("rewards.daily_avg_grant")} </span>
                <Typography.Text strong style={{ fontSize: 14 }}>
                  {t("rewards.daily_avg", {v0: checkinStats.dailyAvg})}
                </Typography.Text>
              </div>
              <Divider type="vertical" />
              <div>
                <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("rewards.day_seven_burst_ratio")} </span>
                <Typography.Text strong style={{ fontSize: 14, color: "#fa8c16" }}>
                  {checkinStats.boostRatio}x
                </Typography.Text>
              </div>
            </Space>
          ) : null
        }
        loading={loading && !checkin}
      >
        {checkin ? (
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            {/* 说明信息 */}
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {t("rewards.checkin_explainer")}
            </Typography.Text>

            {/* 7 天阶梯卡片网格：桌面端 7 列横排成周期周历，小屏幕自适应 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 10,
                width: "100%",
              }}
            >
              {(drafts[checkin.code] ?? []).map((val, idx) => {
                const dayNum = idx + 1;
                const isDay7 = dayNum === 7;
                const isDay3 = dayNum === 3;
                const curVal = checkin.current.amounts[idx] ?? 0;
                const pendVal = checkin.pending?.amounts[idx];
                const baseVal = baseline(checkin)[idx] ?? curVal;
                const isItemDiff = Number.isFinite(val) && val !== baseVal;
                const diff = Number.isFinite(val) ? val - baseVal : 0;
                const isSaving = savingCodes.has(checkin.code) || batchSaving;

                return (
                  <div
                    key={idx}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 10,
                      background: isDay7
                        ? "linear-gradient(180deg, #fffbf0 0%, #fff7e6 100%)"
                        : isDay3
                        ? "#fafbfc"
                        : "#ffffff",
                      border: isItemDiff
                        ? `1.5px solid ${BRAND_RED}`
                        : isDay7
                        ? "1.5px solid #ffd591"
                        : "1px solid #ebebeb",
                      boxShadow: isDay7
                        ? "0 2px 10px rgba(250, 173, 20, 0.18)"
                        : isItemDiff
                        ? "0 2px 8px rgba(226, 75, 74, 0.12)"
                        : "0 1px 3px rgba(0,0,0,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      position: "relative",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* 顶部天数徽章 */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Tag
                        color={isDay7 ? "gold" : isDay3 ? "orange" : "default"}
                        bordered={false}
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          padding: "1px 6px",
                          borderRadius: 4,
                          margin: 0,
                        }}
                      >
                        {t("rewards.day_number", {v0: dayNum})}
                      </Tag>
                      {isDay7 ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#d48806",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 2,
                          }}
                        >
                          <TrophyOutlined /> {t("rewards.full_checkin")}
                        </span>
                      ) : isDay3 ? (
                        <span style={{ fontSize: 11, color: "#fa8c16", fontWeight: 600 }}>
                          <FireOutlined /> {t("rewards.advanced")}
                        </span>
                      ) : null}
                    </div>

                    {/* 输入框 */}
                    <div>
                      <InputNumber
                        min={1}
                        max={MAX_AMOUNT}
                        precision={0}
                        style={{
                          width: "100%",
                          fontWeight: 700,
                          fontSize: 14,
                          textAlign: "center",
                          borderColor: isItemDiff ? BRAND_RED : undefined,
                        }}
                        prefix={
                          <DollarCircleFilled
                            style={{
                              color: isDay7 ? "#faad14" : "#bfbfbf",
                              fontSize: 12,
                            }}
                          />
                        }
                        value={Number.isFinite(val) ? val : null}
                        onChange={(next) => setDraftValue(checkin.code, idx, next)}
                        disabled={isSaving}
                      />
                    </div>

                    {/* 底部基线参考与 diff */}
                    <div
                      style={{
                        fontSize: 11,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        color: "#8c8c8c",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{t("rewards.current_value", {v0: curVal})}</span>
                        {isItemDiff && (
                          <span
                            style={{
                              color: diff > 0 ? "#52c41a" : "#ff4d4f",
                              fontWeight: 700,
                            }}
                          >
                            {diff > 0 ? `+${diff} ▲` : `${diff} ▼`}
                          </span>
                        )}
                      </div>
                      {pendVal !== undefined && (
                        <span style={{ color: "#d48806" }}>{t("rewards.pending_value", {v0: pendVal})}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Divider style={{ margin: "6px 0" }} />

            {/* 底部操作与工具栏 */}
            <Row justify="space-between" align="middle" gutter={[12, 12]}>
              <Col>
                <Space wrap size={10}>
                  <Dropdown menu={{ items: presetMenuItems }}>
                    <Button icon={<ThunderboltOutlined />}>
                      {t("rewards.quick_apply_preset")} <ArrowDownOutlined style={{ fontSize: 10 }} />
                    </Button>
                  </Dropdown>
                  <Tooltip title={t("rewards.live_version_time")}>
                    <Tag icon={<CheckCircleOutlined />} color="default">
                      {t("rewards.current_version_label")}{" "}
                      {checkin.current.is_default || !checkin.current.effective_on
                        ? t("rewards.builtin_default")
                        : t("rewards.effective_from_checkin", {v0: checkin.current.effective_on})}
                    </Tag>
                  </Tooltip>
                  {checkin.pending && (
                    <Tag icon={<ClockCircleOutlined />} color="orange">
                      {t("rewards.scheduled_update", {v0: checkin.pending.effective_on, v1: checkin.pending.amounts.join("/")})}
                    </Tag>
                  )}
                </Space>
              </Col>

              <Col>
                <Space size={8}>
                  <Button
                    disabled={!isDirty(checkin) || savingCodes.has(checkin.code) || batchSaving}
                    onClick={() => resetDraft(checkin)}
                  >
                    {t("rewards.revert_unsaved")}
                  </Button>
                  <Popconfirm
                    title={t("rewards.confirm_save_checkin")}
                    description={t("rewards.new_ladder_effective", {
                      v0: overview?.next_effective_on ?? t("common.tomorrow"),
                    })}
                    onConfirm={() => saveOne(checkin)}
                    okText={t("rewards.confirm_save")}
                    cancelText={t("common.cancel")}
                    disabled={!isDirty(checkin)}
                  >
                    <Button
                      type="primary"
                      disabled={!isDirty(checkin)}
                      loading={savingCodes.has(checkin.code) || batchSaving}
                      icon={<SaveOutlined />}
                      style={
                        isDirty(checkin)
                          ? {
                              background: BRAND_RED,
                              borderColor: BRAND_RED,
                              boxShadow: "0 2px 6px rgba(226,75,74,0.25)",
                            }
                          : undefined
                      }
                    >
                      {t("rewards.save_checkin_ladder")}
                    </Button>
                  </Popconfirm>
                </Space>
              </Col>
            </Row>
          </Space>
        ) : (
          <Typography.Text type="secondary">{t("rewards.no_checkin_config")}</Typography.Text>
        )}
      </Card>

      {/* 模块 2：任务奖励列表 */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #ebebeb",
        }}
        title={
          <Space align="center" size={8}>
            <TrophyOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t("rewards.tasks_behavior_config")}</span>
          </Space>
        }
        extra={
          <Segmented
            options={[
              { label: t("rewards.all_tasks"), value: "all" },
              { label: t("rewards.newbie_binding"), value: "onetime" },
              { label: t("rewards.daily_active"), value: "daily" },
            ]}
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val as string)}
          />
        }
        loading={loading && singles.length === 0}
      >
        <Table
          rowKey="code"
          dataSource={filteredSingles}
          columns={singleColumns}
          pagination={false}
          size="middle"
        />
      </Card>

      {/* 模块 3：变更与审计记录 */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #ebebeb",
        }}
        title={
          <Space align="center" size={8}>
            <HistoryOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t("rewards.config_change_log")}</span>
            <Tag bordered={false} style={{ color: "#8c8c8c" }}>
              {t("rewards.total_records", {v0: filteredChanges.length})}
            </Tag>
          </Space>
        }
        extra={
          <Space size={8}>
            <span style={{ fontSize: 12, color: "#8c8c8c" }}>{t("rewards.filter_by_task")}</span>
            <Select
              size="small"
              style={{ width: 150 }}
              value={historyFilter}
              onChange={(val) => {
                setHistoryFilter(val);
                setHistoryPage(1);
              }}
              options={[
                { label: t("rewards.all_tasks"), value: "all" },
                ...items.map((it) => ({ label: it.name, value: it.code })),
              ]}
            />
          </Space>
        }
      >
        <Table
          rowKey="id"
          dataSource={pagedChanges}
          pagination={false}
          size="middle"
          locale={{ emptyText: t("rewards.no_change_records") }}
          columns={[
            {
              title: t("rewards.change_time"),
              dataIndex: "created_at",
              key: "created_at",
              width: 170,
              render: (v: string) => (
                <Tooltip title={v}>
                  <Space size={4}>
                    <ClockCircleOutlined style={{ color: "#bfbfbf", fontSize: 12 }} />
                    <Typography.Text style={{ fontSize: 13 }}>{formatTime(v)}</Typography.Text>
                  </Space>
                </Tooltip>
              ),
            },
            {
              title: t("rewards.task_target"),
              dataIndex: "code",
              key: "code",
              width: 170,
              render: (code: string) => {
                const target = items.find((item) => item.code === code);
                const isCheckin = code === "checkin";
                return (
                  <Space size={6}>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {target?.name ?? code}
                    </Typography.Text>
                    {isCheckin && (
                      <Tag color="orange" bordered={false} style={{ fontSize: 10, padding: "0 4px" }}>
                        {t("rewards.seven_day_ladder")}
                      </Tag>
                    )}
                  </Space>
                );
              },
            },
            {
              title: t("rewards.adjusted_value"),
              dataIndex: "amounts",
              key: "amounts",
              render: (amounts: number[], row: ChangeRow) => {
                if (row.code === "checkin") {
                  return (
                    <Tooltip
                      title={
                        <div>
                          <div>{t("rewards.full_ladder_detail")}</div>
                          {amounts.map((a, i) => (
                            <div key={i}>
                              {t("rewards.day_reward", {v0: i + 1, v1: a})}
                            </div>
                          ))}
                        </div>
                      }
                    >
                      <Space size={4} wrap>
                        <Tag color="gold" style={{ fontSize: 12, cursor: "pointer" }}>
                          {t("rewards.ladder_label", {v0: amountText(amounts)})}
                        </Tag>
                      </Space>
                    </Tooltip>
                  );
                }
                const val = amounts[0] ?? 0;
                return (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "#f6ffed",
                      color: "#389e0d",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    <DollarCircleFilled style={{ fontSize: 12 }} />+{val.toLocaleString()} {t("common.coins_unit")}
                  </div>
                );
              },
            },
            {
              title: t("rewards.effective_date_status"),
              dataIndex: "effective_on",
              key: "effective_on",
              width: 170,
              render: (effective_on: string | null) => {
                if (!effective_on) return "-";
                const today = overview?.today ?? "";
                const isPending = today && effective_on > today;
                return (
                  <Space size={6}>
                    <Typography.Text style={{ fontSize: 13 }}>{effective_on}</Typography.Text>
                    {isPending ? (
                      <Tag color="orange" bordered={false} icon={<ClockCircleOutlined />}>
                        {t("rewards.pending_effective_status")}
                      </Tag>
                    ) : (
                      <Tag color="green" bordered={false} icon={<CheckCircleOutlined />}>
                        {t("rewards.effective_status")}
                      </Tag>
                    )}
                  </Space>
                );
              },
            },
            {
              title: t("rewards.operator"),
              dataIndex: "actor",
              key: "actor",
              width: 140,
              render: (actor: string) => (
                <Space size={6}>
                  <Avatar
                    size={22}
                    style={{
                      backgroundColor: "#f56a00",
                      fontSize: 11,
                      verticalAlign: "middle",
                    }}
                  >
                    {actor.slice(0, 1)}
                  </Avatar>
                  <Typography.Text style={{ fontSize: 13 }}>{actor}</Typography.Text>
                </Space>
              ),
            },
          ]}
        />

        {filteredChanges.length > pageSize && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Pagination
              size="small"
              current={historyPage}
              pageSize={pageSize}
              total={filteredChanges.length}
              onChange={(page) => setHistoryPage(page)}
              showTotal={(total) => t("rewards.total_records", {v0: total})}
            />
          </div>
        )}
      </Card>
    </Space>
  );
}
