/* Public Web Push client configuration.
   Keep the VAPID private key only on the push server, never in this file. */
window.SAKINA_PUSH_CONFIG = window.SAKINA_PUSH_CONFIG || {
  vapidPublicKey: "",
  subscribeEndpoint: ""
};
