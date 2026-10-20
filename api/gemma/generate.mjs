import { gemmaProxy } from "../../server/gemmaProxy.mjs";
export const config = { maxDuration: 100 };
export default function handler(req, res) {
  return gemmaProxy(req, res);
}
