import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { DragRow, Handle, reorder, type DragVisual } from "./dragSort";
import { t } from "../copy";

const LIMIT_FALLBACK = 100;

function groupLimit(row: { limit?: number } | null | undefined) {
  return row?.limit || LIMIT_FALLBACK;
}

type GroupRow = {
  id: number;
  name: string;
  position: number;
  status: string;
  drama_count: number;
  limit: number;
};

type Member = {
  id: number;
  title: string;
  status: string;
  cover_url: string;
  position_in_group: number;
};

type DramaHit = {
  id: number;
  title: string;
  status: string;
  cover_url: string;
};

/** Cover thumbnail with a dark placeholder, matching the dramas list page. */
function CoverThumb({ url, width = 40, height = 54 }: { url?: string; width?: number; height?: number }) {
  if (url) {
    return (
      <Image
        src={url}
        width={width}
        height={height}
        style={{
          objectFit: "cover",
          borderRadius: 6,
          flexShrink: 0,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
        preview={false}
      />
    );
  }
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "#f2f4f7",
        border: "1px dashed #d0d5dd",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#98a2b3",
        fontSize: 10,
        flexShrink: 0,
      }}
    >
      {t("groups.no_cover")}
    </div>
  );
}

function DRAMA_STATUS(): Record<string, { text: string; color: string }> { return {
  draft: { text: t("common.draft"), color: "default" },
  in_review: { text: t("common.in_review"), color: "orange" },
  published: { text: t("common.published"), color: "green" },
  unpublished: { text: t("common.unpublished"), color: "red" },
};; }

function statusTag(status: string, style?: React.CSSProperties) {
  const meta = DRAMA_STATUS()[status] ?? { text: status, color: "default" };
  return (
    <Tag color={meta.color} style={{ margin: 0, borderRadius: 4, fontWeight: 500, ...style }}>
      {meta.text}
    </Tag>
  );
}

const GROUP_COLS = "64px minmax(160px, 1fr) 170px 100px 320px";
const DETAIL_COLS = "64px minmax(200px, 1fr) 110px 140px";

function ListHead({ columns, labels }: { columns: string; labels: React.ReactNode[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "#475467",
        background: "#f8f9fa",
        borderBottom: "1px solid #eaecf0",
      }}
    >
      {labels.map((label, index) => (
        <span key={index}>{label}</span>
      ))}
    </div>
  );
}

