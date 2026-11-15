import { useState } from "react";
import { Form, Input, Modal, Typography, message } from "antd";
import { api, clearToken, errorText } from "../api";
import { useMe } from "../me";
import { t } from "../copy";

/**
 * Self-service password change for the signed-in staff account.
 *
 * On success the backend revokes every session of this account — including the
 * one that made the request — so the only sane follow-up is a full reload into
 * the login page. `clearToken()` alone would not re-render the shell, because
 * `App` reads the token during render rather than from state.
 */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const path =
        me?.role === "partner" ? "/partner/v1/auth/password" : "/admin/v1/auth/password";
      await api(path, {
        method: "POST",
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      });
      clearToken();
      message.success(t("changepasswordmodal.password_changed_relogin"));
      window.location.href = "/login";
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("app.change_password")}
      okText={t("changepasswordmodal.save_and_relogin")}
      cancelText={t("common.cancel")}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={submit}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label={t("changepasswordmodal.current_password")}
          name="old_password"
          rules={[{ required: true, message: t("changepasswordmodal.enter_current_password") }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label={t("changepasswordmodal.new_password")}
          name="new_password"
          rules={[
            { required: true, message: t("changepasswordmodal.enter_new_password") },
            { min: 8, message: t("changepasswordmodal.new_password_min_length") },
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder={t("staff.password_min_length")} />
        </Form.Item>
        <Form.Item
          label={t("changepasswordmodal.confirm_new_password")}
          name="confirm"
          dependencies={["new_password"]}
          rules={[
            { required: true, message: t("changepasswordmodal.enter_new_password_again") },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("new_password") === value) return Promise.resolve();
                return Promise.reject(new Error(t("changepasswordmodal.passwords_mismatch")));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("changepasswordmodal.sessions_expire_note")}
      </Typography.Text>
    </Modal>
  );
}
