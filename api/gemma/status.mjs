import { gemmaProxy } from "../../server/gemmaProxy.mjs";
export default function handler(req, res) {
  return gemmaProxy(req, res);
}
