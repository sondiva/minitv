import { useState } from "react";
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
import { ROLE_LABELS, ROLE_OPTIONS, useIsAdmin, useMe } from "../me";
import { t } from "../copy";

type StaffRow = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  status: string;
  disable_reason: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

/** 16 random characters, no look-alike 0/O/1/l — typed by hand often enough. */
function randomPassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

function roleTag(role: string) {
  const color = role === "admin" ? "red" : role === "ops" ? "blue" : "default";
  return <Tag color={color}>{ROLE_LABELS()[role] ?? role}</Tag>;
}

export default function Staff() {
  const me = useMe();
  const isAdmin = useIsAdmin();
  const { confirm, confirmModal } = useConfirm();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (roleFilter) params.set("role", roleFilter);
  if (statusFilter) params.set("status", statusFilter);
  const path = `/admin/v1/staff${params.toString() ? `?${params.toString()}` : ""}`;
  const { data, reload, loading } = useLoad<{ items: StaffRow[] }>(path, { items: [] }, {
    // A non-admin would only collect a 403 toast here; the page renders the
    // "admins only" notice instead.
    enabled: isAdmin,
  });
  const rows = data.items;

  // ---- create ----
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ role: "ops", password: randomPassword() });
    setCreateOpen(true);
  };

  const onCreate = async (values: any) => {
    try {
      await api("/admin/v1/staff", { method: "POST", body: JSON.stringify(values) });
      message.success(t("staff.account_created", {v0: values.username}));
      setCreateOpen(false);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  // ---- edit ----
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [editForm] = Form.useForm();

  const openEdit = (row: StaffRow) => {
    setEditing(row);
    editForm.setFieldsValue({ display_name: row.display_name, role: row.role });
  };

  const onEdit = async (values: any) => {
    if (!editing) return;
    try {
      await api(`/admin/v1/staff/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      message.success(t("common.saved"));
      setEditing(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  // ---- reset password ----
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [generated, setGenerated] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [resetting, setResetting] = useState(false);

  const openReset = (row: StaffRow) => {
    setResetTarget(row);
    setGenerated(randomPassword());
    setAcknowledged(false);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      message.success(t("stagepages.copied"));
    } catch {
      message.error(t("staff.copy_failed"));
    }
  };

  const onReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await api(`/admin/v1/staff/${resetTarget.id}/password`, {
        method: "POST",
        body: JSON.stringify({ new_password: generated }),
      });
      message.success(t("staff.password_reset_done", {v0: resetTarget.username}));
      setResetTarget(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setResetting(false);
    }
  };

  // ---- disable / enable ----
  const [disableTarget, setDisableTarget] = useState<StaffRow | null>(null);
  const [reason, setReason] = useState("");
  const [disabling, setDisabling] = useState(false);

  const openDisable = (row: StaffRow) => {
    setDisableTarget(row);
    setReason("");
  };

  const onDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      await api(`/admin/v1/staff/${disableTarget.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "disabled", reason: reason.trim() || null }),
      });
      message.success(t("staff.account_disabled", {v0: disableTarget.username}));
      setDisableTarget(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setDisabling(false);
    }
  };

  const onEnable = (row: StaffRow) => {
    confirm({
      title: t("staff.enable_account_title", {v0: row.username}),
      content: t("staff.enable_account_note"),
      okText: t("common.enable"),
      onOk: async () => {
        try {
          await api(`/admin/v1/staff/${row.id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: "active" }),
          });
          message.success(t("staff.enabled"));
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  if (!isAdmin) {
    return (
      <Alert
        type="warning"
        showIcon
        message={t("staff.admin_only")}
        description={t("staff.no_permission")}
      />
    );
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space wrap>
        <Button type="primary" onClick={openCreate}>
          {t("staff.add_account")}
        </Button>
        <Input.Search
          allowClear
          placeholder={t("staff.search_account")}
          style={{ width: 220 }}
          onSearch={(value) => setQuery(value.trim())}
        />
        <Select
          value={roleFilter}
          style={{ width: 130 }}
          onChange={setRoleFilter}
          options={[{ value: "", label: t("staff.all_roles") }, ...ROLE_OPTIONS()]}
        />
        <Select
          value={statusFilter}
          style={{ width: 130 }}
          onChange={setStatusFilter}
          options={[
            { value: "", label: t("common.all_status") },
            { value: "active", label: t("common.enable") },
            { value: "disabled", label: t("staff.disabled_status") },
          ]}
        />
        <Typography.Text type="secondary">
          {t("staff.total_accounts_note", {v0: rows.length})}
        </Typography.Text>
      </Space>

      <Table<StaffRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1040 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          {
            title: t("apikeys.account"),
            dataIndex: "username",
            width: 190,
            render: (value: string, row) => (
              <div>
                <Typography.Text code>{value}</Typography.Text>
                {row.display_name && (
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                    {row.display_name}
                  </div>
                )}
              </div>
            ),
          },
          {
            title: t("staff.role"),
            dataIndex: "role",
            width: 90,
            render: (value: string) => roleTag(value),
          },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 100,
            render: (value: string) => (
              <Tag color={value === "active" ? "green" : "default"}>
                {value === "active" ? t("common.enable") : t("staff.disabled_status")}
              </Tag>
            ),
          },
          {
            title: t("staff.disable_reason"),
            dataIndex: "disable_reason",
            width: 170,
            render: (value: string | null) =>
              value ? (
                <Tooltip title={value}>
                  <Typography.Text ellipsis style={{ maxWidth: 150 }}>
                    {value}
                  </Typography.Text>
                </Tooltip>
              ) : (
                <Typography.Text type="secondary">-</Typography.Text>
              ),
          },
          {
            title: t("staff.last_login"),
            dataIndex: "last_login_at",
            width: 150,
            render: (value: string | null) => formatTime(value),
          },
          {
            title: t("staff.created_at"),
            dataIndex: "created_at",
            width: 150,
            render: (value: string) => formatTime(value),
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 200,
            render: (_, row) => {
              const self = row.id === me?.id;
              return (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => openEdit(row)}>
                    {t("common.edit")}
                  </Button>
                  <Button type="link" size="small" onClick={() => openReset(row)}>
                    {t("staff.reset_password")}
                  </Button>
                  {row.status === "active" ? (
                    <Tooltip title={self ? t("staff.cannot_disable_self") : ""}>
                      <Button
                        type="link"
                        size="small"
                        danger
                        disabled={self}
                        onClick={() => openDisable(row)}
                      >
                        {t("staff.disable")}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button type="link" size="small" onClick={() => onEnable(row)}>
                      {t("common.enable")}
                    </Button>
                  )}
                </Space>
              );
            },
          },
        ]}
      />

      <Modal
        title={t("staff.new_account")}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText={t("staff.create")}
        forceRender
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate} preserve={false}>
          <Form.Item
            label={t("apikeys.account")}
            name="username"
            extra={t("staff.username_rule_note")}
            rules={[
              { required: true, message: t("staff.enter_account") },
              {
                pattern: /^[a-z0-9][a-z0-9._-]{2,31}$/,
                message: t("staff.username_rule"),
              },
            ]}
          >
            <Input placeholder={t("staff.username_example")} autoComplete="off" />
          </Form.Item>
          <Form.Item label={t("staff.display_name")} name="display_name">
            <Input maxLength={64} placeholder={t("staff.display_name_example")} />
          </Form.Item>
          <Form.Item label={t("staff.role")} name="role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS()} />
          </Form.Item>
          <Form.Item
            label={t("staff.initial_password")}
            name="password"
            extra={
              <span>
                {t("staff.random_password_hint")}{" "}
                <Typography.Link
                  onClick={() => createForm.setFieldValue("password", randomPassword())}
                >
                  {t("staff.generate_password")}
                </Typography.Link>
              </span>
            }
            rules={[
              { required: true, message: t("staff.enter_initial_password") },
              { min: 8, message: t("staff.password_min_length") },
            ]}
          >
            <Input autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? t("staff.edit_account_title", {v0: editing.username}) : t("staff.edit_account")}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        okText={t("common.save")}
        forceRender
      >
        <Form form={editForm} layout="vertical" onFinish={onEdit} preserve={false}>
          <Form.Item label={t("staff.display_name")} name="display_name">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            label={t("staff.role")}
            name="role"
            extra={editing?.id === me?.id ? t("staff.cannot_change_own_role") : undefined}
            rules={[{ required: true }]}
          >
            <Select options={ROLE_OPTIONS()} disabled={editing?.id === me?.id} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("staff.account_note")}
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={resetTarget ? t("staff.reset_password_title", {v0: resetTarget.display_name || resetTarget.username}) : t("staff.reset_password")}
        open={resetTarget !== null}
        onCancel={() => setResetTarget(null)}
        okText={t("staff.confirm_reset")}
        okButtonProps={{ danger: true, disabled: !acknowledged, loading: resetting }}
        onOk={onReset}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Alert
            type="warning"
            showIcon
            message={t("staff.reset_sessions_note")}
            description={t("staff.new_password_note")}
          />
          <Space.Compact style={{ width: "100%" }}>
            <Input
              readOnly
              value={generated}
              style={{ fontFamily: "monospace" }}
              onFocus={(e) => e.target.select()}
            />
            <Button onClick={copyPassword}>{t("apikeys.copy")}</Button>
            <Button onClick={() => setGenerated(randomPassword())}>{t("staff.regenerate")}</Button>
          </Space.Compact>
          <Checkbox
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          >
            {t("staff.password_shared_confirm")}
          </Checkbox>
        </Space>
      </Modal>

      <Modal
        title={disableTarget ? t("staff.disable_account_title", {v0: disableTarget.username}) : t("staff.disable_account")}
        open={disableTarget !== null}
        onCancel={() => setDisableTarget(null)}
        okText={t("staff.confirm_disable")}
        okButtonProps={{ danger: true, loading: disabling }}
        onOk={onDisable}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Alert
            type="warning"
            showIcon
            message={t("staff.sessions_invalid")}
            description={t("staff.disable_history_note")}
          />
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontSize: 13 }}>{t("staff.disable_reason_optional")}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("staff.disable_reason_example")}
            />
          </div>
        </Space>
      </Modal>

      {confirmModal}
    </Space>
  );
}
