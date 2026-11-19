import { Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

export function App({ name, count }: { name: string; count: number }) {
  const { t } = useTranslation("common");
  return (
    <View>
      <Text>{t("welcome", { name })}</Text>
      <TextInput placeholder={t("search.placeholder")} accessibilityLabel={t("save")} />
      <Text>{t("documents", { count })}</Text>
    </View>
  );
}
