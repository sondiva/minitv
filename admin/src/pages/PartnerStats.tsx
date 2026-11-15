import { useState } from "react";
import { Card, Col, Row, Space, Table, Tag, Typography } from "antd";
import { useLoad } from "../hooks";
import { t } from "../copy";

type Overview = {
  days: number;
  plays: number;
  completes: number;
  completion_rate: number;
  viewers: number;
  unlocks: number;
  unlock_users: number;
  first_orders: number;
  gross_cents: number;
  revenue_cents: number;
  effective_share_bps: number;
  currency: string;
};

type DramaRow = {
  id: number;
  title: string;
  status: string;
  plays: number;
  completion_rate: number;
  viewers: number;
  unlocks: number;
  first_orders: number;
  gross_cents: number;
  revenue_cents: number;
};

const money = (cents: number, currency = "USD") =>
  `${currency === "USD" ? "$" : ""}${(cents / 100).toFixed(2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function PartnerStats() {
  const [days, setDays] = useState(30);
  const { data: overview, loading } = useLoad<Overview>(
    `/partner/v1/stats/overview?days=${days}`,
    {
      days,
      plays: 0,
      completes: 0,
      completion_rate: 0,
      viewers: 0,
      unlocks: 0,
      unlock_users: 0,
      first_orders: 0,
      gross_cents: 0,
      revenue_cents: 0,
      effective_share_bps: 0,
      currency: "USD",
    }
  );
  const { data: dramas } = useLoad<{ items: DramaRow[] }>(
    `/partner/v1/stats/dramas?days=${days}`,
    { items: [] }
  );

  const metrics = [
    { label: t("dramas.play_count"), value: overview.plays, note: t("partnerstats.completes_count", {v0: overview.completes}) },
    { label: t("common.completion_rate"), value: percent(overview.completion_rate), note: t("partnerstats.completes_over_plays") },
    { label: t("partnerstats.viewers"), value: overview.viewers, note: t("partnerstats.dedup_by_user") },
    {
      label: t("partnerstats.coin_unlocks"),
      value: overview.unlocks,
      note: t("partnerstats.unlock_users_note", {v0: overview.unlock_users}),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("app.data_center")}
        </Typography.Title>
        {[7, 30, 90].map((value) => (
          <Tag
            key={value}
            color={days === value ? "red" : undefined}
            style={{ cursor: "pointer", padding: "2px 10px" }}
            onClick={() => setDays(value)}
          >
            {t("partnerstats.recent_days", {v0: value})}
          </Tag>
        ))}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("partnerstats.coin_unlocks_note")}
        </Typography.Text>
      </Space>

      <Row gutter={10}>
        {metrics.map((item) => (
          <Col xs={12} lg={6} key={item.label}>
            <Card size="small" loading={loading}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {item.label}
              </Typography.Text>
              <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
                {item.value}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {item.note}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={10}>
        <Col xs={24} lg={8}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("partnerstats.member_first_order")}
            </Typography.Text>
            <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
              {overview.first_orders}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("partnerstats.only_first_order_note")}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("settlements.first_order_amount")}
            </Typography.Text>
            <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
              {money(overview.gross_cents, overview.currency)}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("partnerstats.exclude_renewals")}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("partnerstats.estimated_revenue")} · {(overview.effective_share_bps / 100).toFixed(0)}%
            </Typography.Text>
            <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
              {money(overview.revenue_cents, overview.currency)}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("partnerstats.monthly_settlement_note")}
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t("partnerstats.per_drama_data")}>
        <Table<DramaRow>
          rowKey="id"
          size="small"
          dataSource={dramas.items}
          pagination={false}
          scroll={{ x: 820 }}
          columns={[
            { title: t("drama.drama"), dataIndex: "title" },
            { title: t("dashboard.plays"), dataIndex: "plays", width: 80 },
            {
              title: t("common.completion_rate"),
              dataIndex: "completion_rate",
              width: 90,
              render: (value: number) => percent(value),
            },
            { title: t("partnerstats.viewers"), dataIndex: "viewers", width: 90 },
            { title: t("partnerstats.unlocks"), dataIndex: "unlocks", width: 70 },
            { title: t("partnerstats.first_order"), dataIndex: "first_orders", width: 70 },
            {
              title: t("settlements.first_order_amount"),
              dataIndex: "gross_cents",
              width: 110,
              render: (value: number) => money(value),
            },
            {
              title: t("partnerstats.estimated_revenue"),
              dataIndex: "revenue_cents",
              width: 110,
              render: (value: number) => money(value),
            },
          ]}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("partnerstats.metric_scope_note")}
      </Typography.Text>
    </Space>
  );
}
