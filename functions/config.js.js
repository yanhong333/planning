import { clientConfigResponse } from "./_config.js";

export async function onRequestGet({ env }) {
  return clientConfigResponse(env);
}
