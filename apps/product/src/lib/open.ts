import { Linking, Platform } from "react-native";

// Open a URL that we only know after an API call. Phone browsers block window.open once the click
// has finished, so open the tab synchronously inside the click and point it afterwards; if even
// that is blocked, navigate the current tab instead.
export async function openExternal(getUrl: () => Promise<string>) {
  if (Platform.OS !== "web") {
    const url = await getUrl();
    await Linking.openURL(url);
    return;
  }
  const tab = window.open("", "_blank", "noopener");
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
