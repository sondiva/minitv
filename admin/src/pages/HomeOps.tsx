import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { DragRow, GRAY, Handle, LINE, RED, RED_SOFT, reorder, type DragVisual } from "./dragSort";
import { t } from "../copy";

type FloorStyle = "poster3" | "rank" | "grid2";
type FloorBadge = "rank" | "label";

type TabRow = {
  id: number;
  code: string;
  title_en: string;
  title_zh: string;
  position: number;
  enabled: boolean;
  locked: boolean;
  group_id: number | null;
};

type GroupRow = {
  id: number;
  name: string;
  position: number;
  status: string;
  style: FloorStyle;
  badge: FloorBadge;
  drama_count: number;
};

type DramaHit = { id: number; title: string; status: string; cover_url: string };

type BannerRow = {
  id: number;
  drama_id: number | null;
  title: string | null;
  cover_url: string | null;
  kicker: string;
  headline: string;
  status: string;
  position: number;
};

type FloorDrama = { id: number; title: string; cover_url: string; position: number };

function STYLES(): { value: FloorStyle; label: string; hint: string }[] { return [
  { value: "poster3", label: t("homeops.poster_three_col"), hint: t("homeops.poster_three_hint") },
  { value: "rank", label: t("homeops.rank_swipe_card"), hint: t("homeops.rank_hint") },
  { value: "grid2", label: t("homeops.grid_two_col"), hint: t("homeops.grid_hint") },
];; }

function BADGES(): { value: FloorBadge; label: string }[] { return [
  { value: "rank", label: t("homeops.auto_rank") },
  { value: "label", label: t("homeops.marketing_label") },
];; }

const BANNER_LIMIT = 3;

const DARK = "#100f0e";
const DARK_CARD = "#1e1b19";
const GOLD = "#e8b04b";

const TAB_COLS = "20px minmax(0, 1fr) 148px 46px 24px";
const FLOOR_COLS = "20px minmax(0, 1fr) 118px 100px 46px 40px";

