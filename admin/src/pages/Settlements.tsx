import { useState } from "react";
import { Button, Input, Modal, Space, Table, Tag, Typography, message } from "antd";
import { api, errorText } from "../api";
import { formatTime, useLoad } from "../hooks";
import { t } from "../copy";

type Row = {
  id: number;
  supplier: { id: number; name: string } | null;
  month: string;
  currency: string;
  gross_cents: number;
  revenue_cents: number;
  effective_share_bps: number;
  order_count: number;
  status: string;
  note: string;
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

export default function Settlements() {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [query, setQuery] = useState(current);
  const { data, loading, reload } = useLoad<{ items: Row[]; total: number }>(
    `/admin/v1/settlements?month=${query}`,
    { items: [], total: 0 }
  );

  const generate = async () => {
    try {
      const result = await api<{ created: number; updated: number; skipped: number }>(
        "/admin/v1/settlements/generate",
        { method: "POST", body: JSON.stringify({ month: query }) }
      );
      message.success(
        t("settlements.generate_summary", {v0: result.created, v1: result.updated, v2: result.skipped})
      );
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const change = (row: Row, status: "confirmed" | "paid") => {
    Modal.confirm({
      title: status === "confirmed" ? t("settlements.confirm_statement") : t("settlements.mark_paid"),
      content:
        status === "confirmed"
          ? t("settlements.confirm_amount", {v0: row.supplier?.name ?? "", v1: row.month, v2: money(row.revenue_cents, row.currency)})
          : t("settlements.record_paid", {v0: row.month, v1: money(row.revenue_cents, row.currency)}),
      okText: status === "confirmed" ? t("common.confirm") : t("settlements.paid"),
      onOk: async () => {
        try {
          await api(`/admin/v1/settlements/${row.id}/status`, {
            method: "POST",
            body: JSON.stringify({ status }),
          });
          message.success(t("settlements.updated"));
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space wrap>
        <Input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          style={{ width: 160 }}
        />
        <Button onClick={() => setQuery(month)}>{t("settlements.query")}</Button>
        <Button type="primary" onClick={generate}>
          {t("settlements.generate_statement")}
        </Button>
        <Typography.Text type="secondary">
          {t("settlements.first_order_only_note")}
        </Typography.Text>
      </Space>

      <Table<Row>
        rowKey="id"
        loading={loading}
        dataSource={data.items}
        pagination={false}
        scroll={{ x: 940 }}
        columns={[
          { title: t("suppliers.supplier"), key: "supplier", width: 160, render: (_, row) => row.supplier?.name ?? "-" },
          { title: t("settlements.month"), dataIndex: "month", width: 100 },
          {
            title: t("settlements.first_order_amount"),
            dataIndex: "gross_cents",
            width: 120,
            render: (value: number, row) => money(value, row.currency),
          },
          {
            title: t("suppliers.revenue_share"),
            dataIndex: "effective_share_bps",
            width: 90,
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
            width: 180,
            render: (_, row) => (
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                {formatTime(row.confirmed_at)} / {formatTime(row.paid_at)}
              </span>
            ),
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 150,
            render: (_, row) => (
              <Space size={4}>
                {row.status === "draft" && (
                  <Button type="link" size="small" onClick={() => change(row, "confirmed")}>
                    {t("common.confirm")}
                  </Button>
                )}
                {row.status === "confirmed" && (
                  <Button type="link" size="small" onClick={() => change(row, "paid")}>
                    {t("settlements.mark_payment")}
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
}
