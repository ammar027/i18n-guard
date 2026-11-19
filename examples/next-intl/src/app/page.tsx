import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("Home");
  return (
    <main>
      <h1>{t("title")}</h1>
      <button title={t("cta")}>{t("cta")}</button>
    </main>
  );
}
