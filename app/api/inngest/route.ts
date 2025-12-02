import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { sendCampaignFunction } from "@/inngest/send-campaign";
import { checkScheduledCampaignsFunction } from "@/inngest/check-scheduled";

// Configure maximum execution time for this API route
// Inngest functions can run for hours, but the HTTP invocation needs enough time to acknowledge
export const maxDuration = 300; // 5 minutes (maximum for Vercel Pro, 60s for Hobby)

// Create an API that serves Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    sendCampaignFunction, // Campaign sending (triggered manually or by scheduler)
    checkScheduledCampaignsFunction, // Scheduled campaign checker (runs every 5 min)
  ],
});
