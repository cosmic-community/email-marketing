import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { sendCampaignFunction } from "@/inngest/send-campaign";
import { checkScheduledCampaignsFunction } from "@/inngest/check-scheduled";

// Create an API that serves Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    sendCampaignFunction, // Campaign sending (triggered manually or by scheduler)
    checkScheduledCampaignsFunction, // Scheduled campaign checker (runs every 5 min)
  ],
});
