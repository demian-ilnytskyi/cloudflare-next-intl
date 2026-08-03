"use server";

import createServerErrorAction from "cloudflare-next-intl/createServerErrorAction";
import intlConfig from "./intl_config";

export const reportClientError = createServerErrorAction(intlConfig);
