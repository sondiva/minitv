"""Backend user-facing strings: ``zh`` (source) + ``vi`` (Vietnamese).

Every Chinese literal that used to be hardcoded at a raise/return site lives
here as the ``zh`` value of a stable key, and the Vietnamese translation as
the ``vi`` value. Translations follow ``VI_GLOSSARY.md`` at the repo root
(剧集 = Phim, 金币 = Xu, 会员 = Hội viên, ...).

Language resolution
-------------------
The language is per-request, taken from the ``Accept-Language`` header by the
locale middleware in ``main.py`` and stored in a :class:`contextvars.ContextVar`
so any code running inside a request — routers, services, helpers — can call
:func:`t` without a signature change. Outside a request (scripts, background
workers, tests without the header) the language is ``zh``, so existing
behaviour is byte-identical by default.

Rules:
- ``t(key)`` falls back to the ``zh`` value when the key is missing in ``vi``,
  and to the key itself when it is missing everywhere.
- Templates use ``{name}`` placeholders and are formatted with
  ``str.format(**kwargs)``; call sites pass values, never pre-formatted text.
- Seed/DB content (reward names, plan names, the seeded admin display name)
  also goes through :func:`t` at definition time, which resolves to ``zh``
  because no request is in flight — the stored data is unchanged. Per-request
  translation of already-stored rows is out of scope: the rows keep the
  language they were seeded with.
"""

from __future__ import annotations

import contextvars

DEFAULT_LANG = "zh"
SUPPORTED_LANGS = ("zh", "vi")

_current_lang: contextvars.ContextVar[str] = contextvars.ContextVar(
    "minitv_lang", default=DEFAULT_LANG
)


def parse_accept_language(header: str | None) -> str:
    """Return ``"vi"`` when the header asks for Vietnamese, else ``"zh"``.

    The first recognised ``zh``/``vi`` language tag wins; anything else
    (``en``, ``fr``, ...) falls through to the ``zh`` default.
    """
    if not header:
        return DEFAULT_LANG
    for part in header.split(","):
        tag = part.split(";")[0].strip().lower()
        if not tag:
            continue
        if tag == "vi" or tag.startswith("vi-"):
            return "vi"
        if tag == "zh" or tag.startswith("zh-"):
            return "zh"
    return DEFAULT_LANG


def set_lang(lang: str):
    """Set the current request language; returns a token for :func:`reset_lang`."""
    return _current_lang.set(lang if lang in SUPPORTED_LANGS else DEFAULT_LANG)


def reset_lang(token) -> None:
    _current_lang.reset(token)


def get_lang() -> str:
    return _current_lang.get()


def t(key: str, lang: str | None = None, **kwargs) -> str:
    """Translate ``key`` to the current (or given) language.

    Falls back to ``zh`` when the key has no ``vi`` entry, and to the key
    itself when it exists in neither table.
    """
    resolved = lang or get_lang()
    table = MESSAGES.get(resolved, MESSAGES[DEFAULT_LANG])
    template = table.get(key)
    if template is None:
        template = MESSAGES[DEFAULT_LANG].get(key, key)
    if kwargs:
        return template.format(**kwargs)
    return template


# ---------------------------------------------------------------------------
# Message tables. ``zh`` values are the exact original strings (byte-identical
# to what the code raised before); ``vi`` follows VI_GLOSSARY.md.
# ---------------------------------------------------------------------------

