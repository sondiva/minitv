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
  Tooltip,
  Typography,
  message,
} from "antd";
import { api, errorText } from "../api";
import { useConfirm } from "../confirm";
import { formatTime, useLoad } from "../hooks";
import { ROLE_LABELS } from "../me";
import { t } from "../copy";

type KeyState = "active" | "expiring" | "expired" | "revoked";

type KeyRow = {
  id: number;
  name: string;
  user_id: number;
  username: string | null;
  display_name: string;
  key_prefix: string;
  scopes: string[];
  state: KeyState;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type Summary = {
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
  total: number;
};

type StaffRow = { id: number; username: string; display_name: string; role: string; status: string };

function SCOPE_LABELS(): Record<string, string> { return {
  read: t("apikeys.scope_read"),
  write: t("apikeys.scope_write"),
  delete: t("common.delete"),
  billing: t("apikeys.finance_role"),
  staff: t("apikeys.account"),
};; }

/** Only the first three are offered here; billing/staff stay admin-session-only. */
function SCOPE_OPTIONS(){ return [
  { value: "read", label: t("apikeys.scope_read_desc") },
  { value: "write", label: t("apikeys.scope_write_full") },
  { value: "delete", label: t("apikeys.scope_delete") },
];; }

function TTL_OPTIONS(){ return [
  { value: 30, label: t("apikeys.duration_30_days") },
  { value: 90, label: t("apikeys.days_90") },
  { value: 180, label: t("apikeys.days_180") },
  { value: 365, label: t("apikeys.duration_365_days") },
  { value: 0, label: t("apikeys.long_term_not_recommended") },
];; }

/** One source of truth for the copy-paste commands (see docs/cli-execution-plan.md §3.7). */
const CLI_INSTALL = "curl -fsSL https://minitv.us/cli/install.sh | sh";
const CLI_SET_KEY = "minitv config set-key";
const CLI_DOCTOR = "minitv doctor";
const cliOneLiner = (key: string) =>
  `curl -fsSL https://minitv.us/cli/install.sh | MINITV_API_KEY='${key}' sh`;

function STATE_TAG(): Record<KeyState, { color: string; label: string }> { return {
  active: { color: "green", label: t("common.active") },
  expiring: { color: "orange", label: t("apikeys.expiring_soon") },
  expired: { color: "red", label: t("apikeys.expired") },
  revoked: { color: "default", label: t("common.revoked") },
};; }

function scopeText(scopes: string[]): string {
  if (!scopes.length) return t("apikeys.follow_role");
  return scopes.map((scope) => SCOPE_LABELS()[scope] ?? scope).join(" · ");
}

export default function ApiKeys() {
  const { confirm, confirmModal } = useConfirm();

  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [secret, setSecret] = useState<{ key: string; name: string; expires_at: string | null } | null>(
    null
  );
  // The plaintext modal opens only after the create dialog has finished its
  // close animation, otherwise both modals are visible for ~200ms.
  const [pendingSecret, setPendingSecret] = useState<{
    key: string;
    name: string;
    expires_at: string | null;
  } | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  // The list endpoint filters on the stored status; "expiring"/"expired" are
  // derived states the server paints, so those are filtered on the client.
  if (stateFilter === "active" || stateFilter === "revoked") params.set("status", stateFilter);
  const path = `/admin/v1/api-keys${params.toString() ? `?${params.toString()}` : ""}`;
  const { data, reload, loading } = useLoad<{ items: KeyRow[]; summary: Summary; total: number }>(
    path,
    { items: [], summary: { active: 0, expiring: 0, expired: 0, revoked: 0, total: 0 }, total: 0 }
  );

  const staff = useLoad<{ items: StaffRow[] }>("/admin/v1/staff", { items: [] });
  const staffOptions = useMemo(
    () =>
      staff.data.items
        .filter((row) => row.status === "active")
        .map((row) => ({
          value: row.id,
          label: `${row.username}（${ROLE_LABELS()[row.role] ?? row.role}）`,
        })),
    [staff.data.items]
  );

  const rows = useMemo(() => {
    // `expiring` / `expired` are derived states, and an expired key still has
    // status=active in the database — so every non-empty filter has to be
    // applied on the painted state, not only on the server-side status.
    if (!stateFilter) return data.items;
    return data.items.filter((row) => row.state === stateFilter);
  }, [data.items, stateFilter]);

  const onCreate = async (values: any) => {
    try {
      const created = await api<KeyRow & { key: string }>("/admin/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          user_id: values.user_id,
          name: values.name,
          scopes: values.scopes,
          expires_in_days: values.expires_in_days === 0 ? null : values.expires_in_days,
        }),
      });
      setCreateOpen(false);
      createForm.resetFields();
      setPendingSecret({ key: created.key, name: created.name, expires_at: created.expires_at });
      reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const onEdit = async (values: any) => {
    if (!editing) return;
    try {
      await api(`/admin/v1/api-keys/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: values.name, scopes: values.scopes }),
      });
      setEditing(null);
      reload();
      message.success(t("common.saved"));
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const onRotate = (row: KeyRow) => {
    confirm({
      title: t("apikeys.rotate_key_title", {v0: row.name}),
      content: t("apikeys.old_key_expires_warn"),
      okText: t("apikeys.rotate"),
      onOk: async () => {
        try {
          const fresh = await api<KeyRow & { key: string }>(
            `/admin/v1/api-keys/${row.id}/rotate`,
            { method: "POST", body: JSON.stringify({}) }
          );
          setSecret({ key: fresh.key, name: fresh.name, expires_at: fresh.expires_at });
          reload();
        } catch (e) {
          message.error(errorText(e));
          throw e; // keep the dialog open so the operator can retry
        }
      },
    });
  };

  const onRevoke = (row: KeyRow) => {
    confirm({
      title: t("apikeys.revoke_key_title", {v0: row.name}),
      content: t("apikeys.revoke_irreversible"),
      okText: t("apikeys.revoke"),
      danger: true,
      onOk: async () => {
        try {
          await api(`/admin/v1/api-keys/${row.id}/revoke`, {
            method: "POST",
            body: JSON.stringify({}),
          });
          reload();
          message.success(t("common.revoked"));
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const onDelete = (row: KeyRow) => {
    confirm({
      title: t("apikeys.delete_key_title", {v0: row.name}),
      content: t("apikeys.delete_unused_only"),
      okText: t("common.delete"),
      danger: true,
      onOk: async () => {
        try {
          await api(`/admin/v1/api-keys/${row.id}`, { method: "DELETE" });
          reload();
          message.success(t("common.deleted"));
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("stagepages.copied"));
    } catch {
      message.warning(t("apikeys.copy_failed_manual"));
    }
  };

  const copySecret = () => (secret ? copy(secret.key) : Promise.resolve());

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Space wrap size={12} style={{ justifyContent: "space-between", width: "100%" }}>
        <Space wrap size={8}>
          <Input.Search
            allowClear
            placeholder={t("apikeys.search_keys")}
            style={{ width: 260 }}
            onSearch={setQuery}
          />
          <Select
            style={{ width: 150 }}
            value={stateFilter}
            onChange={setStateFilter}
            options={[
              { value: "", label: t("common.all_status") },
              { value: "active", label: t("common.active") },
              { value: "expiring", label: t("apikeys.expiring_soon") },
              { value: "expired", label: t("apikeys.expired") },
              { value: "revoked", label: t("common.revoked") },
            ]}
          />
          <Tag color="green">{t("common.active")} {data.summary.active}</Tag>
          {data.summary.expiring > 0 && <Tag color="orange">{t("apikeys.expiring_soon")} {data.summary.expiring}</Tag>}
          {data.summary.expired > 0 && <Tag color="red">{t("apikeys.expired")} {data.summary.expired}</Tag>}
          {data.summary.revoked > 0 && <Tag>{t("common.revoked")} {data.summary.revoked}</Tag>}
        </Space>
        <Space>
          <Button onClick={() => setAgentOpen(true)}>{t("apikeys.connect_agent")}</Button>
          <Button onClick={() => reload()}>{t("common.refresh")}</Button>
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            {t("apikeys.create_key")}
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        message={t("apikeys.key_shown_once_note")}
      />

      <Table<KeyRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1120 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          {
            title: t("common.name"),
            dataIndex: "name",
            width: 210,
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
            title: t("apikeys.bind_account"),
            dataIndex: "username",
            width: 190,
            render: (value: string | null, row) => (
              <div>
                <Typography.Text code style={{ whiteSpace: "nowrap" }}>
                  {value ?? "-"}
                </Typography.Text>
                {row.display_name && (
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{row.display_name}</div>
                )}
              </div>
            ),
          },
          {
            title: t("apikeys.prefix"),
            dataIndex: "key_prefix",
            width: 170,
            render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: t("common.permission"),
            dataIndex: "scopes",
            width: 130,
            render: (value: string[]) => (
              <Typography.Text
                type={value.includes("delete") ? "danger" : undefined}
                style={{ fontSize: 12 }}
              >
                {scopeText(value)}
              </Typography.Text>
            ),
          },
          {
            title: t("common.status"),
            dataIndex: "state",
            width: 100,
            render: (value: KeyState) => (
              <Tag color={STATE_TAG()[value].color}>{STATE_TAG()[value].label}</Tag>
            ),
          },
          {
            title: t("apikeys.expires"),
            dataIndex: "expires_at",
            width: 150,
            render: (value: string | null) =>
              value ? formatTime(value) : <Typography.Text type="secondary">{t("apikeys.long_term")}</Typography.Text>,
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 210,
            render: (_, row) => {
              const revoked = row.status === "revoked";
              return (
                <Space size={2}>
                  <Button
                    type="link"
                    size="small"
                    disabled={revoked}
                    onClick={() => {
                      setEditing(row);
                      editForm.setFieldsValue({ name: row.name, scopes: row.scopes });
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  <Tooltip title={revoked ? t("apikeys.revoked_create_new") : ""}>
                    <Button
                      type="link"
                      size="small"
                      disabled={revoked}
                      onClick={() => onRotate(row)}
                    >
                      {t("apikeys.rotate")}
                    </Button>
                  </Tooltip>
                  <Button
                    type="link"
                    size="small"
                    danger
                    disabled={revoked}
                    onClick={() => onRevoke(row)}
                  >
                    {t("apikeys.revoke")}
                  </Button>
                  <Tooltip title={row.last_used_at ? t("apikeys.used_only_revoke") : ""}>
                    <Button
                      type="link"
                      size="small"
                      danger
                      disabled={row.last_used_at !== null}
                      onClick={() => onDelete(row)}
                    >
                      {t("common.delete")}
                    </Button>
                  </Tooltip>
                </Space>
              );
            },
          },
        ]}
      />

      <Typography.Text type="secondary">
        {t("apikeys.total_keys_note", {v0: data.total})}
      </Typography.Text>

      <Modal
        title={t("apikeys.create_key")}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
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
          form={createForm}
          layout="vertical"
          onFinish={onCreate}
          preserve={false}
          initialValues={{ scopes: ["read", "write"], expires_in_days: 90 }}
        >
          <Form.Item
            label={t("apikeys.bind_account")}
            name="user_id"
            extra={t("apikeys.key_permission_limit")}
            rules={[{ required: true, message: t("apikeys.select_account") }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t("apikeys.select_staff_account")}
              options={staffOptions}
            />
          </Form.Item>
          <Form.Item
            label={t("common.name")}
            name="name"
            extra={t("apikeys.no_duplicate_name_hint")}
            rules={[{ required: true, message: t("apikeys.enter_name") }]}
          >
            <Input maxLength={64} placeholder={t("apikeys.name_example")} />
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
        <Form form={editForm} layout="vertical" onFinish={onEdit}>
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
          <Button onClick={copySecret}>{t("apikeys.copy")}</Button>
        </Space>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginBottom: 6 }}>
            {t("apikeys.copy_oneclick_command")}
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
              {cliOneLiner(secret?.key ?? "")}
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
              <Button size="small" onClick={() => copy(cliOneLiner(secret?.key ?? ""))}>
                {t("apikeys.copy_command")}
              </Button>
            </div>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 6 }}>
            {t("apikeys.key_env_stdin_note")}
          </Typography.Text>
        </div>
      </Modal>

      <Modal
        title={t("apikeys.connect_agent")}
        open={agentOpen}
        onCancel={() => setAgentOpen(false)}
        footer={null}
        width={620}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t("apikeys.three_steps_agent")}
        </Typography.Paragraph>

        {[
          {
            title: t("apikeys.step_install_cli"),
            code: CLI_INSTALL,
            hint: t("apikeys.install_cli_hint"),
          },
          {
            title: t("apikeys.step_set_key"),
            code: CLI_SET_KEY,
            hint: t("apikeys.set_key_hint"),
          },
          {
            title: t("apikeys.step_self_check"),
            code: CLI_DOCTOR,
            hint: t("apikeys.self_check_hint"),
          },
        ].map((step) => (
          <div key={step.title} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{step.title}</div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                background: "rgba(0,0,0,0.03)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: "9px 11px",
              }}
            >
              <Typography.Text
                style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}
              >
                {step.code}
              </Typography.Text>
              <Button size="small" onClick={() => copy(step.code)}>
                {t("apikeys.copy")}
              </Button>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {step.hint}
            </Typography.Text>
          </div>
        ))}

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("apikeys.existing_key_steps")}
        </Typography.Text>
      </Modal>

      {confirmModal}
    </Space>
  );
}
