import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { api } from "../api";
import { t } from "../copy";

type TagRow = {
  id: number;
  name_en: string;
  name_zh: string;
  category: string;
  status: string;
  drama_count: number;
};

export default function Tags() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: TagRow[] }>("/admin/v1/tags");
      setRows(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (row: TagRow) => {
    setEditing(row);
    form.setFieldsValue({
      name_en: row.name_en,
      name_zh: row.name_zh,
      category: row.category,
      status: row.status,
    });
    setModalOpen(true);
  };

  const onSave = async (values: any) => {
    try {
      if (editing) {
        await api(`/admin/v1/tags/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) });
      } else {
        await api("/admin/v1/tags", { method: "POST", body: JSON.stringify(values) });
      }
      message.success(t("common.saved"));
      setModalOpen(false);
      await load();
    } catch (e: any) {
      const detail = e?.detail;
      if (typeof detail === "string") {
        message.error(t("stagepages.save_failed", {v0: detail}));
      } else if (detail?.msg) {
        const field = detail?.loc?.slice(-1)[0];
        message.error(t("tags.save_failed_field", {v0: field ? field + " " : "", v1: detail.msg}));
      } else {
        message.error(t("stagepages.save_failed", {v0: e?.message ?? e}));
      }
    }
  };

  const onDelete = async (row: TagRow) => {
    try {
      await api(`/admin/v1/tags/${row.id}`, { method: "DELETE" });
      message.success(t("common.deleted"));
      await load();
    } catch (e: any) {
      const detail = e?.detail;
      if (detail?.affected_dramas) {
        const names = detail.affected_dramas.map((d: any) => `#${d.id} ${d.title}`).join("、");
        Modal.warning({ title: t("tags.tag_in_use"), content: t("tags.impact_scope", {v0: names}) });
      } else {
        message.error(t("drama.delete_failed", {v0: e?.message ?? e}));
      }
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space>
        <Button type="primary" onClick={openCreate}>
          {t("tags.new_tag_button")}
        </Button>
        <Typography.Text type="secondary">{t("tags.total_tags", {v0: rows.length})}</Typography.Text>
      </Space>
      <Table<TagRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 760 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        columns={[
          { title: t("tags.english_name_required"), dataIndex: "name_en", render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: t("homeops.chinese_name"), dataIndex: "name_zh" },
          { title: t("tags.category"), dataIndex: "category", render: (v: string) => v || "-" },
          { title: t("tags.linked_drama_count"), dataIndex: "drama_count", width: 90 },
          {
            title: t("common.status"),
            dataIndex: "status",
            width: 90,
            render: (v: string) =>
              v === "enabled" ? <Tag color="green">{t("common.enable")}</Tag> : <Tag>{t("groups.deactivate")}</Tag>,
          },
          {
            title: t("common.actions"),
            key: "actions",
            width: 140,
            render: (_, r) => (
              <Space>
                <Button type="link" size="small" onClick={() => openEdit(r)}>
                  {t("common.edit")}
                </Button>
                <Popconfirm title={t("tags.confirm_delete_tag")} onConfirm={() => onDelete(r)}>
                  <Button type="link" size="small" danger>
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? t("tags.edit_tag_title", {v0: editing.name_en}) : t("tags.create_tag")}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Form.Item
            label={t("homeops.english_name")}
            name="name_en"
            rules={[{ required: true, message: t("tags.english_name_required_msg") }]}
          >
            <Input maxLength={64} placeholder="Urban Fantasy" />
          </Form.Item>
          <Form.Item label={t("homeops.chinese_name")} name="name_zh">
            <Input maxLength={64} placeholder={t("tags.placeholder_example")} />
          </Form.Item>
          <Form.Item label={t("tags.category")} name="category">
            <Input maxLength={32} placeholder="genre / mood / region" />
          </Form.Item>
          <Form.Item label={t("common.status")} name="status" initialValue="enabled">
            <Select
              options={[
                { value: "enabled", label: t("common.enable") },
                { value: "disabled", label: t("groups.deactivate") },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
