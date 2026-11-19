import { vue } from "@ammar-multani/i18n-guard/eslint";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

export default [...vue({ vuePlugin, vueParser })];
