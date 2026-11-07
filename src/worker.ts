import { handle } from '@astrojs/cloudflare/handler';
import { runCalendarCron } from './lib/calendar-jobs';

export default {
  fetch: handle,
  async scheduled(controller, _env, ctx) {
    ctx.waitUntil(runCalendarCron(controller.cron));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