MESSAGES: dict[str, dict[str, str]] = {
    "zh": {
        # -- auth / session -------------------------------------------------
        "auth.missing_credential": "缺少 Authorization 头",
        "auth.session_store_unavailable": (
            "会话存储不可用（Redis 未连接）。请先启动 minitv-redis："
            "在仓库根目录执行 docker compose up -d，然后重试。"
        ),
        "auth.session_unavailable": "会话存储不可用",
        "auth.invalid_session": "会话无效或已过期",
        "auth.staff_only": "该接口仅对平台员工开放",
        "auth.partner_only": "该接口仅对上剧方开放",
        "auth.partner_scope_denied": "上剧方密钥只能访问合作方接口",
        "auth.session_required": "该接口只能用登录会话调用",
        "auth.supplier_disabled": "供应商已停用",
        "auth.use_api_key": "请使用 API Key 调用",
        "auth.account_disabled": "密钥绑定的账号已被禁用",
        "auth.password_wrong": "原密码不正确",
        "auth.password_same": "新密码不能与原密码相同",
        # -- staff / supplier admin -----------------------------------------
        "staff.username_rule": "账号需为 3–32 位小写字母、数字或 . _ -，并以字母或数字开头",
        "staff.password_min": "密码至少 8 位",
        "staff.password_max": "密码最多 128 位",
        "staff.password_no_edge_space": "密码首尾不能是空格",
        "staff.password_same_as_username": "密码不能与账号相同",
        "staff.keep_one_admin": "至少要保留一个启用状态的管理员",
        "staff.supplier_must_bind": "上剧方账号必须绑定供应商",
        "staff.supplier_has_account": "该供应商已有账号",
        "staff.only_supplier_can_bind": "只有上剧方账号可以绑定供应商",
        "staff.account_exists": "账号已存在",
        "staff.cannot_change_own_role": "不能修改自己的角色",
        "staff.supplier_role_locked": "上剧方账号的角色不可修改，请改绑供应商",
        "staff.cannot_disable_self": "不能禁用自己",
        "staff.supplier_name_exists": "供应商名称已存在",
        "staff.supplier_share_init": "初始比例",
        "staff.supplier_disabled_reason": "供应商停用",
        # -- drama -----------------------------------------------------------
        "drama.title_exists": "同名剧已存在",
        "drama.title_exists_partner": "你已有同名剧",
        "drama.title_required": "剧名不能为空",
        "drama.episode_exists": "第 {number} 集已存在",
        "drama.episode_exists_change": "第 {number} 集已存在，请换一个集数",
        "drama.episode_default_title": "第 {number} 集",
        "drama.max_episodes": "单部剧最多 {max} 集",
        "drama.status_not_draft": "剧集当前状态 {status}，上剧方只能编辑草稿",
        "drama.in_review_locked": "审核中不可修改",
        "drama.invalid_tags": "存在无效的标签",
        "drama.offline_tags": "存在已下线的标签",
        "drama.episode_has_video": "已上传视频的分集不能删除",
        "drama.no_video_preview": "该集还没有可预览的视频",
        "drama.has_video": "已上传视频的剧集不能删除",
        "drama.only_draft_submit": "只有草稿可以提交审核",
        "drama.submitted": "已提交，等待审核",
        "drama.cover_required": "请先上传封面",
        "drama.synopsis_too_short": "简介至少 30 字",
        "drama.episodes_required": "至少上传 1 集",
        "drama.episodes_not_ready": "第 {numbers} 集尚未完成转码",
        "drama.free_count_range": "免费集数需在 {floor}–{total} 之间",
        "drama.not_found": "剧集不存在",
        "drama.not_pending": "当前状态 {state}，不是待审核",
        "drama.review_only_partner": "该接口只用于上剧方剧集",
        "drama.not_approved_publish": "审核通过后才能上架",
        "drama.no_episodes_publish": "没有分集，无法上架",
        "drama.episode_not_ready": "第 {number} 集未就绪",
        "drama.reject_reason_required": "驳回必须填写原因",
        # -- review email ----------------------------------------------------
        "review.approved": "已通过",
        "review.rejected": "已驳回",
        "review.note_prefix": "\n\n运营备注：{note}",
        "review.email_footer": "\n\n登录 MiniTV 合作方后台查看详情。",
        "review.email_subject": "MiniTV 审核结果：{title} {verdict}",
        "review.email_body": "《{title}》{verdict}。",
        # -- episode / upload -------------------------------------------------
        "episode.current_not_transcoding": "分集当前是 {status}，只有 transcoding 状态可以续传",
        "episode.no_resumable": "没有可续传的上传会话",
        "episode.only_transcoding_resume": "只有转码中的分集可以续传",
        "episode.only_shell_delete": "第 {number} 集是 {status}，只有空壳可以删；请先下架",
        "episode.no_fields": "没有需要更新的字段",
        "episode.title_required": "标题不能为空",
        # -- cover ------------------------------------------------------------
        "cover.storage_unconfigured": "图片存储未配置，可先填写封面链接",
        "cover.size_range": "封面大小需在 1 字节到 5MB 之间",
        "cover.formats": "封面只支持 JPG、PNG、WebP",
        "cover.upload_failed": "封面上传失败：{exc}",
        # -- user profile ------------------------------------------------------
        "user.nickname_required": "昵称不能为空",
        "user.email_invalid": "邮箱格式不正确",
        "user.email_bound": "该邮箱已被其他用户绑定",
        "user.gender_invalid": "性别取值不合法",
        # -- billing ------------------------------------------------------------
        "billing.grant_days_range": "天数需在 1–{max} 之间",
        "billing.grant_reason_required": "请填写调整原因",
        "billing.has_auto_renew": "该用户有自动续费订阅，请改用「顺延」",
        "billing.cancel_reason_required": "请填写取消原因",
        "billing.no_active_membership": "该用户当前没有有效会员",
        "billing.no_renew_concept": "时长包没有续费概念，请选择「立即收回」",
        "plan.weekly_name": "周卡",
        "plan.monthly_name": "月卡",
        "plan.yearly_name": "年卡",
        # -- rewards (resolved per request via REWARD_TASK_I18N) ----------------
        "reward.checkin_name": "7 天签到梯度",
        "reward.checkin_desc": "连续签到第 1-7 天依次发放；中断后从第 1 天重新计算",
        "reward.register_name": "注册奖励",
        "reward.register_desc": "邮箱注册成功后一次性发放",
        "reward.bind_email_name": "绑定邮箱",
        "reward.bind_email_desc": "首次绑定邮箱时发放，只发一次",
        "reward.bind_facebook_name": "绑定 Facebook",
        "reward.bind_facebook_desc": "首次绑定 Facebook 时发放，只发一次",
        "reward.ad_name": "每日广告奖励",
        "reward.ad_desc": "每天可领一次，同日重复请求不二次入账",
        "reward.like5_name": "点赞 5 部剧",
        "reward.like5_desc": "当天给 5 部不同的剧点赞，每日可领一次",
        "reward.favorite5_name": "收藏 5 部剧",
        "reward.favorite5_desc": "当天收藏 5 部不同的剧，每日可领一次",
        "reward.watch8_name": "看完 8 集",
        "reward.watch8_desc": "当天看完 8 集不同的剧集，每日可领一次",
        # -- api keys ------------------------------------------------------------
        "apikey.rate_limited": "密钥超过 {limit} 次/分钟限制",
        "apikey.invalid": "API key 无效",
        "apikey.revoked": "API key 已被撤销",
        "apikey.expired": "API key 已过期，请轮换",
        "apikey.scope_missing": "该密钥缺少 {scopes} 权限",
        "apikey.scope_required": "至少选择一个权限；如需跟随账号角色请省略 scopes 字段",
        "apikey.unknown_scope": "unknown scope: {unknown}（可选 {choices}）",
        "apikey.forbidden_scope": "该角色不能授予 scope: {forbidden}（可选 {choices}）",
        "apikey.ttl_allowed": "有效期只能是 {allowed} 天，或 null 表示长期",
        "apikey.name_conflict": "该账号下已有同名密钥",
        "apikey.account_disabled_issue": "账号已禁用，无法签发密钥",
        "apikey.revoked_no_edit": "已撤销的密钥不能再修改",
        "apikey.revoked_no_rotate": "已撤销的密钥不能轮换，请新建",
        "apikey.used_no_delete": "密钥已被使用，是审计证据，请改为撤销",
        "apikey.not_found": "密钥不存在",
        # -- moderation ------------------------------------------------------------
        "moderation.no_crypto": "缺少 cryptography 依赖，无法保存密钥",
        "moderation.key_format": "密钥格式不正确：至少 8 位且不能包含空格",
        "moderation.key_unconfigured": "自动审核密钥未配置，请先在后台「自动审核」页填写",
        "moderation.request_failed": "请求失败：{exc}",
        "moderation.bad_response": "响应结构异常",
        "moderation.truncated": "模型输出被截断，请调大 max_tokens 或换更小的模型",
        # -- settlements ------------------------------------------------------------
        "settlement.only_draft_confirm": "只有草稿可以确认",
        "settlement.confirm_first": "请先确认对账单",
        # -- publish ------------------------------------------------------------
        "publish.not_approved": "上剧方剧集需审核通过后才能上架",
        "publish.delete_irreversible": "删除后不可恢复",
        # -- seed ------------------------------------------------------------------
        "seed.display_name_admin": "管理员",
    },
    "vi": {
        # -- auth / session -------------------------------------------------
        "auth.missing_credential": "Thiếu header Authorization",
        "auth.session_store_unavailable": (
            "Kho lưu trữ phiên không khả dụng (Redis chưa kết nối). "
            "Hãy khởi động minitv-redis trước: chạy docker compose up -d "
            "ở thư mục gốc của repo rồi thử lại."
        ),
        "auth.session_unavailable": "Kho lưu trữ phiên không khả dụng",
        "auth.invalid_session": "Phiên không hợp lệ hoặc đã hết hạn",
        "auth.staff_only": "API này chỉ dành cho nhân viên nền tảng",
        "auth.partner_only": "API này chỉ dành cho bên đưa phim",
        "auth.partner_scope_denied": "Khóa của bên đưa phim chỉ được truy cập API đối tác",
        "auth.session_required": "API này chỉ gọi được bằng phiên đăng nhập",
        "auth.supplier_disabled": "Bên đưa phim đã bị vô hiệu hóa",
        "auth.use_api_key": "Hãy gọi bằng API Key",
        "auth.account_disabled": "Tài khoản gắn với khóa này đã bị vô hiệu hóa",
        "auth.password_wrong": "Mật khẩu cũ không đúng",
        "auth.password_same": "Mật khẩu mới không được trùng mật khẩu cũ",
        # -- staff / supplier admin -----------------------------------------
        "staff.username_rule": (
            "Tài khoản phải dài 3–32 ký tự, chỉ gồm chữ thường, số hoặc . _ -, "
            "và bắt đầu bằng chữ hoặc số"
        ),
        "staff.password_min": "Mật khẩu phải có ít nhất 8 ký tự",
        "staff.password_max": "Mật khẩu tối đa 128 ký tự",
        "staff.password_no_edge_space": "Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng",
        "staff.password_same_as_username": "Mật khẩu không được trùng với tài khoản",
        "staff.keep_one_admin": "Phải giữ lại ít nhất một quản trị viên đang hoạt động",
        "staff.supplier_must_bind": "Tài khoản bên đưa phim phải gắn với một nhà cung cấp",
        "staff.supplier_has_account": "Bên đưa phim này đã có tài khoản",
        "staff.only_supplier_can_bind": "Chỉ tài khoản bên đưa phim mới được gắn với nhà cung cấp",
        "staff.account_exists": "Tài khoản đã tồn tại",
        "staff.cannot_change_own_role": "Không được sửa vai trò của chính mình",
        "staff.supplier_role_locked": "Không được sửa vai trò của tài khoản bên đưa phim, hãy gắn lại nhà cung cấp",
        "staff.cannot_disable_self": "Không được vô hiệu hóa chính mình",
        "staff.supplier_name_exists": "Tên bên đưa phim đã tồn tại",
        "staff.supplier_share_init": "Tỉ lệ ban đầu",
        "staff.supplier_disabled_reason": "Bên đưa phim bị vô hiệu hóa",
        # -- drama -----------------------------------------------------------
        "drama.title_exists": "Đã có phim trùng tên",
        "drama.title_exists_partner": "Bạn đã có phim trùng tên",
        "drama.title_required": "Tên phim không được để trống",
        "drama.episode_exists": "Tập {number} đã tồn tại",
        "drama.episode_exists_change": "Tập {number} đã tồn tại, hãy chọn số tập khác",
        "drama.episode_default_title": "Tập {number}",
        "drama.max_episodes": "Mỗi phim tối đa {max} tập",
        "drama.status_not_draft": "Phim đang ở trạng thái {status}, bên đưa phim chỉ được sửa bản nháp",
        "drama.in_review_locked": "Đang duyệt nên không được sửa",
        "drama.invalid_tags": "Có thẻ tag không hợp lệ",
        "drama.offline_tags": "Có thẻ tag đã bị gỡ",
        "drama.episode_has_video": "Không được xóa tập đã tải video lên",
        "drama.no_video_preview": "Tập này chưa có video để xem trước",
        "drama.has_video": "Không được xóa phim đã tải video lên",
        "drama.only_draft_submit": "Chỉ bản nháp mới được gửi duyệt",
        "drama.submitted": "Đã gửi, đang chờ duyệt",
        "drama.cover_required": "Hãy tải ảnh bìa lên trước",
        "drama.synopsis_too_short": "Giới thiệu phải có ít nhất 30 ký tự",
        "drama.episodes_required": "Hãy tải lên ít nhất 1 tập",
        "drama.episodes_not_ready": "Tập {numbers} chưa chuyển mã xong",
        "drama.free_count_range": "Số tập miễn phí phải nằm trong khoảng {floor}–{total}",
        "drama.not_found": "Phim không tồn tại",
        "drama.not_pending": "Trạng thái hiện tại là {state}, không phải chờ duyệt",
        "drama.review_only_partner": "API này chỉ dùng cho phim của bên đưa phim",
        "drama.not_approved_publish": "Phải được duyệt thì mới phát hành được",
        "drama.no_episodes_publish": "Chưa có tập nào, không phát hành được",
        "drama.episode_not_ready": "Tập {number} chưa sẵn sàng",
        "drama.reject_reason_required": "Từ chối thì phải ghi lý do",
        # -- review email ----------------------------------------------------
        "review.approved": "Đã duyệt",
        "review.rejected": "Đã từ chối",
        "review.note_prefix": "\n\nGhi chú vận hành: {note}",
        "review.email_footer": "\n\nĐăng nhập vào trang quản trị đối tác MiniTV để xem chi tiết.",
        "review.email_subject": "MiniTV — Kết quả duyệt: {title} {verdict}",
        "review.email_body": "Phim “{title}”: {verdict}.",
        # -- episode / upload -------------------------------------------------
        "episode.current_not_transcoding": "Tập hiện đang ở trạng thái {status}, chỉ tập đang chuyển mã mới tiếp tục tải lên được",
        "episode.no_resumable": "Không có phiên tải lên nào để tiếp tục",
        "episode.only_transcoding_resume": "Chỉ tập đang chuyển mã mới tiếp tục tải lên được",
        "episode.only_shell_delete": "Tập {number} đang ở trạng thái {status}, chỉ xóa được tập rỗng; hãy gỡ xuống trước",
        "episode.no_fields": "Không có trường nào cần cập nhật",
        "episode.title_required": "Tiêu đề không được để trống",
        # -- cover ------------------------------------------------------------
        "cover.storage_unconfigured": "Chưa cấu hình kho ảnh, hãy nhập link ảnh bìa trước",
        "cover.size_range": "Ảnh bìa phải có dung lượng từ 1 byte đến 5MB",
        "cover.formats": "Ảnh bìa chỉ hỗ trợ JPG, PNG, WebP",
        "cover.upload_failed": "Tải ảnh bìa lên thất bại: {exc}",
        # -- user profile ------------------------------------------------------
        "user.nickname_required": "Biệt danh không được để trống",
        "user.email_invalid": "Định dạng email không đúng",
        "user.email_bound": "Email này đã được người dùng khác liên kết",
        "user.gender_invalid": "Giá trị giới tính không hợp lệ",
        # -- billing ------------------------------------------------------------
        "billing.grant_days_range": "Số ngày phải nằm trong khoảng 1–{max}",
        "billing.grant_reason_required": "Hãy nhập lý do điều chỉnh",
        "billing.has_auto_renew": "Người dùng này đang có gói tự động gia hạn, hãy chọn “Gia hạn tiếp” thay thế",
        "billing.cancel_reason_required": "Hãy nhập lý do hủy",
        "billing.no_active_membership": "Người dùng này hiện không có hội viên hiệu lực",
        "billing.no_renew_concept": "Gói thời hạn không có khái niệm gia hạn, hãy chọn “Thu hồi ngay”",
        "plan.weekly_name": "Thẻ tuần",
        "plan.monthly_name": "Thẻ tháng",
        "plan.yearly_name": "Thẻ năm",
        # -- rewards (resolved per request via REWARD_TASK_I18N) ----------------
        "reward.checkin_name": "Thang điểm danh 7 ngày",
        "reward.checkin_desc": "Phát lần lượt từ ngày điểm danh 1–7; nếu gián đoạn thì tính lại từ ngày 1",
        "reward.register_name": "Thưởng đăng ký",
        "reward.register_desc": "Phát một lần khi đăng ký bằng email thành công",
        "reward.bind_email_name": "Liên kết email",
        "reward.bind_email_desc": "Phát khi liên kết email lần đầu, chỉ phát một lần",
        "reward.bind_facebook_name": "Liên kết Facebook",
        "reward.bind_facebook_desc": "Phát khi liên kết Facebook lần đầu, chỉ phát một lần",
        "reward.ad_name": "Thưởng quảng cáo hằng ngày",
        "reward.ad_desc": "Mỗi ngày nhận một lần, yêu cầu trùng trong ngày không được cộng thêm",
        "reward.like5_name": "Thích 5 phim",
        "reward.like5_desc": "Thích 5 phim khác nhau trong ngày, mỗi ngày nhận một lần",
        "reward.favorite5_name": "Lưu 5 phim",
        "reward.favorite5_desc": "Lưu 5 phim khác nhau trong ngày, mỗi ngày nhận một lần",
        "reward.watch8_name": "Xem hết 8 tập",
        "reward.watch8_desc": "Xem hết 8 tập của các phim khác nhau trong ngày, mỗi ngày nhận một lần",
        # -- api keys ------------------------------------------------------------
        "apikey.rate_limited": "Khóa đã vượt giới hạn {limit} lần/phút",
        "apikey.invalid": "API key không hợp lệ",
        "apikey.revoked": "API key đã bị thu hồi",
        "apikey.expired": "API key đã hết hạn, hãy xoay khóa",
        "apikey.scope_missing": "Khóa này thiếu quyền {scopes}",
        "apikey.scope_required": "Hãy chọn ít nhất một quyền; nếu muốn theo vai trò của tài khoản thì bỏ qua trường scopes",
        "apikey.unknown_scope": "scope không xác định: {unknown} (có thể chọn {choices})",
        "apikey.forbidden_scope": "Vai trò này không được cấp scope: {forbidden} (có thể chọn {choices})",
        "apikey.ttl_allowed": "Thời hạn chỉ được là {allowed} ngày, hoặc null để dùng lâu dài",
        "apikey.name_conflict": "Tài khoản này đã có khóa trùng tên",
        "apikey.account_disabled_issue": "Tài khoản đã bị vô hiệu hóa, không phát hành khóa được",
        "apikey.revoked_no_edit": "Không sửa được khóa đã bị thu hồi",
        "apikey.revoked_no_rotate": "Không xoay được khóa đã bị thu hồi, hãy tạo mới",
        "apikey.used_no_delete": "Khóa đã được sử dụng, đây là bằng chứng kiểm toán, hãy thu hồi thay vì xóa",
        "apikey.not_found": "Khóa không tồn tại",
        # -- moderation ------------------------------------------------------------
        "moderation.no_crypto": "Thiếu thư viện cryptography, không lưu khóa được",
        "moderation.key_format": "Định dạng khóa không đúng: ít nhất 8 ký tự và không chứa khoảng trắng",
        "moderation.key_unconfigured": "Chưa cấu hình khóa kiểm duyệt tự động, hãy nhập trước ở trang “Kiểm duyệt tự động” trong admin",
        "moderation.request_failed": "Yêu cầu thất bại: {exc}",
        "moderation.bad_response": "Cấu trúc phản hồi bất thường",
        "moderation.truncated": "Đầu ra của model đã bị cắt ngắn, hãy tăng max_tokens hoặc đổi sang model nhỏ hơn",
        # -- settlements ------------------------------------------------------------
        "settlement.only_draft_confirm": "Chỉ bản nháp mới xác nhận được",
        "settlement.confirm_first": "Hãy xác nhận bảng đối soát trước",
        # -- publish ------------------------------------------------------------
        "publish.not_approved": "Phim của bên đưa phim phải được duyệt thì mới phát hành được",
        "publish.delete_irreversible": "Xóa xong không khôi phục được",
        # -- seed ------------------------------------------------------------------
        "seed.display_name_admin": "Quản trị viên",
    },
}