const ICON_BTN: React.CSSProperties = {
  width: 18,
  height: 18,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function MoveButtons({
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <Space size={0}>
      <Tooltip title={t("homeops.move_up")}>
        <Button
          size="small"
          type="text"
          disabled={!canUp}
          icon={<ArrowUpOutlined style={{ fontSize: 10 }} />}
          onClick={(event) => {
            event.stopPropagation();
            onUp();
          }}
          style={{ ...ICON_BTN, color: canUp ? "#595550" : "#d9d9d9" }}
        />
      </Tooltip>
      <Tooltip title={t("homeops.move_down")}>
        <Button
          size="small"
          type="text"
          disabled={!canDown}
          icon={<ArrowDownOutlined style={{ fontSize: 10 }} />}
          onClick={(event) => {
            event.stopPropagation();
            onDown();
          }}
          style={{ ...ICON_BTN, color: canDown ? "#595550" : "#d9d9d9" }}
        />
      </Tooltip>
    </Space>
  );
}

type DragKey = { kind: "tab" | "banner" | "floor"; id: number };

export function HomeOpsPage() {
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [floors, setFloors] = useState<Record<number, FloorDrama[]>>({});
  const [dramas, setDramas] = useState<DramaHit[]>([]);
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [drag, setDrag] = useState<DragKey | null>(null);
  const [over, setOver] = useState<DragKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [bannerSearch, setBannerSearch] = useState("");
  const [addingTab, setAddingTab] = useState(false);
  const [addingFloor, setAddingFloor] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tabRes, groupRes, bannerRes, dramaRes] = await Promise.all([
        api<{ items: TabRow[] }>("/admin/v1/tabs"),
        api<{ items: GroupRow[] }>("/admin/v1/groups"),
        api<{ items: BannerRow[] }>("/admin/v1/banners"),
        api<{ items: DramaHit[] }>("/admin/v1/dramas?status=published&page_size=100"),
      ]);
      setTabs(tabRes.items);
      setGroups(groupRes.items.slice().sort((a, b) => a.position - b.position || a.id - b.id));
      setBanners(bannerRes.items);
      setDramas(dramaRes.items);
      setActiveTab((current) => current ?? tabRes.items[0]?.id ?? null);
      setActiveFloor((current) =>
        current != null && groupRes.items.some((group) => group.id === current && group.status === "active")
          ? current
          : (groupRes.items.find((group) => group.status === "active")?.id ?? null)
      );
      const members = await Promise.all(
        groupRes.items.map(async (group) => {
          const res = await api<{ items: FloorDrama[] }>(`/admin/v1/groups/${group.id}/dramas`);
          return [group.id, res.items] as const;
        })
      );
      setFloors(Object.fromEntries(members.map(([id, items]) => [id, items])));
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const discover = tabs.find((tab) => tab.locked) ?? tabs[0];
  const previewTab = tabs.find((tab) => tab.id === activeTab) ?? discover;
  const previewGroup = groups.find((group) => group.id === previewTab?.group_id);
  const discoverFloors = useMemo(() => groups.filter((group) => group.status === "active"), [groups]);

  const saveTabOrder = async (next: TabRow[]) => {
    setTabs(next);
    try {
      await Promise.all(
        next.map((tab, index) =>
          tab.locked
            ? Promise.resolve()
            : api(`/admin/v1/tabs/${tab.id}`, { method: "PATCH", body: JSON.stringify({ position: index }) })
        )
      );
    } catch (error) {
      message.error(errorText(error));
      load();
    }
  };

  const saveFloorOrder = async (next: GroupRow[]) => {
    setGroups(next);
    try {
      await Promise.all(
        next.map((group, index) =>
          api(`/admin/v1/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ position: index }) })
        )
      );
    } catch (error) {
      message.error(errorText(error));
      load();
    }
  };

  const saveBannerOrder = async (next: BannerRow[]) => {
    setBanners(next);
    try {
      await Promise.all(
        next.map((banner, index) =>
          api(`/admin/v1/banners/${banner.id}`, { method: "PATCH", body: JSON.stringify({ position: index }) })
        )
      );
    } catch (error) {
      message.error(errorText(error));
      load();
    }
  };

  const patchTab = async (tab: TabRow, body: Record<string, unknown>) => {
    const previous = tabs;
    setTabs(tabs.map((item) => (item.id === tab.id ? { ...item, ...body } : item)));
    try {
      const saved = await api<TabRow>(`/admin/v1/tabs/${tab.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setTabs((current) => current.map((item) => (item.id === tab.id ? saved : item)));
    } catch (error) {
      setTabs(previous);
      message.error(errorText(error));
    }
  };

  const patchGroup = async (group: GroupRow, body: Partial<GroupRow>) => {
    const previous = groups;
    setGroups(groups.map((item) => (item.id === group.id ? { ...item, ...body } : item)));
    try {
      const saved = await api<GroupRow>(`/admin/v1/groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
      setGroups((current) => current.map((item) => (item.id === group.id ? { ...item, ...saved } : item)));
    } catch (error) {
      setGroups(previous);
      message.error(errorText(error));
    }
  };

  const usedDramaIds = new Set(banners.map((banner) => banner.drama_id));

  const addBanner = async (drama: DramaHit) => {
    if (usedDramaIds.has(drama.id) || banners.length >= BANNER_LIMIT) return;
    try {
      const created = await api<BannerRow>("/admin/v1/banners", {
        method: "POST",
        body: JSON.stringify({ drama_id: drama.id, position: banners.length, headline: drama.title }),
      });
      setBanners((current) => [...current, created]);
      setPicking(false);
      setBannerSearch("");
      message.success(t("homeops.added_to_carousel", {v0: drama.title}));
    } catch (error) {
      message.error(errorText(error));
    }
  };
  const idleGroups = groups.filter((group) => group.status !== "active");

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  const moveTab = (fromId: number, toId: number) => {
    const from = tabs.findIndex((item) => item.id === fromId);
    const to = tabs.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    if (tabs[from].locked || tabs[to].locked) return;
    saveTabOrder(reorder(tabs, from, to));
  };

  const moveBanner = (fromId: number, toId: number) => {
    const from = banners.findIndex((item) => item.id === fromId);
    const to = banners.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    saveBannerOrder(reorder(banners, from, to));
  };

  const moveFloor = (fromId: number, toId: number) => {
    const from = discoverFloors.findIndex((item) => item.id === fromId);
    const to = discoverFloors.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const rest = groups.filter((item) => item.status !== "active");
    saveFloorOrder([...reorder(discoverFloors, from, to), ...rest]);
  };

  const previewFloors = useMemo(() => {
    if (previewTab && !previewTab.locked && previewGroup) return [previewGroup];
    return discoverFloors;
  }, [previewTab, previewGroup, discoverFloors]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(460px, 1fr) 300px", gap: 20, alignItems: "start" }}>
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 2 }}>
            {t("homeops.home_ops")}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("homeops.discover_note")}
          </Typography.Text>
        </div>

        <Card
          title={t("homeops.channel_tab")}
          size="small"
          styles={{ body: { paddingTop: 10 } }}
          extra={
            <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingTab(true)}>
              {t("homeops.add_channel")}
            </Button>
          }
        >
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            {tabs.map((tab) => {
              const visual: DragVisual = {
                active: activeTab === tab.id,
                dragging: drag?.kind === "tab" && drag.id === tab.id,
                dropping: over?.kind === "tab" && over.id === tab.id,
              };
              return (
                <DragRow
                  key={tab.id}
                  columns={TAB_COLS}
                  draggable={!tab.locked}
                  visual={visual}
                  onDragStart={() => setDrag({ kind: "tab", id: tab.id })}
                  onDragEnd={endDrag}
                  onDragOver={() => {
                    if (drag?.kind !== "tab" || tab.locked) return;
                    setOver({ kind: "tab", id: tab.id });
                  }}
                  onDrop={() => {
                    if (drag?.kind !== "tab") return;
                    moveTab(drag.id, tab.id);
                    endDrag();
                  }}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {(onArm) => (
                    <>
                      <Handle locked={tab.locked} onArm={onArm} />
                      <div style={{ minWidth: 0 }}>
                        <Typography.Text style={{ fontSize: 13 }}>{tab.title_zh || tab.title_en}</Typography.Text>
                        <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                          {tab.code}
                        </Typography.Text>
                      </div>
                      {tab.locked ? (
                        <Tag color="red" style={{ margin: 0, justifySelf: "start" }}>
                          {t("homeops.pinned_discover")}
                        </Tag>
                      ) : (
                        <Select
                          size="small"
                          style={{ width: "100%" }}
                          value={tab.group_id ?? undefined}
                          placeholder={t("homeops.bind_group")}
                          options={groups.map((group) => ({ value: group.id, label: group.name }))}
                          onChange={(groupId) => patchTab(tab, { group_id: groupId })}
                          onClick={(event) => event.stopPropagation()}
                        />
                      )}
                      <Switch
                        size="small"
                        checked={tab.enabled}
                        disabled={tab.locked}
                        onChange={(enabled) => patchTab(tab, { enabled })}
                        onClick={(_, event) => event.stopPropagation()}
                      />
                      {tab.locked ? (
                        <span />
                      ) : (
                        <Popconfirm
                          title={t("homeops.delete_channel_confirm")}
                          okText={t("common.delete")}
                          cancelText={t("common.cancel")}
                          okButtonProps={{ danger: true }}
                          onConfirm={async (event) => {
                            event?.stopPropagation();
                            try {
                              await api(`/admin/v1/tabs/${tab.id}`, { method: "DELETE" });
                              if (activeTab === tab.id) setActiveTab(null);
                              setTabs((current) => current.filter((item) => item.id !== tab.id));
                            } catch (error) {
                              message.error(errorText(error));
                            }
                          }}
                          onCancel={(event) => event?.stopPropagation()}
                        >
                          <Tooltip title={t("homeops.delete_channel")}>
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                              style={ICON_BTN}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </Tooltip>
                        </Popconfirm>
                      )}
                    </>
                  )}
                </DragRow>
              );
            })}
            {tabs.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("homeops.no_channels")} /> : null}
          </Space>
        </Card>

        <Card
          title={t("homeops.banner_carousel")}
          size="small"
          styles={{ body: { paddingTop: 10 } }}
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {banners.length}/{BANNER_LIMIT} {t("common.dramas_unit")}
            </Typography.Text>
          }
        >
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {banners.map((banner, index) => (
              <BannerCard
                key={banner.id}
                banner={banner}
                index={index}
                dragging={drag?.kind === "banner" && drag.id === banner.id}
                dropping={over?.kind === "banner" && over.id === banner.id}
                canUp={index > 0}
                canDown={index < banners.length - 1}
                onDragStart={() => setDrag({ kind: "banner", id: banner.id })}
                onDragEnd={endDrag}
                onDragOver={() => {
                  if (drag?.kind !== "banner") return;
                  setOver({ kind: "banner", id: banner.id });
                }}
                onDrop={() => {
                  if (drag?.kind !== "banner") return;
                  moveBanner(drag.id, banner.id);
                  endDrag();
                }}
                onMove={(direction) => {
                  const target = banners[index + direction];
                  if (target) moveBanner(banner.id, target.id);
                }}
                onChange={(field, value) =>
                  setBanners((current) =>
                    current.map((item) => (item.id === banner.id ? { ...item, [field]: value } : item))
                  )
                }
                onCommit={(field, value) =>
                  api(`/admin/v1/banners/${banner.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ [field]: value }),
                  }).catch((error) => message.error(errorText(error)))
                }
                onRemove={async () => {
                  try {
                    await api(`/admin/v1/banners/${banner.id}`, { method: "DELETE" });
                    setBanners((current) => current.filter((item) => item.id !== banner.id));
                    setBannerIndex(0);
                  } catch (error) {
                    message.error(errorText(error));
                  }
                }}
              />
            ))}
            {banners.length < BANNER_LIMIT ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                style={{
                  width: 176,
                  alignSelf: "stretch",
                  minHeight: 200,
                  border: "1px dashed #d9d9d9",
                  borderRadius: 10,
                  background: "transparent",
                  color: GRAY,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("homeops.add_drama_plus")}
              </button>
            ) : null}
          </div>
        </Card>

        <Card
          title={t("homeops.discover_floors")}
          size="small"
          styles={{ body: { paddingTop: 10 } }}
          extra={
            <Space size={12}>
              <Link to="/groups">{t("homeops.manage_group_content")}</Link>
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={idleGroups.length === 0}
                onClick={() => setAddingFloor(true)}
              >
                {t("homeops.add_floor")}
              </Button>
            </Space>
          }
        >
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            {discoverFloors.map((group, index) => {
            const visual: DragVisual = {
              active: activeFloor === group.id,
              dragging: drag?.kind === "floor" && drag.id === group.id,
              dropping: over?.kind === "floor" && over.id === group.id,
            };
            return (
              <DragRow
                key={group.id}
                columns={FLOOR_COLS}
                draggable
                visual={visual}
                onDragStart={() => setDrag({ kind: "floor", id: group.id })}
                onDragEnd={endDrag}
                onDragOver={() => {
                  if (drag?.kind !== "floor") return;
                  setOver({ kind: "floor", id: group.id });
                }}
                onDrop={() => {
                  if (drag?.kind !== "floor") return;
                  moveFloor(drag.id, group.id);
                  endDrag();
                }}
                onClick={() => setActiveFloor(group.id)}
              >
                {(onArm) => (
                  <>
                    <Handle onArm={onArm} title={t("homeops.drag_sort_hint")} />
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text style={{ fontSize: 13 }}>{group.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                        {group.drama_count} {t("common.dramas_unit")}
                      </Typography.Text>
                    </div>
                    <Select
                      size="small"
                      style={{ width: "100%" }}
                      value={group.style}
                      options={STYLES().map((item) => ({ value: item.value, label: item.label }))}
                      onChange={(style) => patchGroup(group, { style })}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <Select
                      size="small"
                      style={{ width: "100%" }}
                      value={group.badge}
                      options={BADGES()}
                      onChange={(badge) => patchGroup(group, { badge })}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <Switch
                      size="small"
                      checked={group.status === "active"}
                      onChange={(active) => patchGroup(group, { status: active ? "active" : "inactive" })}
                      onClick={(_, event) => event.stopPropagation()}
                    />
                    <MoveButtons
                      canUp={index > 0}
                      canDown={index < discoverFloors.length - 1}
                      onUp={() => {
                        const target = discoverFloors[index - 1];
                        if (target) moveFloor(group.id, target.id);
                      }}
                      onDown={() => {
                        const target = discoverFloors[index + 1];
                        if (target) moveFloor(group.id, target.id);
                      }}
                    />
                  </>
                )}
              </DragRow>
            );
          })}
            {discoverFloors.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("homeops.no_active_groups")} />
            ) : null}
          </Space>
        </Card>
      </Space>

      <PhonePreview
        tabs={tabs}
        activeCode={previewTab?.code}
        onTab={(code) => {
          const next = tabs.find((tab) => tab.code === code);
          if (next) setActiveTab(next.id);
        }}
        banners={banners}
        bannerIndex={bannerIndex}
        onBanner={setBannerIndex}
        floors={previewFloors.map((group) => ({ ...group, dramas: floors[group.id] ?? [] }))}
        activeFloor={activeFloor}
        onFloor={setActiveFloor}
        loading={loading}
      />

      <Modal
        title={
          <Space size={8}>
            <span>{t("homeops.add_drama_to_banner")}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {t("homeops.selected_banners", {v0: banners.length, v1: BANNER_LIMIT})}
            </Typography.Text>
          </Space>
        }
        open={picking}
        onCancel={() => {
          setPicking(false);
          setBannerSearch("");
        }}
        footer={null}
        width={620}
      >
        <style>{".bp-card:hover{border-color:#e24b4a;box-shadow:0 2px 10px rgba(226,75,74,.16)}.bp-card:active{transform:scale(.97)}"}</style>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: GRAY }} />}
          placeholder={t("homeops.search_drama_name")}
          value={bannerSearch}
          onChange={(event) => setBannerSearch(event.target.value)}
          style={{ marginBottom: 12 }}
        />
        {(() => {
          const keyword = bannerSearch.trim().toLowerCase();
          const pool = dramas
            .map((drama) => ({ ...drama, inBanner: usedDramaIds.has(drama.id) }))
            .filter((drama) => !keyword || drama.title.toLowerCase().includes(keyword))
            .sort((a, b) => Number(a.inBanner) - Number(b.inBanner));
          if (dramas.length === 0) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("homeops.no_published_dramas")} />;
          }
          if (pool.length === 0) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("homeops.no_matching_banner_drama", {v0: bannerSearch})} />;
          }
          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
                maxHeight: 400,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {pool.map((drama) => (
                <button
                  key={drama.id}
                  type="button"
                  disabled={drama.inBanner}
                  onClick={() => addBanner(drama)}
                  className="bp-card"
                  style={{
                    border: `1px solid ${LINE}`,
                    borderRadius: 10,
                    padding: 6,
                    background: "#fff",
                    cursor: drama.inBanner ? "default" : "pointer",
                    textAlign: "left",
                    opacity: drama.inBanner ? 0.55 : 1,
                    transition: "border-color .15s ease, box-shadow .15s ease, transform .1s ease",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <Thumb url={drama.cover_url} width="100%" ratio="2 / 3" radius={6} />
                    {drama.inBanner ? (
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 6,
                          background: "rgba(16,15,14,0.45)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            color: "#fff",
                            fontSize: 11,
                            background: "rgba(0,0,0,0.65)",
                            padding: "2px 8px",
                            borderRadius: 10,
                          }}
                        >
                          {t("homeops.already_in_carousel")}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div
                    title={drama.title}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.35,
                      marginTop: 6,
                      height: 32,
                      color: "#333",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {drama.title}
                  </div>
                </button>
              ))}
            </div>
          );
        })()}
      </Modal>

      <AddTabModal
        open={addingTab}
        groups={groups}
        onCancel={() => setAddingTab(false)}
        onCreate={async (body) => {
          try {
            const created = await api<TabRow>("/admin/v1/tabs", {
            method: "POST",
            body: JSON.stringify({ ...body, position: tabs.length }),
          });
            setTabs([...tabs, created]);
            setAddingTab(false);
          } catch (error) {
            message.error(errorText(error));
          }
        }}
      />

      <AddFloorModal
        open={addingFloor}
        groups={idleGroups}
        onCancel={() => setAddingFloor(false)}
        onPick={async (groupId) => {
          const group = groups.find((item) => item.id === groupId);
          if (!group) return;
          await patchGroup(group, { status: "active", position: discoverFloors.length });
          setAddingFloor(false);
        }}
      />
    </div>
  );
}

