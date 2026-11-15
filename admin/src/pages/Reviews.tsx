import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { api, errorText } from "../api";
import { formatTime, useLoad } from "../hooks";
import { t } from "../copy";

type ReviewRow = {
  id: number;
  title: string;
  cover_url: string;
  status: string;
  review_state: string;
  review_note: string | null;
  free_episode_count: number;
  episode_count: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  supplier: { id: number; name: string; contact_email: string } | null;
};

type Payload = {
  items: ReviewRow[];
  total: number;
  counts: { pending: number; approved: number; rejected: number };
};

function TABS(){ return [
  { key: "pending", label: t("common.pending_review") },
  { key: "approved", label: t("partnerdramas.pending_publish") },
  { key: "rejected", label: t("reviews.rejected") },
];; }

export default function Reviews() {
  const [state, setState] = useState("pending");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useLoad<Payload>(
    `/admin/v1/reviews?state=${state}&page=${page}&page_size=20`,
    {
    items: [],
    total: 0,
    counts: { pending: 0, approved: 0, rejected: 0 },
    }
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectIds, setRejectIds] = useState<number[]>([]);
  const [form] = Form.useForm();

  const refresh = async () => {
    setSelected([]);
    await reload();
  };

  const decide = async (ids: number[], decision: "approve" | "reject", note = "") => {
    try {
      const result = await api<{ done: number; skipped: { id: number; reason: string }[] }>(
        "/admin/v1/reviews/batch",
        {
          method: "POST",
          body: JSON.stringify({ drama_ids: ids, decision, note }),
        }
      );
      if (result.skipped.length) {
        Modal.info({
          title: t("reviews.processed_summary", {v0: result.done, v1: result.skipped.length}),
          content: (
            <ul style={{ paddingLeft: 18 }}>
              {result.skipped.map((item) => (
                <li key={item.id}>
                  {t("reviews.drama_reason", {v0: item.id, v1: item.reason})}
                </li>
              ))}
            </ul>
          ),
        });
      } else {
        message.success(decision === "approve" ? t("reviews.approved") : t("reviews.rejected"));
      }
      await refresh();
    } catch (e) {
      message.error(errorText(e));
      throw e;
    }
  };

  const openReject = (ids: number[]) => {
    setRejectIds(ids);
    form.resetFields();
    setRejectOpen(true);
  };

  const publish = (row: ReviewRow) => {
    Modal.confirm({
      title: t("reviews.publish_title", {v0: row.title}),
      content: t("reviews.publish_confirm", {v0: row.episode_count}),
      okText: t("episodespanel.publish"),
      onOk: async () => {
        try {
          await api(`/admin/v1/reviews/${row.id}/publish`, { method: "POST" });
          message.success(t("common.published"));
          await refresh();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const counts = data.counts;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space wrap>
        <Typography.Text type="secondary">
          {t("reviews.approve_only_note")}
        </Typography.Text>
        {state === "pending" && selected.length > 0 && (
          <>
            <span style={{ flex: 1 }} />
            <Button type="primary" onClick={() => decide(selected, "approve")}>
              {t("reviews.batch_approve", {v0: selected.length})}
            </Button>
            <Button danger onClick={() => openReject(selected)}>
              {t("reviews.batch_reject")}
            </Button>
          </>
        )}
      </Space>

      <Tabs
        activeKey={state}
        onChange={(key) => {
          setState(key);
          setPage(1);
          setSelected([]);
        }}
        items={TABS().map((tab) => ({
          key: tab.key,
          label: `${tab.label}（${counts[tab.key as keyof typeof counts] ?? 0}）`,
        }))}
      />

      <Table<ReviewRow>
        rowKey="id"
        loading={loading}
        dataSource={data.items}
        pagination={{
          current: page,
          pageSize: 20,
          total: data.total,
          showSizeChanger: false,
          onChange: (next) => setPage(next),
        }}
        scroll={{ x: 980 }}
        rowSelection={
          state === "pending"
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys as number[]),
              }
            : undefined
        }
        columns={[
          {
            title: t("drama.drama"),
            dataIndex: "title",
            width: 240,
            render: (value: string, row) => (
              <div>
                <Link to={`/dramas/${row.id}`}>{value}</Link>
                {row.review_note && (
                  <div style={{ fontSize: 12, color: "#A32D2D" }}>{t("partnerdramas.rejected_note", {v0: row.review_note})}</div>
                )}
              </div>
            ),
          },
          {
            title: t("suppliers.supplier"),
            key: "supplier",
            width: 160,
            render: (_, row) => row.supplier?.name ?? "-",
          },
          { title: t("episodespanel.episode_count"), dataIndex: "episode_count", width: 70 },
          { title: t("dramas.free"), dataIndex: "free_episode_count", width: 70 },
          {
            title: t("reviews.submitted_at"),
            dataIndex: "submitted_at",
            width: 150,
            render: (value: string | null) => formatTime(value),
          },
          {
            title: t("common.status"),
            key: "state",
            width: 100,
            render: (_, row) =>
              state === "pending" ? (
                <Tag color="orange">{t("common.pending_review")}</Tag>
              ) : state === "approved" ? (
                <Tag color="blue">{t("partnerdramas.pending_publish")}</Tag>
              ) : (
                <Tag color="red">{t("reviews.rejected")}</Tag>
              ),
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 190,
            render: (_, row) =>
              state === "pending" ? (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => decide([row.id], "approve")}>
                    {t("moderation.approve")}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => openReject([row.id])}
                  >
                    {t("reviews.reject")}
                  </Button>
                  <Link to={`/dramas/${row.id}`}>{t("reviews.view")}</Link>
                </Space>
              ) : state === "approved" ? (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => publish(row)}>
                    {t("episodespanel.publish")}
                  </Button>
                  <Link to={`/dramas/${row.id}`}>{t("reviews.view")}</Link>
                </Space>
              ) : (
                <Link to={`/dramas/${row.id}`}>{t("reviews.view")}</Link>
              ),
          },
        ]}
      />

      <Modal
        title={rejectIds.length > 1 ? t("reviews.batch_reject_title", {v0: rejectIds.length}) : t("reviews.reject_drama")}
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => form.submit()}
        okText={t("reviews.confirm_reject")}
        okButtonProps={{ danger: true }}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            try {
              await decide(rejectIds, "reject", values.note);
              setRejectOpen(false);
            } catch {
              /* message already shown */
            }
          }}
        >
          <Form.Item
            label={t("reviews.reject_reason")}
            name="note"
            rules={[{ required: true, message: t("reviews.write_reject_reason") }]}
            extra={rejectIds.length > 1 ? t("reviews.reason_applies_all") : undefined}
          >
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