export default function GroupsPage() {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [form] = Form.useForm<{ name: string }>();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: GroupRow[] }>("/admin/v1/groups");
      setRows(res.items);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ordered = useMemo(() => [...rows].sort((a, b) => a.position - b.position || a.id - b.id), [rows]);
  const totalDramas = useMemo(() => rows.reduce((acc, r) => acc + (r.drama_count || 0), 0), [rows]);
  const activeCount = useMemo(() => rows.filter((r) => r.status === "active").length, [rows]);

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  const moveRow = async (fromId: number, toId: number) => {
    const from = ordered.findIndex((row) => row.id === fromId);
    const to = ordered.findIndex((row) => row.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const positioned = reorder(ordered, from, to).map((row, position) => ({ ...row, position }));
    setRows(positioned);
    try {
      await Promise.all(
        positioned.map((row) =>
          api(`/admin/v1/groups/${row.id}`, { method: "PATCH", body: JSON.stringify({ position: row.position }) }),
        ),
      );
    } catch (e) {
      message.error(errorText(e));
      await load();
    }
  };

  const saveName = async (values: { name: string }) => {
    const name = values.name.trim();
    if (!name) return;
    try {
      if (editing) {
        await api(`/admin/v1/groups/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      } else {
        await api("/admin/v1/groups", {
          method: "POST",
          body: JSON.stringify({ name, position: ordered.length ? ordered[ordered.length - 1].position + 1 : 0 }),
        });
      }
      message.success(t("common.saved"));
      setCreating(false);
      setEditing(null);
      await load();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const toggle = async (row: GroupRow) => {
    try {
      await api(`/admin/v1/groups/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: row.status === "active" ? "inactive" : "active" }),
      });
      message.success(row.status === "active" ? t("groups.group_deactivated") : t("groups.group_enabled"));
      await load();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* 头部标题与快捷统计 */}
      <Space style={{ width: "100%", justifyContent: "space-between" }} align="center" wrap>
        <Space align="center" size={12} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("groups.home_groups")}
          </Typography.Title>
          <Tag bordered={false} style={{ background: "#f2f4f7", color: "#475467", borderRadius: 12, padding: "2px 10px", margin: 0 }}>
            {t("groups.total_groups", {v0: ordered.length})}
          </Tag>
          <Tag bordered={false} style={{ background: "#ecfdf3", color: "#027a48", borderRadius: 12, padding: "2px 10px", margin: 0 }}>
            {t("groups.active_groups", {v0: activeCount})}
          </Tag>
          <Tag bordered={false} style={{ background: "#eff8ff", color: "#175cd3", borderRadius: 12, padding: "2px 10px", margin: 0 }}>
            {t("groups.holds_dramas", {v0: totalDramas})}
          </Tag>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ fontWeight: 500 }}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setCreating(true);
          }}
        >
          {t("groups.create_group")}
        </Button>
      </Space>

      {/* 业务规则与交互轻提示 */}
      <Alert
        type="info"
        showIcon
        message={
          <span style={{ fontSize: 13, color: "#475467" }}>
            {t("groups.drag_hint_prefix")} <strong>{LIMIT_FALLBACK}</strong> {t("groups.drag_hint_suffix")}
          </span>
        }
        style={{
          borderRadius: 8,
          border: "1px solid #d0d5dd",
          background: "#fafbfd",
        }}
      />

      {/* 主卡片容器 */}
      <Spin spinning={loading}>
        <Card
          bordered
          styles={{ body: { padding: 0 } }}
          style={{
            borderRadius: 12,
            borderColor: "#eaecf0",
            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.05)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* Bảng cuộn ngang trong thẻ để nút Thao tác không bị cắt ở màn hình hẹp */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 940 }}>
          <ListHead columns={GROUP_COLS} labels={[t("groups.sort_order"), t("groups.group_name"), t("groups.drama_capacity"), t("common.status"), t("common.actions")]} />
          <div style={{ padding: "10px 12px", display: "grid", gap: 6, minHeight: 60 }}>
            {ordered.map((row, index) => {
              const visual: DragVisual = {
                active: false,
                dragging: dragId === row.id,
                dropping: overId === row.id,
              };
              const limit = groupLimit(row);
              const isFull = row.drama_count >= limit;
              const fillRate = limit > 0 ? row.drama_count / limit : 0;
              const strokeColor = isFull ? "#d92d20" : fillRate >= 0.8 ? "#f79009" : "#12b76a";

              return (
                <DragRow
                  key={row.id}
                  columns={GROUP_COLS}
                  draggable
                  visual={visual}
                  style={{
                    padding: "10px 16px",
                    gap: 12,
                    borderRadius: 8,
                  }}
                  onDragStart={() => setDragId(row.id)}
                  onDragEnd={endDrag}
                  onDragOver={() => {
                    if (dragId == null) return;
                    setOverId(row.id);
                  }}
                  onDrop={() => {
                    if (dragId != null) void moveRow(dragId, row.id);
                    endDrag();
                  }}
                >
                  {(onArm) => (
                    <>
                      {/* 排序手柄与圆角序号 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Handle onArm={onArm} />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: index < 3 ? "#fff1f0" : "#f2f4f7",
                            color: index < 3 ? "#e53b3e" : "#475467",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {index + 1}
                        </span>
                      </div>

                      {/* 分组名称 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Link
                          to={`/groups/${row.id}`}
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: row.status === "active" ? "#101828" : "#98a2b3",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={t("groups.click_manage_dramas")}
                        >
                          {row.name}
                        </Link>
                        {row.status !== "active" && (
                          <Tag bordered={false} style={{ fontSize: 11, background: "#f2f4f7", color: "#667085", margin: 0 }}>
                            {t("groups.deactivated")}
                          </Tag>
                        )}
                      </div>

                      {/* 剧集容量与进度条 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                          <span style={{ fontWeight: 600, color: isFull ? "#d92d20" : "#344054" }}>
                            {row.drama_count} <span style={{ color: "#98a2b3", fontWeight: 400 }}>/ {limit} {t("common.dramas_unit")}</span>
                          </span>
                          <span style={{ fontSize: 11, color: isFull ? "#d92d20" : fillRate >= 0.8 ? "#b54708" : "#98a2b3" }}>
                            {isFull ? t("groups.full_capacity") : t("groups.remaining_count", {v0: limit - row.drama_count})}
                          </span>
                        </div>
                        <Progress
                          percent={Math.min(100, Math.round(fillRate * 100))}
                          size={["100%", 5]}
                          showInfo={false}
                          strokeColor={strokeColor}
                          trailColor="#eaecf0"
                        />
                      </div>

                      {/* 状态展示 */}
                      <div>
                        <Badge
                          status={row.status === "active" ? "success" : "default"}
                          text={
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: row.status === "active" ? "#027a48" : "#667085",
                              }}
                            >
                              {row.status === "active" ? t("groups.active_status") : t("groups.deactivated")}
                            </span>
                          }
                        />
                      </div>

                      {/* 操作按钮组 */}
                      <Space size={4}>
                        <Button
                          type="link"
                          size="small"
                          icon={<FolderOpenOutlined />}
                          style={{ fontWeight: 600, paddingInline: 4 }}
                          onClick={() => navigate(`/groups/${row.id}`)}
                        >
                          {t("groups.manage_dramas")}
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined style={{ fontSize: 13, color: "#667085" }} />}
                          style={{ color: "#475467", paddingInline: 6 }}
                          onClick={() => {
                            setEditing(row);
                            form.setFieldsValue({ name: row.name });
                            setCreating(true);
                          }}
                        >
                          {t("groups.rename")}
                        </Button>
                        {row.status === "active" ? (
                          <Popconfirm
                            title={t("groups.confirm_deactivate")}
                            description={t("groups.deactivate_note")}
                            onConfirm={() => toggle(row)}
                            okText={t("groups.deactivate")}
                            cancelText={t("common.cancel")}
                            okButtonProps={{ danger: true }}
                          >
                            <Button type="text" size="small" danger style={{ paddingInline: 6 }}>
                              {t("groups.deactivate")}
                            </Button>
                          </Popconfirm>
                        ) : (
                          <Button
                            type="text"
                            size="small"
                            style={{ color: "#027a48", paddingInline: 6, fontWeight: 500 }}
                            onClick={() => toggle(row)}
                          >
                            {t("common.enable")}
                          </Button>
                        )}
                      </Space>
                    </>
                  )}
                </DragRow>
              );
            })}
            {!loading && !ordered.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("groups.empty_hint")}
                style={{ margin: "24px 0" }}
              />
            ) : null}
          </div>
            </div>
          </div>
        </Card>
      </Spin>

      <Modal
        title={editing ? t("groups.rename_title", {v0: editing.name}) : t("groups.create_group")}
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        okText={t("common.save")}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={saveName} style={{ marginTop: 12 }}>
          <Form.Item name="name" label={t("groups.group_name")} rules={[{ required: true, message: t("groups.enter_group_name") }]}>
            <Input maxLength={64} placeholder={t("groups.name_example")} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api<{ group: GroupRow; items: Member[] }>(`/admin/v1/groups/${id}/dramas`);
      setGroup(res.group);
      setItems(res.items);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  const moveRow = async (fromId: number, toId: number) => {
    const from = items.findIndex((row) => row.id === fromId);
    const to = items.findIndex((row) => row.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const positioned = reorder(items, from, to).map((row, position) => ({ ...row, position_in_group: position }));
    setItems(positioned);
    try {
      await Promise.all(
        positioned.map((row) =>
          api(`/admin/v1/groups/${id}/dramas/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ position: row.position_in_group }),
          }),
        ),
      );
    } catch (e) {
      message.error(errorText(e));
      await load();
    }
  };

  const remove = async (dramaId: number) => {
    try {
      await api(`/admin/v1/groups/${id}/dramas/${dramaId}`, { method: "DELETE" });
      message.success(t("groups.removed"));
      await load();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const full = (group?.drama_count ?? 0) >= groupLimit(group);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* 规范面包屑导航 */}
      <Breadcrumb
        items={[
          { title: <Link to="/groups">{t("groups.home_groups")}</Link> },
          { title: group?.name ?? t("groups.in_group_management") },
        ]}
      />

      {/* 头部标题与操作 */}
      <Space style={{ width: "100%", justifyContent: "space-between" }} align="center" wrap>
        <Space align="center" size={12} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {group?.name ?? t("groups.in_group_dramas")}
          </Typography.Title>
          <Tag
            bordered={false}
            style={{
              background: full ? "#fef3f2" : "#eff8ff",
              color: full ? "#d92d20" : "#175cd3",
              borderRadius: 12,
              padding: "2px 10px",
              fontWeight: 500,
              margin: 0,
            }}
          >
            {t("groups.count_slash_dramas", {v0: group?.drama_count ?? 0, v1: groupLimit(group)})}
          </Tag>
          {group?.status === "active" ? (
            <Tag bordered={false} style={{ background: "#ecfdf3", color: "#027a48", borderRadius: 12, margin: 0 }}>
              {t("groups.active_status")}
            </Tag>
          ) : (
            <Tag bordered={false} style={{ background: "#f2f4f7", color: "#667085", borderRadius: 12, margin: 0 }}>
              {t("groups.deactivated")}
            </Tag>
          )}
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={full}
          onClick={() => setPickerOpen(true)}
          style={{ fontWeight: 500 }}
        >
          {t("groups.add_drama")}
        </Button>
      </Space>

      {/* 说明提示条 */}
      <Alert
        type="info"
        showIcon
        message={
          <span style={{ fontSize: 13, color: "#475467" }}>
            {t("groups.draft_note_prefix")}<strong>{t("common.published")}</strong>{t("groups.draft_note_suffix")}
          </span>
        }
        style={{
          borderRadius: 8,
          border: "1px solid #d0d5dd",
          background: "#fafbfd",
        }}
      />

      {/* 列表主卡片 */}
      <Spin spinning={loading}>
        <Card
          bordered
          styles={{ body: { padding: 0 } }}
          style={{
            borderRadius: 12,
            borderColor: "#eaecf0",
            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.05)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* Bảng cuộn ngang trong thẻ để nút Thao tác không bị cắt ở màn hình hẹp */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 640 }}>
          <ListHead columns={DETAIL_COLS} labels={[t("groups.sort_order"), t("groups.drama_info"), t("groups.publish_status"), t("common.actions")]} />
          <div style={{ padding: "10px 12px", display: "grid", gap: 6, minHeight: 60 }}>
            {items.map((row, index) => {
              const visual: DragVisual = {
                active: false,
                dragging: dragId === row.id,
                dropping: overId === row.id,
              };
              return (
                <DragRow
                  key={row.id}
                  columns={DETAIL_COLS}
                  draggable
                  visual={visual}
                  style={{
                    padding: "8px 16px",
                    gap: 12,
                    borderRadius: 8,
                  }}
                  onDragStart={() => setDragId(row.id)}
                  onDragEnd={endDrag}
                  onDragOver={() => {
                    if (dragId == null) return;
                    setOverId(row.id);
                  }}
                  onDrop={() => {
                    if (dragId != null) void moveRow(dragId, row.id);
                    endDrag();
                  }}
                >
                  {(onArm) => (
                    <>
                      {/* 排序手柄与圆角序号 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Handle onArm={onArm} />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: index < 3 ? "#fff1f0" : "#f2f4f7",
                            color: index < 3 ? "#e53b3e" : "#475467",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {index + 1}
                        </span>
                      </div>

                      {/* 封面与标题信息 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <CoverThumb url={row.cover_url} width={38} height={50} />
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <Link
                            to={`/dramas/${row.id}`}
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: "#101828",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row.title}
                          </Link>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            #{row.id}
                          </Typography.Text>
                        </div>
                      </div>

                      {/* 状态 */}
                      <div>{statusTag(row.status)}</div>

                      {/* 操作 */}
                      <div>
                        <Popconfirm
                          title={t("groups.remove_drama")}
                          description={t("groups.confirm_remove_drama")}
                          onConfirm={() => remove(row.id)}
                          okText={t("groups.remove_from_group")}
                          cancelText={t("common.cancel")}
                          okButtonProps={{ danger: true }}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ paddingInline: 6 }}>
                            {t("groups.remove_from_group")}
                          </Button>
                        </Popconfirm>
                      </div>
                    </>
                  )}
                </DragRow>
              );
            })}
            {!loading && !items.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("groups.no_drama_hint")}
                style={{ margin: "24px 0" }}
              />
            ) : null}
          </div>
            </div>
          </div>
        </Card>
      </Spin>

      {pickerOpen && group ? (
        <AddDramasModal
          groupId={group.id}
          taken={new Set(items.map((item) => item.id))}
          room={groupLimit(group) - (group.drama_count ?? 0)}
          onClose={() => setPickerOpen(false)}
          onSaved={async () => {
            setPickerOpen(false);
            await load();
          }}
        />
      ) : null}
    </Space>
  );
}

function AddDramasModal({
  groupId,
  taken,
  room,
  onClose,
  onSaved,
}: {
  groupId: number;
  taken: Set<number>;
  room: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<DramaHit[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      const first = await api<{ items: DramaHit[]; total: number }>("/admin/v1/dramas?page=1&page_size=100");
      const pages = Math.ceil((first.total ?? first.items.length) / 100);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          api<{ items: DramaHit[] }>(`/admin/v1/dramas?page=${index + 2}&page_size=100`),
        ),
      );
      setCatalog([...first.items, ...rest.flatMap((page) => page.items)]);
    };
    loadAll()
      .catch((e) => message.error(errorText(e)))
      .finally(() => setLoading(false));
  }, []);

  const needle = q.trim().toLowerCase().replace(/^#+/, "");
  const hits = needle
    ? catalog.filter((hit) => hit.title.toLowerCase().includes(needle) || String(hit.id).includes(needle))
    : catalog;

  const toggle = (dramaId: number) => {
    setPicked((current) => {
      if (current.includes(dramaId)) return current.filter((id) => id !== dramaId);
      if (current.length >= room) {
        message.warning(t("groups.can_add_more", {v0: room}));
        return current;
      }
      return [...current, dramaId];
    });
  };

  const confirm = async () => {
    setSaving(true);
    try {
      for (const dramaId of picked) {
        await api(`/admin/v1/groups/${groupId}/dramas`, {
          method: "POST",
          body: JSON.stringify({ drama_id: dramaId, confirm: true }),
        });
      }
      message.success(t("groups.added_count", {v0: picked.length}));
      await onSaved();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("groups.add_drama_to_group")}
      open
      onCancel={onClose}
      onOk={confirm}
      okText={picked.length ? t("groups.confirm_add_count", {v0: picked.length}) : t("groups.confirm_add")}
      cancelText={t("common.cancel")}
      okButtonProps={{ disabled: picked.length === 0 }}
      confirmLoading={saving}
      destroyOnClose
      width={560}
    >
      <Input.Search
        autoFocus
        placeholder={t("groups.search_drama_id")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        allowClear
        style={{ marginTop: 8 }}
      />
      <div
        style={{
          margin: "12px 0 8px",
          padding: "8px 12px",
          background: "#f8f9fa",
          borderRadius: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <span style={{ color: "#475467" }}>
          {t("groups.selected")} <strong style={{ color: "#1677ff" }}>{picked.length}</strong> {t("groups.dramas_unit")}
        </span>
        <span style={{ color: "#667085" }}>
          {t("groups.capacity_remaining")} <strong>{room}</strong> {t("common.dramas_unit")}
        </span>
      </div>
      <div
        style={{
          maxHeight: 340,
          overflowY: "auto",
          paddingRight: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {hits.map((hit) => {
          const already = taken.has(hit.id);
          const isSelected = picked.includes(hit.id);
          return (
            <div
              key={hit.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 8,
                background: isSelected ? "#eff8ff" : "transparent",
                border: isSelected ? "1px solid #b2ddff" : "1px solid #f2f4f7",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <CoverThumb url={hit.cover_url} width={32} height={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "#101828" }}>{hit.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      #{hit.id}
                    </Typography.Text>
                    {statusTag(hit.status, { fontSize: 10, lineHeight: "16px", padding: "0 4px" })}
                  </div>
                </div>
              </div>
              {already ? (
                <Tag bordered={false} style={{ background: "#f2f4f7", color: "#98a2b3", margin: 0 }}>
                  {t("groups.already_in_group")}
                </Tag>
              ) : (
                <Button
                  type={isSelected ? "primary" : "default"}
                  size="small"
                  onClick={() => toggle(hit.id)}
                  style={{ borderRadius: 4 }}
                >
                  {isSelected ? t("groups.selected_short") : t("groups.select")}
                </Button>
              )}
            </div>
          );
        })}
        {!hits.length ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <Typography.Text type="secondary">{loading ? t("groups.loading_library") : t("groups.no_matching_drama")}</Typography.Text>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function DramaGroupsPanel({ dramaId }: { dramaId: string }) {
  const [rows, setRows] = useState<(GroupRow & { joined: boolean; position_in_group: number | null })[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: (GroupRow & { joined: boolean; position_in_group: number | null })[] }>(
        `/admin/v1/dramas/${dramaId}/groups`,
      );
      setRows(res.items);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [dramaId]);

  useEffect(() => {
    load();
  }, [load]);

  const joined = rows.filter((row) => row.joined);
  const available = rows.filter((row) => !row.joined);

  const join = async (groupId: number) => {
    try {
      await api(`/admin/v1/groups/${groupId}/dramas`, {
        method: "POST",
        body: JSON.stringify({ drama_id: Number(dramaId), confirm: true }),
      });
      message.success(t("groups.joined"));
      await load();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const leave = async (groupId: number) => {
    try {
      await api(`/admin/v1/groups/${groupId}/dramas/${dramaId}`, { method: "DELETE" });
      message.success(t("groups.removed"));
      await load();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const rank = (row: (typeof rows)[number]) => {
    if (row.position_in_group == null) return t("groups.position_pending");
    return t("groups.position_in_group", {v0: row.position_in_group + 1});
  };

  const groupCard = (row: (typeof rows)[number], joinedCard: boolean) => {
    const cap = groupLimit(row);
    const full = row.drama_count >= cap;
    const inactive = row.status !== "active";
    const room = Math.max(cap - row.drama_count, 0);
    const fill = Math.min(row.drama_count / cap, 1);
    const barColor = full ? "#cf1322" : fill >= 0.8 ? "#d48806" : "#1677ff";
    return (
      <div
        key={row.id}
        style={{
          width: 280,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
          padding: "14px 14px 12px",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Link to={`/groups/${row.id}`} style={{ fontWeight: 600, fontSize: 15 }}>
            {row.name}
          </Link>
          {inactive ? <Tag>{t("groups.deactivate")}</Tag> : joinedCard ? <Tag color="green">{t("groups.joined")}</Tag> : <Tag color="blue">{t("common.enable")}</Tag>}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(0,0,0,0.45)", marginBottom: 6 }}>
            <span>{row.drama_count}/{cap} {t("common.dramas_unit")}</span>
            <span>{full ? t("groups.full") : t("groups.can_add_count", {v0: room})}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", background: barColor }} />
          </div>
          {joinedCard ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{rank(row)}</div>
          ) : null}
        </div>
        {joinedCard ? (
          <Popconfirm title={t("groups.confirm_leave")} onConfirm={() => leave(row.id)} okText={t("groups.remove_from_group")} cancelText={t("common.cancel")}>
            <Button size="small" danger block>
              {t("groups.remove_from_group")}
            </Button>
          </Popconfirm>
        ) : full || inactive ? (
          <Button size="small" block disabled>
            {full ? t("groups.full") : t("groups.deactivated")}
          </Button>
        ) : (
          <Button size="small" type="primary" ghost block onClick={() => join(row.id)}>
            {t("groups.join")}
          </Button>
        )}
      </div>
    );
  };

  const cardGrid = (items: typeof rows, joinedCard: boolean) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
      {items.map((row) => groupCard(row, joinedCard))}
    </div>
  );

  return (
    <div>
      {joined.length ? (
        <div>
          <Typography.Text strong>{t("groups.joined_groups", {v0: joined.length})}</Typography.Text>
          {cardGrid(joined, true)}
        </div>
      ) : (
        <div
          style={{
            border: "1px dashed rgba(0,0,0,0.15)",
            borderRadius: 10,
            padding: "14px 16px",
            background: "rgba(0,0,0,0.015)",
            maxWidth: 572,
          }}
        >
          <Typography.Text strong>{t("groups.not_joined_any")}</Typography.Text>
          <div style={{ marginTop: 4, color: "rgba(0,0,0,0.45)", fontSize: 13 }}>
            {t("groups.join_hint")}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Typography.Text strong>{joined.length ? t("groups.can_join") : t("groups.select_group")}</Typography.Text>
        {!rows.length && !loading ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("groups.no_group_yet_prefix")}
            <Link to="/groups"> {t("groups.home_groups")} </Link>
            {t("groups.create_suffix")}
          </Typography.Paragraph>
        ) : null}
        {available.length ? cardGrid(available, false) : null}
        {joined.length && !available.length && !loading ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {t("groups.no_joinable_group")}
          </Typography.Paragraph>
        ) : null}
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: 14, marginBottom: 0 }}>
        {t("groups.order_hint_prefix")}
        <Link to="/groups"> {t("groups.home_groups")} </Link>
        {t("groups.order_hint_suffix")}
      </Typography.Paragraph>
    </div>
  );
}
