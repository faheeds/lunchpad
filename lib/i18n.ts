import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // For now, only English is supported
  const locale = "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
