import { Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

export function App({ name, count }: { name: string; count: number }) {
  const { t } = useTranslation("common");
  return (
    <View>
      <Text>{t("welcome", { name })}</Text>
      <TextInput placeholder="Search documents" accessibilityLabel={t("save")} />
      <Text>{t("documents", { count })}</Text>
      <Text>{t("empty.state")}</Text>
    </View>
  );
}
