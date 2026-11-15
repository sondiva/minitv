import { useEffect, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ApiOutlined,
  ExperimentOutlined,
  KeyOutlined,
  ReloadOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";
import { useConfirm } from "../confirm";
import { t } from "../copy";

/**
 * 自动审核配置：用 OpenAI 模型在评论落库前给出 allow / review / block 判定。
 * 密钥可以直接在本页填写（加密后存库、只回显尾号），留空/清除时回退到服务器
 * 环境变量 OPENAI_API_KEY。
 */

type KeyStatus = {
  configured: boolean;
  masked: string;
  source: "database" | "env" | "none";
  name: string;
};

type Settings = {
  enabled: boolean;
  base_url: string;
  model: string;
  categories: string[];
  system_prompt: string;
  approve_threshold: number;
  block_threshold: number;
  fallback_action: "pending" | "approved";
  timeout_seconds: number;
  updated_at: string | null;
  updated_by: number | null;
  key: KeyStatus;
  key_from_database: boolean;
  key_env_configured: boolean;
  default_base_url: string;
  default_categories: string[];
  default_prompt: string;
};

type TestResult = {
  enabled: boolean;
  status: string;
  result: {
    verdict: string;
    score: number;
    reason: string;
    model: string;
    latency_ms: number;
  };
};

function CATEGORY_LABELS(): Record<string, string> { return {
  sexual: t("moderation.sexual"),
  violence: t("moderation.violence"),
  hate: t("moderation.hate"),
  harassment: t("moderation.harassment"),
  spam: t("moderation.spam"),
  privacy: t("moderation.privacy"),
  illegal: t("moderation.illegal"),
};; }

const MODEL_OPTIONS = [
  { value: "deepseek-flash" },
  { value: "gpt-4o-mini" },
  { value: "gpt-4.1-mini" },
  { value: "gpt-4o" },
];

function VERDICT_META(): Record<string, { color: string; label: string }> { return {
  allow: { color: "green", label: t("moderation.approve") },
  review: { color: "orange", label: t("moderation.escalate_manual") },
  block: { color: "red", label: t("moderation.block") },
};; }

function STATUS_LABEL(): Record<string, string> { return {
  approved: t("moderation.publish_directly"),
  pending: t("moderation.to_pending_review"),
  deleted: t("moderation.delete_directly"),
};; }

const SAMPLE = "Best episode yet! Where can I watch the next one?";

export default function Moderation() {
  const [form] = Form.useForm<Settings>();
  const { confirm, confirmModal } = useConfirm();
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testText, setTestText] = useState(SAMPLE);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyChecking, setKeyChecking] = useState(false);
  const [keyCheck, setKeyCheck] = useState<TestResult | null>(null);

  const apply = (next: Settings) => {
    setData(next);
    form.setFieldsValue(next);
  };

  const load = async () => {
    setLoading(true);
    try {
      apply(await api<Settings>("/admin/v1/moderation/settings"));
    } catch (e) {
      message.error(t("moderation.load_config_failed", {v0: errorText(e)}));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (values: Settings) => {
    setSaving(true);
    try {
      const next = await api<Settings>("/admin/v1/moderation/settings", {
        method: "POST",
        body: JSON.stringify({
          enabled: values.enabled,
          base_url: values.base_url,
          model: values.model,
          categories: values.categories ?? [],
          system_prompt: values.system_prompt ?? "",
          approve_threshold: values.approve_threshold,
          block_threshold: values.block_threshold,
          fallback_action: values.fallback_action,
          timeout_seconds: values.timeout_seconds,
        }),
      });
      apply(next);
      message.success(
        next.enabled ? t("moderation.saved_auto_judge") : t("moderation.saved_auto_off"),
      );
    } catch (e) {
      message.error(t("stagepages.save_failed", {v0: errorText(e)}));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testText.trim()) {
      message.warning(t("moderation.enter_comment_first"));
      return;
    }
    setTesting(true);
    try {
      setTestResult(
        await api<TestResult>("/admin/v1/moderation/test", {
          method: "POST",
          body: JSON.stringify({ text: testText }),
        }),
      );
    } catch (e) {
      message.error(t("moderation.test_failed", {v0: errorText(e)}));
    } finally {
      setTesting(false);
    }
  };

  /** Only the policy fields, so key changes never carry unsaved prompt edits. */
  const policyBody = (source: Settings) => ({
    enabled: source.enabled,
    base_url: source.base_url,
    model: source.model,
    categories: source.categories ?? [],
    system_prompt: source.system_prompt ?? "",
    approve_threshold: source.approve_threshold,
    block_threshold: source.block_threshold,
    fallback_action: source.fallback_action,
    timeout_seconds: source.timeout_seconds,
  });

  const closeKey = () => {
    setKeyOpen(false);
    setKeyDraft("");
    setKeyCheck(null);
  };

  const submitKey = async (payload: { api_key?: string; clear_api_key?: boolean }) => {
    if (!data) return;
    setKeySaving(true);
    try {
      const next = await api<Settings>("/admin/v1/moderation/settings", {
        method: "POST",
        body: JSON.stringify({ ...policyBody(data), ...payload }),
      });
      apply(next);
      closeKey();
      message.success(
        payload.clear_api_key
          ? t("moderation.key_cleared_env")
          : t("moderation.key_saved_active", {v0: next.key.masked}),
      );
    } catch (e) {
      message.error(t("moderation.key_save_failed", {v0: errorText(e)}));
    } finally {
      setKeySaving(false);
    }
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (value.length < 8) {
      message.warning(t("moderation.key_min_length"));
      return;
    }
    void submitKey({ api_key: value });
  };

  const clearKey = () => {
    confirm({
      title: t("moderation.clear_saved_key"),
      content: data?.key_env_configured
        ? t("moderation.clear_fallback_env")
        : t("moderation.clear_fallback_note"),
      danger: true,
      okText: t("moderation.clear"),
      onOk: () => submitKey({ clear_api_key: true }),
    });
  };

  /** Verify the pasted key with a sample comment; nothing is written. */
  const checkKey = async () => {
    const value = keyDraft.trim();
    if (value.length < 8) {
      message.warning(t("moderation.paste_key_first"));
      return;
    }
    setKeyChecking(true);
    setKeyCheck(null);
    try {
      setKeyCheck(
        await api<TestResult>("/admin/v1/moderation/test", {
          method: "POST",
          body: JSON.stringify({ text: SAMPLE, api_key: value }),
        }),
      );
    } catch (e) {
      message.error(t("moderation.verify_failed", {v0: errorText(e)}));
    } finally {
      setKeyChecking(false);
    }
  };

  const key = data?.key;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={20}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space direction="vertical" size={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("moderation.auto_review")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("moderation.judge_flow_note")}
          </Typography.Text>
        </Space>
        <Space>
          <Button icon={<ExperimentOutlined />} onClick={() => setTestOpen(true)}>
            {t("moderation.test_judge")}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            {t("common.refresh")}
          </Button>
        </Space>
      </div>

      {key?.configured ? (
        <Alert
          type="success"
          showIcon
          icon={<KeyOutlined />}
          message={t("moderation.key_configured", {
            v0: key.masked,
            v1:
              key.source === "database"
                ? t("moderation.configured_in_backend")
                : t("moderation.server_env_var"),
          })}
          description={t("moderation.key_replace_note")}
          action={
            <Button size="small" icon={<KeyOutlined />} onClick={() => setKeyOpen(true)}>
              {t("moderation.replace_key")}
            </Button>
          }
          style={{ borderRadius: 8 }}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          icon={<KeyOutlined />}
          message={t("moderation.key_not_configured")}
          description={t("moderation.key_missing_note")}
          action={
            <Button size="small" type="primary" icon={<KeyOutlined />} onClick={() => setKeyOpen(true)}>
              {t("moderation.configure_key")}
            </Button>
          }
          style={{ borderRadius: 8 }}
        />
      )}

      <Form form={form} layout="vertical" onFinish={save} initialValues={{ enabled: false }}>
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          <Card
            size="small"
            title={
              <Space size={8}>
                <ApiOutlined />
                <span>{t("moderation.model_switches")}</span>
              </Space>
            }
            extra={
              <Form.Item name="enabled" valuePropName="checked" noStyle>
                <Switch checkedChildren={t("common.enable")} unCheckedChildren={t("groups.deactivate")} />
              </Form.Item>
            }
            style={{ borderRadius: 10 }}
          >
            <Row gutter={[16, 0]}>
              <Col xs={24} md={10}>
                <Form.Item
                  label={t("moderation.model")}
                  name="model"
                  rules={[{ required: true, message: t("moderation.enter_model_name") }]}
                  extra={t("moderation.model_requirement")}
                >
                  <AutoComplete
                    options={MODEL_OPTIONS}
                    placeholder="deepseek-flash"
                    filterOption={(input, option) =>
                      String(option?.value ?? "").includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={14}>
                <Form.Item
                  label={t("moderation.base_url")}
                  name="base_url"
                  rules={[
                    { required: true, message: t("moderation.enter_base_url") },
                    { pattern: /^https?:\/\//, message: t("moderation.base_url_must_http") },
                  ]}
                  extra={t("moderation.base_url_hint")}
                >
                  <Input placeholder="https://codex.apiz.ai/v1" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label={t("moderation.timeout_seconds")} name="timeout_seconds">
                  <InputNumber min={1} max={30} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item
                  label={t("moderation.fallback_when_unavailable")}
                  name="fallback_action"
                  extra={t("moderation.fallback_hint")}
                >
                  <Segmented
                    options={[
                      { label: t("moderation.to_pending_review"), value: "pending" },
                      { label: t("moderation.publish_directly"), value: "approved" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            size="small"
            title={
              <Space size={8}>
                <SafetyCertificateOutlined />
                <span>{t("moderation.review_rules")}</span>
              </Space>
            }
            extra={
              <Button
                size="small"
                onClick={() => form.setFieldValue("system_prompt", data?.default_prompt ?? "")}
              >
                {t("moderation.restore_default_rules")}
              </Button>
            }
            style={{ borderRadius: 10 }}
          >
            <Form.Item
              label={t("moderation.review_dimensions")}
              name="categories"
              extra={t("moderation.dimensions_hint")}
            >
              <Checkbox.Group
                options={(data?.default_categories ?? Object.keys(CATEGORY_LABELS())).map((value) => ({
                  value,
                  label: CATEGORY_LABELS()[value] ?? value,
                }))}
              />
            </Form.Item>

            <Form.Item
              label={t("moderation.system_prompt")}
              name="system_prompt"
              rules={[{ required: true, message: t("moderation.system_prompt_required") }]}
              extra={t("moderation.json_requirement")}
            >
              <Input.TextArea rows={11} style={{ fontFamily: "var(--font-mono, monospace)" }} />
            </Form.Item>

            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label={t("moderation.auto_approve_threshold")}
                  name="approve_threshold"
                  extra={t("moderation.approve_threshold_hint")}
                >
                  <InputNumber min={0} max={1} step={0.05} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label={t("moderation.auto_block_threshold")}
                  name="block_threshold"
                  extra={t("moderation.block_threshold_hint")}
                >
                  <InputNumber min={0} max={1} step={0.05} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>

            <Alert
              type="info"
              showIcon
              style={{ borderRadius: 8 }}
              message={t("moderation.judgement_range")}
              description={t("moderation.judgement_range_note")}
            />
          </Card>
        </Space>

        <Space style={{ marginTop: 20 }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
            {t("moderation.save_config")}
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {data?.updated_at
              ? t("moderation.last_saved", {v0: new Date(data.updated_at).toLocaleString()})
              : t("moderation.never_saved")}
          </Typography.Text>
        </Space>
      </Form>

      <Modal
        open={testOpen}
        title={t("moderation.test_auto_judge")}
        okText={t("moderation.start_test")}
        cancelText={t("common.close")}
        confirmLoading={testing}
        onOk={() => void runTest()}
        onCancel={() => setTestOpen(false)}
        width={620}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Typography.Text type="secondary">
            {t("moderation.test_note")}
          </Typography.Text>
          <Input.TextArea
            rows={4}
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            placeholder={t("moderation.enter_comment_text")}
          />
          {testResult && (
            <Card size="small" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Space wrap>
                  <Tag color={VERDICT_META()[testResult.result.verdict]?.color ?? "default"}>
                    {VERDICT_META()[testResult.result.verdict]?.label ?? testResult.result.verdict}
                  </Tag>
                  <Typography.Text>{t("moderation.confidence_score", {v0: testResult.result.score})}</Typography.Text>
                  <Typography.Text type="secondary">
                    {testResult.result.model} · {testResult.result.latency_ms} ms
                  </Typography.Text>
                  <Tag color={testResult.status === "approved" ? "green" : testResult.status === "deleted" ? "red" : "orange"}>
                    {t("moderation.storage_status", {v0: STATUS_LABEL()[testResult.status] ?? testResult.status})}
                  </Tag>
                </Space>
                <Typography.Text>{testResult.result.reason || t("moderation.no_reason")}</Typography.Text>
                {!testResult.enabled && (
                  <Typography.Text type="warning">
                    {t("moderation.auto_disabled_note")}
                  </Typography.Text>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Modal>

      <Modal
        open={keyOpen}
        title={t("moderation.auto_review_key")}
        width={560}
        onCancel={closeKey}
        footer={
          <Space>
            {data?.key_from_database && (
              <Button danger type="text" onClick={clearKey} loading={keySaving}>
                {t("moderation.clear_backend_key")}
              </Button>
            )}
            <Button onClick={closeKey}>{t("common.cancel")}</Button>
            <Button
              type="primary"
              onClick={saveKey}
              loading={keySaving}
              disabled={keyDraft.trim().length < 8}
            >
              {t("moderation.save_key")}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            {t("moderation.key_storage_note")}
          </Typography.Text>
          <Input.Password
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            placeholder="sk-..."
            autoComplete="new-password"
            prefix={<KeyOutlined style={{ color: "#bfbfbf" }} />}
          />
          <Space wrap size={8}>
            <Button size="small" onClick={() => void checkKey()} loading={keyChecking}>
              {t("moderation.verify_key")}
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {data?.key_env_configured
                ? t("moderation.env_key_configured")
                : t("moderation.env_key_missing")}
            </Typography.Text>
          </Space>
          {keyCheck && (
            <Space wrap size={8}>
              <Tag color={VERDICT_META()[keyCheck.result.verdict]?.color ?? "default"}>
                {t("moderation.verified", {v0: VERDICT_META()[keyCheck.result.verdict]?.label ?? keyCheck.result.verdict})}
              </Tag>
              <Typography.Text type="secondary">
                {keyCheck.result.model} · {keyCheck.result.latency_ms} ms
              </Typography.Text>
            </Space>
          )}
        </Space>
      </Modal>

      {confirmModal}
    </Space>
  );
}
