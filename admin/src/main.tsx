import React from "react";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import viVN from "antd/locale/vi_VN";
import { getLocale, subscribeLocale, type Locale } from "./copy";
import "./index.css";
import App from "./App";

function Root() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  useEffect(() => subscribeLocale(setLocaleState), []);
  return (
    <ConfigProvider
      locale={locale === "vi" ? viVN : zhCN}
      theme={{ token: { colorPrimary: "#E53B3E", borderRadius: 8 } }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