function BannerCard({
  banner,
  index,
  dragging,
  dropping,
  canUp,
  canDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onChange,
  onCommit,
  onRemove,
}: {
  banner: BannerRow;
  index: number;
  dragging: boolean;
  dropping: boolean;
  canUp: boolean;
  canDown: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
  onChange: (field: "kicker" | "headline", value: string) => void;
  onCommit: (field: "kicker" | "headline", value: string) => void;
  onRemove: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <div
      draggable={armed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={() => {
        setArmed(false);
        onDragEnd();
      }}
      onMouseUp={() => setArmed(false)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setArmed(false);
        onDrop();
      }}
      style={{
        width: 176,
        flex: "0 0 auto",
        border: `1px solid ${dropping ? RED : dragging ? "#f0b3b1" : LINE}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "#fff",
        opacity: dragging ? 0.4 : 1,
        boxShadow: dragging ? "0 6px 16px rgba(0,0,0,0.12)" : "none",
        transition: "border-color .15s ease, box-shadow .15s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        <BannerArt banner={banner} height={96} />
        <span style={{ position: "absolute", left: 6, top: 6 }}>
          <Handle onArm={() => setArmed(true)} title={t("homeops.drag_carousel_hint")} />
        </span>
        <span
          style={{
            position: "absolute",
            right: 6,
            top: 6,
            fontSize: 10,
            lineHeight: "16px",
            minWidth: 16,
            textAlign: "center",
            color: "#fff",
            background: "rgba(0,0,0,0.45)",
            borderRadius: 8,
          }}
        >
          {index + 1}
        </span>
      </div>
      <div style={{ padding: 8 }}>
        <Field label={t("homeops.hook_copy")}>
          <Input
            size="small"
            value={banner.kicker}
            placeholder={t("homeops.hook_example")}
            maxLength={80}
            onChange={(event) => onChange("kicker", event.target.value)}
            onBlur={() => onCommit("kicker", banner.kicker)}
          />
        </Field>
        <Field label={t("homeops.headline")}>
          <Input
            size="small"
            value={banner.headline}
            placeholder={banner.title ?? t("common.drama_name")}
            maxLength={80}
            onChange={(event) => onChange("headline", event.target.value)}
            onBlur={() => onCommit("headline", banner.headline)}
          />
        </Field>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 6 }}>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, minWidth: 0, flex: 1 }}
            ellipsis={{ tooltip: banner.title }}
          >
            {banner.title ?? t("homeops.no_drama_selected")}
          </Typography.Text>
          <Space size={0} style={{ flex: "0 0 auto" }}>
            <Tooltip title={t("homeops.move_forward")}>
              <Button
                size="small"
                type="text"
                disabled={!canUp}
                icon={<ArrowUpOutlined style={{ fontSize: 10 }} />}
                onClick={() => onMove(-1)}
                style={{ ...ICON_BTN, color: canUp ? "#595550" : "#d9d9d9" }}
              />
            </Tooltip>
            <Tooltip title={t("homeops.move_back")}>
              <Button
                size="small"
                type="text"
                disabled={!canDown}
                icon={<ArrowDownOutlined style={{ fontSize: 10 }} />}
                onClick={() => onMove(1)}
                style={{ ...ICON_BTN, color: canDown ? "#595550" : "#d9d9d9" }}
              />
            </Tooltip>
            <Popconfirm title={t("homeops.remove_from_carousel")} okText={t("homeops.remove")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={onRemove}>
              <Tooltip title={t("homeops.remove")}>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  style={ICON_BTN}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: GRAY, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

/** Banner 视觉：模糊底图 + 清晰竖版海报 + 文案，避免竖海报被横向拉扯变形。 */
function BannerArt({ banner, height }: { banner: BannerRow; height: number }) {
  const [broken, setBroken] = useState(false);
  const cover = broken ? undefined : (banner.cover_url ?? undefined);
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 8,
        overflow: "hidden",
        background: "#2a1412",
        isolation: "isolate",
      }}
    >
      {cover ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: -24,
              background: `url("${cover}") center / cover no-repeat`,
              filter: "blur(16px) saturate(1.15)",
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(96deg, rgba(16,15,14,0.94) 0%, rgba(16,15,14,0.72) 54%, rgba(16,15,14,0.30) 100%)",
            }}
          />
        </>
      ) : null}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px",
          textAlign: "left",
        }}
      >
        <Thumb
          url={cover}
          width={Math.round(height * 0.45)}
          height={Math.round(height * 0.75)}
          radius={6}
          onBroken={() => setBroken(true)}
          shadow
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          {banner.kicker ? (
            <div style={{ fontSize: 9, letterSpacing: 0.6, color: GOLD, marginBottom: 3 }}>{banner.kicker}</div>
          ) : null}
          <div
            style={{
              fontSize: Math.max(12, Math.round(height * 0.14)),
              fontWeight: 600,
              lineHeight: 1.25,
              color: "#fff",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {banner.headline || banner.title || t("homeops.headline")}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhonePreview({
  tabs,
  activeCode,
  onTab,
  banners,
  bannerIndex,
  onBanner,
  floors,
  activeFloor,
  onFloor,
  loading,
}: {
  tabs: TabRow[];
  activeCode?: string;
  onTab: (code: string) => void;
  banners: BannerRow[];
  bannerIndex: number;
  onBanner: (index: number) => void;
  floors: (GroupRow & { dramas: FloorDrama[] })[];
  activeFloor: number | null;
  onFloor: (id: number) => void;
  loading: boolean;
}) {
  const current = banners.length ? bannerIndex % banners.length : 0;
  const banner = banners.length ? banners[current] : null;
  const tab = tabs.find((item) => item.code === activeCode);
  const isDiscover = !tab || tab.locked;

  return (
    <div style={{ position: "sticky", top: 16 }}>
      <style>{".mtv-scroll::-webkit-scrollbar{width:0;height:0}"}</style>
      <Typography.Text
        type="secondary"
        style={{ display: "block", textAlign: "center", marginBottom: 8, fontSize: 12 }}
      >
        {t("homeops.live_preview", {v0: isDiscover ? t("homeops.discover") : (tab?.title_zh || tab?.title_en || t("homeops.channel"))})}
      </Typography.Text>
      <div
        style={{
          width: 268,
          height: 556,
          margin: "0 auto",
          borderRadius: 34,
          background: DARK,
          padding: 10,
          boxSizing: "border-box",
          border: "1px solid rgba(0,0,0,0.16)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: 26,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: DARK,
          }}
        >
          {/* 状态栏 */}
          <div
            style={{
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              fontSize: 10,
              color: "#fff",
              flex: "0 0 auto",
            }}
          >
            <span style={{ fontWeight: 600 }}>9:41</span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </span>
          </div>

          {/* 品牌 + 搜索 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 12px 8px", flex: "0 0 auto" }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                background: RED,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              M
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", flex: "0 0 auto" }}>MiniTV</span>
            <div
              style={{
                flex: 1,
                height: 26,
                borderRadius: 13,
                background: "#2a1618",
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "0 9px",
                minWidth: 0,
              }}
            >
              <SearchIcon />
              <span
                style={{
                  fontSize: 10,
                  color: "#b7aaa4",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t("homeops.search_placeholder")}
              </span>
            </div>
          </div>

          {/* 频道 Tab */}
          <div
            style={{
              display: "flex",
              gap: 14,
              padding: "0 12px",
              flex: "0 0 auto",
              overflow: "hidden",
              borderBottom: "1px solid #232020",
            }}
          >
            {tabs.map((item) => {
              const active = item.code === activeCode;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTab(item.code)}
                  style={{
                    background: "none",
                    border: 0,
                    padding: "0 0 5px",
                    fontSize: 11,
                    cursor: "pointer",
                    color: active ? "#fff" : GRAY,
                    borderBottom: active ? "2px solid #fff" : "2px solid transparent",
                    fontWeight: active ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title_zh || item.title_en}
                </button>
              );
            })}
          </div>

          {/* 内容区 */}
          <div
            className="mtv-scroll"
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px 12px 8px", scrollbarWidth: "none" }}
          >
            {loading ? (
              <div style={{ color: GRAY, fontSize: 11, textAlign: "center", marginTop: 60 }}>{t("common.loading")}</div>
            ) : null}

            {!loading && banner ? (
              <button
                type="button"
                onClick={() => onBanner((current + 1) % banners.length)}
                style={{
                  display: "block",
                  width: "100%",
                  border: 0,
                  padding: 0,
                  background: "none",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <BannerArt banner={banner} height={120} />
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 8,
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  {banners.map((item, dot) => (
                    <span
                      key={item.id}
                      style={{
                        width: dot === current ? 12 : 4,
                        height: 4,
                        borderRadius: 2,
                        background: dot === current ? "#fff" : "rgba(255,255,255,0.4)",
                        transition: "width .15s ease",
                      }}
                    />
                  ))}
                </span>
              </button>
            ) : null}

            {!loading && !banner ? (
              <div
                style={{
                  border: "1px dashed #3a3633",
                  borderRadius: 10,
                  height: 90,
                  color: GRAY,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t("homeops.no_banner")}
              </div>
            ) : null}

            {!loading && isDiscover ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 2px 2px", fontSize: 11 }}>
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    background: RED,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  M
                </span>
                <span style={{ color: "#fff", fontWeight: 600 }}>MiniTV</span>
                <span style={{ color: GRAY }}>{t("homeops.exclusive")}</span>
              </div>
            ) : null}

            {!loading
              ? floors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    onClick={() => onFloor(floor.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      overflow: "hidden",
                      border:
                        activeFloor === floor.id ? "1px solid rgba(226,75,74,0.55)" : "1px solid transparent",
                      borderRadius: 10,
                      background: activeFloor === floor.id ? "rgba(226,75,74,0.10)" : "transparent",
                      color: "#fff",
                      textAlign: "left",
                      padding: "10px 6px 12px",
                      cursor: "pointer",
                      transition: "background .15s ease, border-color .15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        <span style={{ width: 3, height: 12, borderRadius: 2, background: RED, flex: "0 0 auto" }} />
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {floor.name}
                        </span>
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: GRAY, fontSize: 10 }}>
                        {t("homeops.more")}
                        <ChevronIcon />
                      </span>
                    </div>
                    <FloorArt styleName={floor.style} dramas={floor.dramas} badge={floor.badge} />
                  </button>
                ))
              : null}

            {!loading && floors.length === 0 ? (
              <div style={{ color: GRAY, fontSize: 11, textAlign: "center", marginTop: 60 }}>
                {t("homeops.channel_empty")}
              </div>
            ) : null}
          </div>

          {/* 底部导航 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid #232020",
              padding: "6px 0 8px",
              fontSize: 9,
              textAlign: "center",
              flex: "0 0 auto",
            }}
          >
            <NavItem label={t("homeops.home_tab")} icon={<HomeIcon />} active />
            <NavItem label={t("homeops.recommend_tab")} icon={<CompassIcon />} />
            <NavItem label={t("homeops.rewards_tab")} icon={<GiftIcon />} />
            <NavItem label={t("homeops.profile_tab")} icon={<UserIcon />} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ label, icon, active }: { label: string; icon: React.ReactNode; active?: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        color: active ? RED : GRAY,
        fontSize: 9,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function FloorArt({
  styleName,
  dramas,
  badge,
}: {
  styleName: FloorStyle;
  dramas: FloorDrama[];
  badge: FloorBadge;
}) {
  if (dramas.length === 0) {
    return (
      <div
        style={{
          color: GRAY,
          fontSize: 10,
          border: "1px dashed #3a3633",
          borderRadius: 8,
          padding: "14px 0",
          textAlign: "center",
        }}
      >
        {t("homeops.group_empty")}
      </div>
    );
  }

  if (styleName === "rank") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
        {dramas.slice(0, 3).map((drama, index) => (
          <div
            key={drama.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: DARK_CARD,
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            <span
              style={{
                color: index === 0 ? RED : index === 1 ? "#ef9f27" : GRAY,
                fontSize: 12,
                fontWeight: 700,
                width: 14,
                textAlign: "center",
                fontStyle: "italic",
              }}
            >
              {index + 1}
            </span>
            <Thumb url={drama.cover_url} width={38} height={54} radius={5} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#f2eeec",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {drama.title}
              </div>
              <div style={{ fontSize: 9, color: GRAY, marginTop: 3 }}>
                {badge === "rank" ? `NO.${index + 1}` : t("homeops.exclusive_hot")}
              </div>
            </div>
          </div>
          ))}
      </div>
    );
  }

  const columns = styleName === "grid2" ? 2 : 3;
  const wide = styleName === "grid2";
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}>
      {dramas.slice(0, wide ? 4 : 3).map((drama, index) => {
        const marketing = badge === "label" && index === 0;
        return (
          <div key={drama.id} style={{ minWidth: 0 }}>
            <div style={{ position: "relative" }}>
              <Thumb url={drama.cover_url} width="100%" ratio={wide ? "16 / 9" : "2 / 3"} radius={6} />
              <span
                style={{
                  position: "absolute",
                  left: 4,
                  top: 4,
                  background: marketing ? GOLD : RED,
                  color: marketing ? "#412402" : "#fff",
                  borderRadius: 3,
                  fontSize: 9,
                  lineHeight: 1.4,
                  padding: "0 3px",
                  fontWeight: marketing ? 600 : 400,
                }}
              >
                {badge === "label" ? (marketing ? t("homeops.first_release") : t("homeops.hot")) : index + 1}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                marginTop: 4,
                color: "#d6cfcb",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {drama.title}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 封面图：CDN 404 时退回占位卡片，而不是留一块灰底。 */
function Thumb({
  url,
  width,
  height,
  ratio,
  radius,
  shadow,
  onBroken,
}: {
  url?: string;
  width: number | string;
  height?: number;
  ratio?: string;
  radius?: number;
  shadow?: boolean;
  onBroken?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const missing = !url || broken;
  const box: React.CSSProperties = {
    width,
    flex: "0 0 auto",
    borderRadius: radius ?? 4,
    boxShadow: shadow ? "0 3px 10px rgba(0,0,0,0.4)" : "none",
    ...(ratio ? { aspectRatio: ratio } : { height }),
  };
  if (missing) {
    return (
      <div
        style={{
          ...box,
          background: "linear-gradient(155deg, #403a36 0%, #2b2724 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#857c75",
        }}
      >
        <FilmIcon size={18} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => {
        setBroken(true);
        onBroken?.();
      }}
      style={{ ...box, objectFit: "cover", display: "block", background: "linear-gradient(155deg, #403a36 0%, #2b2724 100%)" }}
    />
  );
}

function AddTabModal({
  open,
  groups,
  onCancel,
  onCreate,
}: {
  open: boolean;
  groups: GroupRow[];
  onCancel: () => void;
  onCreate: (body: { code: string; title_en: string; title_zh: string; group_id: number }) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  return (
    <Modal
      title={t("homeops.add_channel")}
      open={open}
      onCancel={onCancel}
      destroyOnHidden
      onOk={async () => {
        if (!code.trim() || !titleEn.trim() || groupId == null) {
          message.warning(t("homeops.required_fields"));
          return;
        }
        await onCreate({ code: code.trim(), title_en: titleEn.trim(), title_zh: titleZh.trim(), group_id: groupId });
        setCode("");
        setTitleEn("");
        setTitleZh("");
        setGroupId(null);
      }}
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Field label={t("homeops.chinese_name")}>
          <Input value={titleZh} placeholder={t("homeops.title_zh_example")} onChange={(event) => setTitleZh(event.target.value)} />
        </Field>
        <Field label={t("homeops.english_name")}>
          <Input value={titleEn} placeholder={t("homeops.title_en_example")} onChange={(event) => setTitleEn(event.target.value)} />
        </Field>
        <Field label={t("homeops.code")}>
          <Input value={code} placeholder={t("homeops.code_example")} onChange={(event) => setCode(event.target.value)} />
        </Field>
        <Field label={t("homeops.bind_group")}>
          <Select
            style={{ width: "100%" }}
            placeholder={t("homeops.channel_group_placeholder")}
            value={groupId ?? undefined}
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
            onChange={setGroupId}
          />
        </Field>
      </Space>
    </Modal>
  );
}

function AddFloorModal({
  open,
  groups,
  onCancel,
  onPick,
}: {
  open: boolean;
  groups: GroupRow[];
  onCancel: () => void;
  onPick: (groupId: number) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState<number | null>(null);
  return (
    <Modal
      title={t("homeops.add_floor")}
      open={open}
      onCancel={onCancel}
      destroyOnHidden
      onOk={async () => {
        if (groupId == null) {
          message.warning(t("homeops.select_group_first"));
          return;
        }
        await onPick(groupId);
        setGroupId(null);
      }}
    >
      <Field label={t("groups.select_group")}>
        <Select
          style={{ width: "100%" }}
          placeholder={t("homeops.pick_inactive_group")}
          value={groupId ?? undefined}
          options={groups.map((group) => ({ value: group.id, label: t("homeops.group_option", {v0: group.name, v1: group.drama_count}) }))}
          onChange={setGroupId}
        />
      </Field>
    </Modal>
  );
}

function SignalIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
      <rect x="0" y="6.5" width="2.5" height="3.5" rx="0.8" fill="#fff" />
      <rect x="4" y="4" width="2.5" height="6" rx="0.8" fill="#fff" />
      <rect x="8" y="1.5" width="2.5" height="8.5" rx="0.8" fill="#fff" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="11" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
      <path d="M1 3.2a7.5 7.5 0 0 1 10 0" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.2 5.6a4.2 4.2 0 0 1 5.6 0" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="8.4" r="1.1" fill="#fff" />
    </svg>
  );
}

function FilmIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.8" y="3" width="12.4" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.8 6.5h12.4M1.8 9.5h12.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden="true">
      <rect x="0.6" y="0.6" width="16" height="8.8" rx="2.2" stroke="#fff" strokeOpacity="0.5" />
      <rect x="2.2" y="2.2" width="10" height="5.6" rx="1.2" fill="#fff" />
      <path d="M18.2 3.6v2.8" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="3.6" stroke="#b7aaa4" strokeWidth="1.2" />
      <path d="M7.8 7.8 10.5 10.5" stroke="#b7aaa4" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="m3 1.5 3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 7 8 2.5 13.5 7v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.4 14V9.6h3.2V14" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="m10.4 5.6-1.5 3.3-3.3 1.5 1.5-3.3 3.3-1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="6.2" width="11.6" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.2 6.2h11.6M8 6.2v8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 6.2S7.2 2.5 5.6 3.2C4.4 3.7 5 6.2 8 6.2Zm0 0s.8-3.7 2.4-3c1.2.5.6 3-2.4 3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.6" r="2.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.8 2.2-4.4 5-4.4s5 1.6 5 4.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
