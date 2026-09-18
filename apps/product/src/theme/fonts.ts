import { useFonts } from "expo-font";
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
} from "@expo-google-fonts/barlow";
import {
  BarlowCondensed_700Bold_Italic,
  BarlowCondensed_800ExtraBold_Italic,
} from "@expo-google-fonts/barlow-condensed";

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowCondensed_700Bold_Italic,
    BarlowCondensed_800ExtraBold_Italic,
  });
  return { loaded: loaded || !!error, error };
}
