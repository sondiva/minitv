import { createContext, useContext } from "react";
import { t } from "./copy";

export type Me = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  /** Present only on the partner surface (`/partner/v1/me`). */
  supplier?: { id: number; name: string; status: string; revenue_share_bps: number };
};

/** Human labels for `admin_users.role`; keys mirror backend/app/modules/ops/models.py. */
export function ROLE_LABELS(): Record<string, string> { return {
  ops: t("me.ops"),
  finance: t("apikeys.finance_role"),
  admin: t("me.admin"),
  partner: t("me.partner"),
};; }

/** Staff roles only: partners are created from the supplier page, not here. */
export function ROLE_OPTIONS(){ return [
  { value: "ops", label: t("me.ops") },
  { value: "finance", label: t("apikeys.finance_role") },
  { value: "admin", label: t("me.admin") },
];; }

/**
 * Roles allowed to create / edit content. Mirrors CONTENT_WRITER_ROLES in
 * backend/app/modules/ops/models.py — the API answers 403 for anyone else.
 */
const CONTENT_WRITER_ROLES = ["ops", "admin"];

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me | null {
  return useContext(MeContext);
}

/** Whether the signed-in admin may create dramas / write content. */
export function useCanWriteContent(): boolean {
  const me = useMe();
  return me !== null && CONTENT_WRITER_ROLES.includes(me.role);
}

/**
 * 仅管理员可执行删除剧集、调账、套餐改价等高危操作
 * （角色矩阵见 docs/software-architecture.md：管理员 / 运营 / 财务）。
 */
export function useIsAdmin(): boolean {
  const me = useMe();
  return me?.role === "admin";
}

/** External suppliers get a different shell; never let them into staff pages. */
export function useIsPartner(): boolean {
  const me = useMe();
  return me?.role === "partner";
}
