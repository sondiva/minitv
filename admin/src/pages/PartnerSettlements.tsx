import { Space, Table, Tag, Typography } from "antd";
import { formatTime, useLoad } from "../hooks";
import { t } from "../copy";

type SettlementRow = {
  id: number;
  month: string;
  currency: string;
  gross_cents: number;
  revenue_cents: number;
  effective_share_bps: number;
  order_count: number;
  status: string;
  confirmed_at: string | null;
  paid_at: string | null;
};

function STATUS(): Record<string, { text: string; color?: string }> { return {
  draft: { text: t("settlements.pending_confirm"), color: "orange" },
  confirmed: { text: t("settlements.confirmed"), color: "blue" },
  paid: { text: t("settlements.paid"), color: "green" },
};; }

const money = (cents: number, currency = "USD") =>
  `${currency === "USD" ? "$" : ""}${(cents / 100).toFixed(2)}`;

export default function PartnerSettlements() {
  const { data, loading } = useLoad<{ items: SettlementRow[] }>("/partner/v1/settlements", {
    items: [],
  });

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Text type="secondary">
        {t("partnersettlements.settlement_cycle_note")}
      </Typography.Text>
      <Table<SettlementRow>
        rowKey="id"
        loading={loading}
        dataSource={data.items}
        pagination={false}
        columns={[
          { title: t("settlements.month"), dataIndex: "month", width: 110 },
          {
            title: t("settlements.first_order_amount"),
            dataIndex: "gross_cents",
            width: 120,
            render: (value: number, row) => money(value, row.currency),
          },
          {
            title: t("partnersettlements.revenue_share_ratio"),
            dataIndex: "effective_share_bps",
            width: 100,
            render: (value: number) => `${(value / 100).toFixed(2)}%`,
          },
          {
            title: t("settlements.payable_amount"),
            dataIndex: "revenue_cents",
            width: 120,
            render: (value: number, row) => (
              <Typography.Text strong>{money(value, row.currency)}</Typography.Text>
            ),
          },
          { title: t("settlements.order_count"), dataIndex: "order_count", width: 80 },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 100,
            render: (value: string) => {
              const meta = STATUS()[value] ?? { text: value };
              return <Tag color={meta.color}>{meta.text}</Tag>;
            },
          },
          {
            title: t("settlements.confirm_or_pay"),
            key: "dates",
            width: 200,
            render: (_, row) => (
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                {formatTime(row.confirmed_at)} / {formatTime(row.paid_at)}
              </span>
            ),
          },
        ]}
      />
    </Space>
  );
}
