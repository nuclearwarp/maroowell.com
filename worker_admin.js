import routeWorker from "./worker.js";

export default {
  async fetch(request, env, ctx) {
    return routeWorker.fetch(request, env, ctx);
  },
};
