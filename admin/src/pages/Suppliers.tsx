import { useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { api, errorText } from "../api";
import { useConfirm } from "../confirm";
import { formatTime, useLoad } from "../hooks";
import { t } from "../copy";

type SupplierAccount = {
  id: number;
  username: string;
  status: string;
  last_login_at: string | null;
};

type SupplierRow = {
  id: number;
  name: string;
  contact_name: string;
  contact_email: string;
  status: string;
  revenue_share_bps: number;
  drama_count: number;
  account: SupplierAccount | null;
  created_at: string;
};

export default function Suppliers() {
  const { confirm, confirmModal } = useConfirm();
  const { data, reload, loading } = useLoad<{ items: SupplierRow[] }>("/admin/v1/suppliers", {
    items: [],
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  const [shareTarget, setShareTarget] = useState<SupplierRow | null>(null);
  const [shareForm] = Form.useForm();

  const [accountTarget, setAccountTarget] = useState<SupplierRow | null>(null);
  const [accountForm] = Form.useForm();

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ revenue_share_bps: 80 });
    setCreateOpen(true);
  };

  const onCreate = async (values: any) => {
    try {
      await api("/admin/v1/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          contact_name: values.contact_name ?? "",
          contact_email: values.contact_email ?? "",
          revenue_share_bps: Math.round((values.revenue_share_bps ?? 80) * 100),
          note: values.note ?? "",
        }),
      });
      message.success(t("suppliers.created_next_account"));
      setCreateOpen(false);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const openShare = (row: SupplierRow) => {
    setShareTarget(row);
    shareForm.setFieldsValue({
      share_percent: row.revenue_share_bps / 100,
      note: "",
    });
  };

  const onShare = async (values: any) => {
    if (!shareTarget) return;
    try {
      await api(`/admin/v1/suppliers/${shareTarget.id}/share`, {
        method: "POST",
        body: JSON.stringify({
          share_bps: Math.round(values.share_percent * 100),
          note: values.note ?? "",
        }),
      });
      message.success(t("suppliers.share_updated"));
      setShareTarget(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const onToggle = (row: SupplierRow) => {
    const disabling = row.status === "active";
    confirm({
      title: t("suppliers.toggle_supplier_title", {
        v0: disabling ? t("staff.disable") : t("common.enable"),
        v1: row.name,
      }),
      content: disabling
        ? t("suppliers.disable_supplier_note")
        : t("suppliers.enable_supplier_note"),
      danger: disabling,
      okText: disabling ? t("staff.disable") : t("common.enable"),
      onOk: async () => {
        try {
          await api(`/admin/v1/suppliers/${row.id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: disabling ? "disabled" : "active" }),
          });
          message.success(t("common.saved"));
          await reload();
        } catch (e) {
          message.error(errorText(e));
          throw e;
        }
      },
    });
  };

  const openAccount = (row: SupplierRow) => {
    setAccountTarget(row);
    accountForm.resetFields();
    accountForm.setFieldsValue({ username: `sp-${row.id}` });
  };

  const onAccount = async (values: any) => {
    if (!accountTarget) return;
    try {
      await api("/admin/v1/staff", {
        method: "POST",
        body: JSON.stringify({
          username: values.username,
          display_name: accountTarget.name,
          role: "partner",
          password: values.password,
          supplier_id: accountTarget.id,
        }),
      });
      message.success(t("suppliers.account_created_note"));
      setAccountTarget(null);
      await reload();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space wrap>
        <Button type="primary" onClick={openCreate}>
          {t("suppliers.add_supplier")}
        </Button>
        <Typography.Text type="secondary">
          {t("suppliers.one_account_note")}
        </Typography.Text>
      </Space>

      <Table<SupplierRow>
        rowKey="id"
        loading={loading}
        dataSource={data.items}
        pagination={false}
        scroll={{ x: 1000 }}
        columns={[
          { title: t("suppliers.supplier"), dataIndex: "name", width: 180 },
          {
            title: t("suppliers.contact_person"),
            key: "contact",
            width: 200,
            render: (_, row) => (
              <div>
                <div>{row.contact_name || "-"}</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                  {row.contact_email || ""}
                </div>
              </div>
            ),
          },
          {
            title: t("apikeys.bind_account"),
            key: "account",
            width: 230,
            render: (_, row) =>
              row.account ? (
                <div>
                  <Typography.Text code>{row.account.username}</Typography.Text>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
                    {t("suppliers.last_login", {v0: row.account.status === "active" ? t("common.enable") : t("staff.disabled_status"), v1: formatTime(row.account.last_login_at)})}
                  </div>
                </div>
              ) : (
                <Button size="small" onClick={() => openAccount(row)}>
                  {t("suppliers.create_account")}
                </Button>
              ),
          },
          { title: t("suppliers.drama_count"), dataIndex: "drama_count", width: 80 },
          {
            title: t("suppliers.revenue_share"),
            dataIndex: "revenue_share_bps",
            width: 100,
            render: (value: number) => `${(value / 100).toFixed(0)}%`,
          },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 90,
            render: (value: string) =>
              value === "active" ? <Tag color="green">{t("common.enable")}</Tag> : <Tag>{t("staff.disabled_status")}</Tag>,
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 180,
            render: (_, row) => (
              <Space size={4}>
                <Button type="link" size="small" onClick={() => openShare(row)}>
                  {t("suppliers.change_share")}
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger={row.status === "active"}
                  onClick={() => onToggle(row)}
                >
                  {row.status === "active" ? t("staff.disable") : t("common.enable")}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={t("suppliers.new_supplier")}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText={t("staff.create")}
        forceRender
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate} preserve={false}>
          <Form.Item
            label={t("suppliers.supplier_name")}
            name="name"
            rules={[{ required: true, message: t("apikeys.enter_name") }]}
          >
            <Input maxLength={100} placeholder={t("suppliers.supplier_name_example")} />
          </Form.Item>
          <Form.Item label={t("suppliers.contact_person")} name="contact_name">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            label={t("suppliers.contact_email")}
            name="contact_email"
            rules={[{ type: "email", message: t("users.invalid_email_format") }]}
          >
            <Input maxLength={320} placeholder={t("suppliers.contact_email_hint")} />
          </Form.Item>
          <Form.Item
            label={t("suppliers.share_ratio")}
            name="revenue_share_bps"
            extra={t("suppliers.share_default_note")}
            rules={[{ required: true, message: t("suppliers.enter_share_ratio") }]}
          >
            <InputNumber min={0} max={100} style={{ width: "100%" }} addonAfter="%" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={shareTarget ? t("suppliers.adjust_share_title", {v0: shareTarget.name}) : t("suppliers.adjust_share")}
        open={shareTarget !== null}
        onCancel={() => setShareTarget(null)}
        onOk={() => shareForm.submit()}
        okText={t("common.save")}
        forceRender
      >
        <Form form={shareForm} layout="vertical" onFinish={onShare} preserve={false}>
          <Form.Item
            label={t("suppliers.new_share_ratio")}
            name="share_percent"
            rules={[{ required: true, message: t("suppliers.enter_ratio") }]}
          >
            <InputNumber min={0} max={100} style={{ width: "100%" }} addonAfter="%" />
          </Form.Item>
          <Form.Item label={t("suppliers.change_note")} name="note">
            <Input maxLength={200} placeholder={t("suppliers.change_note_example")} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("suppliers.share_change_note")}
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={accountTarget ? t("suppliers.create_account_title", {v0: accountTarget.name}) : t("suppliers.create_account")}
        open={accountTarget !== null}
        onCancel={() => setAccountTarget(null)}
        onOk={() => accountForm.submit()}
        okText={t("suppliers.create_account")}
        forceRender
      >
        <Form form={accountForm} layout="vertical" onFinish={onAccount} preserve={false}>
          <Form.Item
            label={t("suppliers.login_account")}
            name="username"
            rules={[
              { required: true, message: t("staff.enter_account") },
              { pattern: /^[a-z0-9][a-z0-9._-]{2,31}$/, message: t("staff.username_rule") },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label={t("staff.initial_password")}
            name="password"
            rules={[
              { required: true, message: t("staff.enter_initial_password") },
              { min: 8, message: t("staff.password_min_length") },
            ]}
          >
            <Input autoComplete="new-password" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("suppliers.one_account_warning")}
          </Typography.Text>
        </Form>
      </Modal>

      {confirmModal}
    </Space>
  );
}
