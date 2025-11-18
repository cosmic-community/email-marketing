import { Settings, UpdateSettingsData } from "@/types";
import { cosmic } from "./client";
import { hasStatus } from "./utils";

// Settings
export async function getSettings(): Promise<Settings | null> {
  try {
    const { objects } = await cosmic.objects
      .find({ type: "settings" })
      .props(["id", "title", "slug", "metadata", "created_at", "modified_at"])
      .depth(1);

    if (objects.length === 0) {
      return null;
    }

    return objects[0] as Settings;
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null;
    }
    console.error("Error fetching settings:", error);
    throw new Error("Failed to fetch settings");
  }
}

export async function updateSettings(
  data: UpdateSettingsData & {
    brand_logo?: { url: string; imgix_url: string } | null;
  }
): Promise<Settings> {
  try {
    // First try to get existing settings
    const existingSettings = await getSettings();

    if (existingSettings) {
      // Update existing settings - ONLY include changed fields
      const metadataUpdates: any = {};

      if (data.from_name !== undefined)
        metadataUpdates.from_name = data.from_name;
      if (data.from_email !== undefined)
        metadataUpdates.from_email = data.from_email;
      if (data.reply_to_email !== undefined)
        metadataUpdates.reply_to_email = data.reply_to_email;
      if (data.company_name !== undefined)
        metadataUpdates.company_name = data.company_name;
      if (data.company_address !== undefined)
        metadataUpdates.company_address = data.company_address;
      if (data.website_url !== undefined)
        metadataUpdates.website_url = data.website_url;
      if (data.support_email !== undefined)
        metadataUpdates.support_email = data.support_email;
      if (data.brand_guidelines !== undefined)
        metadataUpdates.brand_guidelines = data.brand_guidelines;
      if (data.primary_brand_color !== undefined)
        metadataUpdates.primary_brand_color = data.primary_brand_color;
      if (data.secondary_brand_color !== undefined)
        metadataUpdates.secondary_brand_color = data.secondary_brand_color;
      if (data.privacy_policy_url !== undefined)
        metadataUpdates.privacy_policy_url = data.privacy_policy_url;
      if (data.terms_of_service_url !== undefined)
        metadataUpdates.terms_of_service_url = data.terms_of_service_url;
      if (data.google_analytics_id !== undefined)
        metadataUpdates.google_analytics_id = data.google_analytics_id;
      if (data.email_signature !== undefined)
        metadataUpdates.email_signature = data.email_signature;
      if (data.test_emails !== undefined)
        metadataUpdates.test_emails = data.test_emails;

      // Handle brand logo
      if (data.brand_logo !== undefined) {
        metadataUpdates.brand_logo = data.brand_logo?.url?.split("/").pop();
      }

      if (data.ai_tone !== undefined) {
        metadataUpdates.ai_tone = {
          key: data.ai_tone.toLowerCase(),
          value: data.ai_tone,
        };
      }

      const { object } = await cosmic.objects.updateOne(existingSettings.id, {
        metadata: metadataUpdates,
      });

      return object as Settings;
    } else {
      // Create new settings
      const { object } = await cosmic.objects.insertOne({
        title: "Email Marketing Settings",
        type: "settings",
        metadata: {
          from_name: data.from_name,
          from_email: data.from_email,
          reply_to_email: data.reply_to_email || data.from_email,
          company_name: data.company_name,
          company_address: data.company_address || "",
          website_url: data.website_url || "",
          support_email: data.support_email || "",
          brand_guidelines: data.brand_guidelines || "",
          primary_brand_color: data.primary_brand_color || "#007bff",
          secondary_brand_color: data.secondary_brand_color || "#6c757d",
          brand_logo: data.brand_logo || null,
          ai_tone: {
            key: (data.ai_tone || "professional").toLowerCase(),
            value: data.ai_tone || "Professional",
          },
          privacy_policy_url: data.privacy_policy_url || "",
          terms_of_service_url: data.terms_of_service_url || "",
          google_analytics_id: data.google_analytics_id || "",
          email_signature: data.email_signature || "",
          test_emails: data.test_emails || "",
        },
      });

      return object as Settings;
    }
  } catch (error) {
    console.error("Error updating settings:", error);
    throw new Error("Failed to update settings");
  }
}

// Add alias function for createOrUpdateSettings
export async function createOrUpdateSettings(
  data: UpdateSettingsData & {
    brand_logo?: { url: string; imgix_url: string } | null;
  }
): Promise<Settings> {
  return updateSettings(data);
}

