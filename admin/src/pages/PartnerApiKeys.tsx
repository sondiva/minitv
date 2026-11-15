import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { api, errorText } from "../api";
import { formatTime, useLoad } from "../hooks";
import { t } from "../copy";

type KeyState = "active" | "expiring" | "expired" | "revoked";

type KeyRow = {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  state: KeyState;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type Summary = { active: number; expiring: number; expired: number; revoked: number; total: number };

function SCOPE_LABELS(): Record<string, string> { return {
  read: t("apikeys.scope_read"),
  write: t("apikeys.scope_write"),
  upload: t("common.upload"),
};; }

function SCOPE_OPTIONS(){ return [
  { value: "read", label: t("apikeys.scope_read_desc") },
  { value: "write", label: t("partnerapikeys.scope_write_partner") },
  { value: "upload", label: t("partnerapikeys.scope_upload") },
];; }

function TTL_OPTIONS(){ return [
  { value: 30, label: t("apikeys.duration_30_days") },
  { value: 90, label: t("apikeys.days_90") },
  { value: 180, label: t("apikeys.days_180") },
  { value: 365, label: t("apikeys.duration_365_days") },
  { value: 0, label: t("apikeys.long_term_not_recommended") },
];; }

function STATE_TAG(): Record<KeyState, { color: string; label: string }> { return {
  active: { color: "green", label: t("common.active") },
  expiring: { color: "orange", label: t("apikeys.expiring_soon") },
  expired: { color: "red", label: t("apikeys.expired") },
  revoked: { color: "default", label: t("common.revoked") },
};; }

const CLI_ONE_LINER = (key: string) =>
  `curl -fsSL https://minitv.us/cli/install.sh | MINITV_API_KEY='${key}' sh`;

function scopeText(scopes: string[]): string {
  if (!scopes.length) return t("apikeys.follow_role");
  return scopes.map((scope) => SCOPE_LABELS()[scope] ?? scope).join(" · ");
}

export default function PartnerApiKeys() {
  const { data, loading, reload } = useLoad<{ items: KeyRow[]; summary?: Summary }>(
    "/partner/v1/api-keys",
    { items: [], summary: { active: 0, expiring: 0, expired: 0, revoked: 0, total: 0 } }
  );
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [secret, setSecret] = useState<{ key: string; name: string; expires_at: string | null } | null>(
    null
  );
  const [pendingSecret, setPendingSecret] = useState<{
    key: string;
    name: string;
    expires_at: string | null;
  } | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items.filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      if (stateFilter && row.state !== stateFilter) return false;
      return true;
    });
  }, [data.items, query, stateFilter]);

  const summary = data.summary ?? { active: 0, expiring: 0, expired: 0, revoked: 0, total: 0 };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("stagepages.copied"));
    } catch {
      message.error(t("apikeys.copy_failed_manual"));
    }
  };

  const create = async (values: any) => {
    try {
      const created = await api<KeyRow & { key: string }>("/partner/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          scopes: values.scopes,
          expires_in_days: values.expires_in_days,
        }),
      });
      setCreateOpen(false);
      form.resetFields();
      setPendingSecret({
        key: created.key,
        name: created.name,
        expires_at: created.expires_at,
      });
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const saveEdit = async (values: any) => {
    if (!editing) return;
    try {
      await api(`/partner/v1/api-keys/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: values.name, scopes: values.scopes }),
      });
      message.success(t("common.saved"));
      setEditing(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const rotate = (row: KeyRow) => {
    Modal.confirm({
      title: t("apikeys.rotate_key_title", {v0: row.name}),
      content: t("partnerapikeys.rotate_confirm"),
      okText: t("apikeys.rotate"),
      onOk: async () => {
        try {
          const issued = await api<KeyRow & { key: string }>(
            `/partner/v1/api-keys/${row.id}/rotate`,
            { method: "POST" }
          );
          setSecret({ key: issued.key, name: issued.name, expires_at: issued.expires_at });
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const revoke = (row: KeyRow) => {
    Modal.confirm({
      title: t("apikeys.revoke_key_title", {v0: row.name}),
      content: t("partnerapikeys.revoke_script_fail"),
      okText: t("apikeys.revoke"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/partner/v1/api-keys/${row.id}/revoke`, {
            method: "POST",
            body: JSON.stringify({}),
          });
          message.success(t("common.revoked"));
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t("partnerapikeys.search_key_name")}
            style={{ width: 220 }}
            onSearch={setQuery}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            allowClear
            placeholder={t("common.all_status")}
            style={{ width: 140 }}
            value={stateFilter || undefined}
            onChange={(value) => setStateFilter(value ?? "")}
            options={[
              { value: "active", label: t("common.active") },
              { value: "expiring", label: t("apikeys.expiring_soon") },
              { value: "expired", label: t("apikeys.expired") },
              { value: "revoked", label: t("common.revoked") },
            ]}
          />
          <Tag color="green">{t("common.active")} {summary.active}</Tag>
          {summary.expiring > 0 && <Tag color="orange">{t("apikeys.expiring_soon")} {summary.expiring}</Tag>}
          {summary.expired > 0 && <Tag color="red">{t("apikeys.expired")} {summary.expired}</Tag>}
          {summary.revoked > 0 && <Tag>{t("common.revoked")} {summary.revoked}</Tag>}
        </Space>
        <Space>
          <Button onClick={() => reload()}>{t("common.refresh")}</Button>
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            {t("apikeys.create_key")}
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        message={t("partnerapikeys.key_shown_once_partner")}
      />

      <Table<KeyRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 980 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          {
            title: t("common.name"),
            dataIndex: "name",
            width: 220,
            render: (value: string, row) => (
              <div>
                <Typography.Text>{value}</Typography.Text>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                  {row.last_used_at ? t("apikeys.last_used", {v0: formatTime(row.last_used_at)}) : t("apikeys.never_used")}
                </div>
              </div>
            ),
          },
          {
            title: t("apikeys.prefix"),
            dataIndex: "key_prefix",
            width: 190,
            render: (value: string) => (
              <Typography.Text code style={{ whiteSpace: "nowrap" }}>
                {value}…
              </Typography.Text>
            ),
          },
          {
            title: t("common.permission"),
            dataIndex: "scopes",
            width: 150,
            render: (value: string[]) => (
              <Typography.Text style={{ fontSize: 12 }}>{scopeText(value)}</Typography.Text>
            ),
          },
          {
            title: t("common.status"),
            dataIndex: "state",
            width: 100,
            render: (value: KeyState) => {
              const meta = STATE_TAG()[value] ?? { color: "default", label: value };
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          {
            title: t("apikeys.expires"),
            dataIndex: "expires_at",
            width: 150,
            render: (value: string | null) => formatTime(value),
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 190,
            render: (_, row) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  disabled={row.state === "revoked" || row.state === "expired"}
                  onClick={() => {
                    setEditing(row);
                    editForm.setFieldsValue({ name: row.name, scopes: row.scopes });
                  }}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  type="link"
                  size="small"
                  disabled={row.state !== "active"}
                  onClick={() => rotate(row)}
                >
                  {t("apikeys.rotate")}
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={row.state === "revoked"}
                  onClick={() => revoke(row)}
                >
                  {t("apikeys.revoke")}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={t("apikeys.create_key")}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText={t("apikeys.issue")}
        forceRender
        afterClose={() => {
          if (pendingSecret) {
            setSecret(pendingSecret);
            setPendingSecret(null);
          }
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={create}
          preserve={false}
          initialValues={{ scopes: ["read", "write", "upload"], expires_in_days: 90 }}
        >
          <Form.Item
            label={t("common.name")}
            name="name"
            extra={t("partnerapikeys.name_format_hint")}
            rules={[{ required: true, message: t("apikeys.enter_name") }]}
          >
            <Input maxLength={64} placeholder={t("partnerapikeys.name_example_partner")} />
          </Form.Item>
          <Form.Item label={t("common.permission")} name="scopes" rules={[{ required: true }]}>
            <Checkbox.Group options={SCOPE_OPTIONS()} style={{ display: "grid", gap: 6 }} />
          </Form.Item>
          <Form.Item label={t("apikeys.validity_period")} name="expires_in_days">
            <Select options={TTL_OPTIONS()} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("apikeys.edit_key")}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        okText={t("common.save")}
        forceRender
      >
        <Form form={editForm} layout="vertical" onFinish={saveEdit}>
          <Form.Item label={t("common.name")} name="name" rules={[{ required: true }]}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label={t("common.permission")} name="scopes" rules={[{ required: true }]}>
            <Checkbox.Group options={SCOPE_OPTIONS()} style={{ display: "grid", gap: 6 }} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("apikeys.expiry_cannot_change")}
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={t("apikeys.key_generated")}
        open={secret !== null}
        onCancel={() => setSecret(null)}
        footer={
          <Button type="primary" onClick={() => setSecret(null)}>
            {t("apikeys.i_saved")}
          </Button>
        }
        maskClosable={false}
        width={620}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t("apikeys.shown_once_only")}
        />
        <Input.TextArea
          readOnly
          value={secret?.key ?? ""}
          autoSize={{ minRows: 2, maxRows: 3 }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <Space style={{ marginTop: 12, justifyContent: "space-between", width: "100%" }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {secret
              ? t("apikeys.expires_value", {
                  v0: secret.expires_at ? formatTime(secret.expires_at) : t("apikeys.long_term"),
                })
              : ""}
          </Typography.Text>
          <Button onClick={() => copy(secret?.key ?? "")}>{t("apikeys.copy")}</Button>
        </Space>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginBottom: 6 }}>
            {t("partnerapikeys.oneclick_install_key")}
          </div>
          <div
            style={{
              background: "#e6f1fb",
              border: "1px solid #b5d4f4",
              borderRadius: 8,
              padding: "10px 11px",
            }}
          >
            <Typography.Text
              style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}
            >
              {CLI_ONE_LINER(secret?.key ?? "")}
            </Typography.Text>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                gap: 12,
              }}
            >
              <span style={{ fontSize: 11, color: "#a32d2d" }}>
                {t("apikeys.command_contains_key")}
              </span>
              <Button size="small" onClick={() => copy(CLI_ONE_LINER(secret?.key ?? ""))}>
                {t("apikeys.copy_command")}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </Space>
  );
}
