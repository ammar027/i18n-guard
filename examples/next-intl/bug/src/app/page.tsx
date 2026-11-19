import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("Home");
  return (
    <main>
      <h1>{t("title")}</h1>
      <button title="Create a project">{t("cta")}</button>
      <p>{t("subtitle")}</p>
    </main>
  );
}
