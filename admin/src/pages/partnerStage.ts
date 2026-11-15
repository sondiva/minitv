import { t } from "../copy";
/** Supplier-facing lifecycle label. Approved ≠ live, so the tag must say so. */
export function partnerStage(status: string, reviewState: string): string {
  if (reviewState === "rejected") return t("reviews.rejected");
  if (reviewState === "pending") return t("common.in_review");
  if (status === "published") return t("common.published");
  if (status === "unpublished") return t("common.unpublished");
  if (reviewState === "approved") return t("partnerdramas.pending_publish");
  return t("common.draft");
}

export function partnerStageColor(status: string, reviewState: string): string | undefined {
  if (reviewState === "rejected") return "red";
  if (reviewState === "pending") return "orange";
  if (status === "published") return "green";
  if (reviewState === "approved") return "blue";
  return undefined;
}
