/* Public Web Push client configuration.
   Keep the VAPID private key only on the push server, never in this file. */
window.SAKINA_PUSH_CONFIG = window.SAKINA_PUSH_CONFIG || {
  vapidPublicKey: "BOpvMSbJZh8h-f4LYJ7Z_rk1HxVStgoSDbf1fYo2a8gs52gHSpd2O2-vEwAYelVYyilG1tN6-QXPz8P_qnRGokQ",
  subscribeEndpoint: "https://jwkqgjhvblgocgqisdsi.supabase.co/functions/v1/push-subscribe"
};
